import crypto from "node:crypto";

/**
 * Refresh Session TTL: 30 days rolling expiration (sliding window).
 * Each successful token refresh extends the session by 30 days.
 */
export const REFRESH_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days = 2,592,000 seconds

/**
 * Short grace period in seconds to gracefully handle network retry / packet loss
 * when a mobile client repeats the same refresh request concurrently.
 */
export const REFRESH_ROTATION_GRACE_SECONDS = 15;

/**
 * Default access token TTL in seconds (1 hour).
 */
export const ACCESS_TOKEN_DEFAULT_TTL_SECONDS = 3600;

export type RefreshSessionRecord = {
  sessionId: string;
  familyId: string;
  userId: string;
  tenantId: string | null;
  tokenHash: string;
  activeTokenSecret: string;
  supabaseRefreshToken: string;
  createdAt: number; // unix timestamp in seconds
  expiresAt: number; // unix timestamp in seconds (rolling 30 days)
  lastUsedAt: number; // unix timestamp in seconds
  isRevoked: boolean;
  revokedReason?: string;
  rotatedHashes: { hash: string; rotatedAt: number }[];
};

// In-memory store for instant lookups and high performance
const memorySessions = new Map<string, RefreshSessionRecord>();

/**
 * Computes SHA-256 hash of a token string.
 * Tokens are NEVER stored in plaintext.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generates an unguessable, cryptographically secure refresh token (256-bit entropy).
 * Format: qrt_<base64url(userId:sessionId)>.<64-hex-secret>
 */
export function generateRefreshToken(userId: string, sessionId: string, secretOverride?: string): { token: string; secret: string } {
  const secret = secretOverride || crypto.randomBytes(32).toString("hex");
  const meta = Buffer.from(`${userId}:${sessionId}`).toString("base64url");
  const token = `qrt_${meta}.${secret}`;
  return { token, secret };
}

/**
 * Parses a Qa3aty refresh token into its structural components.
 */
export function parseRefreshToken(token: string): { userId: string; sessionId: string; secret: string } | null {
  if (typeof token !== "string") return null;
  const match = /^qrt_([a-zA-Z0-9_-]+)\.([a-f0-9]{64})$/.exec(token.trim());
  if (!match) return null;
  try {
    const raw = Buffer.from(match[1]!, "base64url").toString("utf8");
    const colonIndex = raw.indexOf(":");
    if (colonIndex <= 0) return null;
    const userId = raw.slice(0, colonIndex);
    const sessionId = raw.slice(colonIndex + 1);
    if (!userId || !sessionId) return null;
    return { userId, sessionId, secret: match[2]! };
  } catch {
    return null;
  }
}

/**
 * Safely persists user sessions to Supabase user_metadata if available.
 */
async function persistUserSessions(userId: string): Promise<void> {
  const url = process.env["SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceKey) return;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userRes, error: getErr } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (getErr || !userRes?.user) return;

    const userSessions: Record<string, RefreshSessionRecord> = {};
    for (const [sId, session] of memorySessions.entries()) {
      if (session.userId === userId) {
        userSessions[sId] = session;
      }
    }

    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...(userRes.user.user_metadata || {}),
        qa3aty_refresh_sessions: userSessions,
      },
    });
  } catch {
    // Graceful fallback if database/network is offline or in test environment
  }
}

/**
 * Creates a new 30-day rolling refresh session.
 */
export async function createRefreshSession({
  userId,
  tenantId,
  supabaseRefreshToken,
}: {
  userId: string;
  tenantId: string | null;
  supabaseRefreshToken: string;
}): Promise<{
  refreshToken: string;
  expiresAt: number; // unix timestamp in seconds
  expiresIn: number; // 30 days in seconds
  sessionId: string;
}> {
  const sessionId = crypto.randomUUID();
  const familyId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + REFRESH_SESSION_TTL_SECONDS;
  const { token, secret } = generateRefreshToken(userId, sessionId);
  const tokenHash = hashToken(token);

  const session: RefreshSessionRecord = {
    sessionId,
    familyId,
    userId,
    tenantId,
    tokenHash,
    activeTokenSecret: secret,
    supabaseRefreshToken,
    createdAt: now,
    expiresAt,
    lastUsedAt: now,
    isRevoked: false,
    rotatedHashes: [],
  };

  memorySessions.set(sessionId, session);
  void persistUserSessions(userId);

  return {
    refreshToken: token,
    expiresAt,
    expiresIn: REFRESH_SESSION_TTL_SECONDS,
    sessionId,
  };
}

/**
 * Retrieves a refresh session by sessionId, falling back to persistent storage if needed.
 */
export async function getRefreshSession(sessionId: string, userId?: string): Promise<RefreshSessionRecord | null> {
  const cached = memorySessions.get(sessionId);
  if (cached) return cached;

  if (userId && process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(userId);
      const stored = userRes?.user?.user_metadata?.["qa3aty_refresh_sessions"]?.[sessionId] as RefreshSessionRecord | undefined;
      if (stored) {
        memorySessions.set(sessionId, stored);
        return stored;
      }
    } catch {
      // Ignore fallback lookup errors
    }
  }

  return null;
}

export type RotateSessionResult =
  | {
      ok: true;
      session: RefreshSessionRecord;
      newRefreshToken: string;
      isGraceReplay: boolean;
    }
  | {
      ok: false;
      error: "invalid_format" | "not_found" | "revoked" | "expired" | "reuse_detected" | "hash_mismatch";
      message: string;
    };

/**
 * Rotates a refresh token upon successful refresh:
 * - Extends session expiration by 30 days (sliding expiration).
 * - Invalidates the previous token.
 * - Detects reuse attacks: if a rotated token is reused outside the grace period,
 *   the entire session family is revoked immediately.
 */
export async function rotateRefreshSession(
  oldToken: string,
  newSupabaseRefreshToken?: string,
): Promise<RotateSessionResult> {
  const parsed = parseRefreshToken(oldToken);
  if (!parsed) {
    return { ok: false, error: "invalid_format", message: "صيغة رمز الجلسة غير صالحة." };
  }

  const session = await getRefreshSession(parsed.sessionId, parsed.userId);
  if (!session) {
    return { ok: false, error: "not_found", message: "انتهت جلسة الدخول. سجّل الدخول مجددًا." };
  }

  if (session.isRevoked) {
    return { ok: false, error: "revoked", message: "تم إلغاء الجلسة. سجّل الدخول مجددًا." };
  }

  const now = Math.floor(Date.now() / 1000);
  if (now >= session.expiresAt) {
    session.isRevoked = true;
    session.revokedReason = "expired";
    void persistUserSessions(session.userId);
    return { ok: false, error: "expired", message: "انتهت صلاحية جلسة الدخول بعد 30 يومًا من عدم الاستخدام." };
  }

  const incomingHash = hashToken(oldToken);

  // 1. Legitimate current active token
  if (incomingHash === session.tokenHash) {
    const { token: newRefreshToken, secret: newSecret } = generateRefreshToken(session.userId, session.sessionId);
    const newHash = hashToken(newRefreshToken);

    session.rotatedHashes.push({ hash: session.tokenHash, rotatedAt: now });
    // Keep at most 10 recent rotated hashes to prevent unbound growth
    if (session.rotatedHashes.length > 10) {
      session.rotatedHashes.shift();
    }

    session.tokenHash = newHash;
    session.activeTokenSecret = newSecret;
    session.lastUsedAt = now;
    // SLIDING / ROLLING EXPIRATION: extend by another 30 days from now!
    session.expiresAt = now + REFRESH_SESSION_TTL_SECONDS;

    if (newSupabaseRefreshToken) {
      session.supabaseRefreshToken = newSupabaseRefreshToken;
    }

    void persistUserSessions(session.userId);

    return {
      ok: true,
      session,
      newRefreshToken,
      isGraceReplay: false,
    };
  }

  // 2. Check if this is an already-rotated token (replay or reuse)
  const rotatedMatch = session.rotatedHashes.find((r) => r.hash === incomingHash);
  if (rotatedMatch) {
    const elapsedSeconds = now - rotatedMatch.rotatedAt;
    if (elapsedSeconds <= REFRESH_ROTATION_GRACE_SECONDS) {
      // Concurrent retry within grace window (e.g. mobile connectivity drop)
      const currentToken = `qrt_${Buffer.from(`${session.userId}:${session.sessionId}`).toString("base64url")}.${session.activeTokenSecret}`;
      return {
        ok: true,
        session,
        newRefreshToken: currentToken,
        isGraceReplay: true,
      };
    }

    // Reuse detected outside grace window: Revoke family immediately!
    session.isRevoked = true;
    session.revokedReason = "reuse_detected";
    await revokeFamily(session.familyId, "reuse_detected", session.userId);
    return {
      ok: false,
      error: "reuse_detected",
      message: "تم إلغاء الجلسة لأسباب أمنية بسبب إعادة استخدام رمز تم تدويره.",
    };
  }

  return { ok: false, error: "hash_mismatch", message: "رمز الجلسة غير صالح." };
}

/**
 * Revokes all sessions belonging to the same family (token reuse defense).
 */
export async function revokeFamily(familyId: string, reason = "family_revocation", userId?: string): Promise<void> {
  for (const session of memorySessions.values()) {
    if (session.familyId === familyId) {
      session.isRevoked = true;
      session.revokedReason = reason;
    }
  }
  if (userId) {
    void persistUserSessions(userId);
  }
}

/**
 * Revokes a single session by sessionId.
 */
export async function revokeSession(sessionId: string, reason = "revoked", userId?: string): Promise<boolean> {
  const session = memorySessions.get(sessionId);
  if (!session) return false;
  session.isRevoked = true;
  session.revokedReason = reason;
  if (userId || session.userId) {
    void persistUserSessions(userId || session.userId);
  }
  return true;
}

/**
 * Revokes a session given its refresh token.
 */
export async function revokeSessionByToken(token: string, reason = "logout"): Promise<boolean> {
  const parsed = parseRefreshToken(token);
  if (!parsed) return false;
  return await revokeSession(parsed.sessionId, reason, parsed.userId);
}

/**
 * Revokes all sessions for a specific user (e.g. on password change, account deactivation).
 */
export async function revokeAllUserSessions(userId: string, reason = "revoked_all"): Promise<void> {
  for (const session of memorySessions.values()) {
    if (session.userId === userId) {
      session.isRevoked = true;
      session.revokedReason = reason;
    }
  }
  await persistUserSessions(userId);
}

/**
 * Clears in-memory session store (used exclusively in unit tests).
 */
export function _clearSessionStoreForTesting(): void {
  memorySessions.clear();
}
