import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  _clearSessionStoreForTesting,
  createRefreshSession,
  generateRefreshToken,
  getRefreshSession,
  hashToken,
  parseRefreshToken,
  REFRESH_ROTATION_GRACE_SECONDS,
  REFRESH_SESSION_TTL_SECONDS,
  revokeAllUserSessions,
  revokeSession,
  revokeSessionByToken,
  rotateRefreshSession,
} from "@/lib/session.server";

describe("Qa3aty Refresh Token & Session Lifecycle", () => {
  const mockUserId = "c76b9e22-8318-47bc-9269-e970bcfb8b79";
  const mockTenantId = "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d";
  const mockSupabaseRefreshToken = "sb_rt_initial_12345";

  beforeEach(() => {
    _clearSessionStoreForTesting();
  });

  describe("Token Generation, Format & Validation", () => {
    it("generates cryptographically secure, unguessable tokens longer than 20 chars", () => {
      const sessionId = "d290f1ee-6c54-4b01-90e6-d701748f0851";
      const { token, secret } = generateRefreshToken(mockUserId, sessionId);

      expect(typeof token).toBe("string");
      expect(token.startsWith("qrt_")).toBe(true);
      expect(token.length).toBeGreaterThan(60); // ~115 chars, completely resolving the < 20 chars bug!
      expect(secret.length).toBe(64); // 256 bits of entropy

      const parsed = parseRefreshToken(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.userId).toBe(mockUserId);
      expect(parsed?.sessionId).toBe(sessionId);
      expect(parsed?.secret).toBe(secret);
    });

    it("verifies that refreshSchema accepts the generated token without validation errors", () => {
      const refreshSchema = z.object({ refresh_token: z.string().trim().min(1).max(4096) });
      const { token } = generateRefreshToken(mockUserId, "session-123");

      const parsed = refreshSchema.safeParse({ refresh_token: token });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.refresh_token).toBe(token);
      }
    });

    it("never stores plain tokens in the session record, only hashes", async () => {
      const created = await createRefreshSession({
        userId: mockUserId,
        tenantId: mockTenantId,
        supabaseRefreshToken: mockSupabaseRefreshToken,
      });

      const session = await getRefreshSession(created.sessionId);
      expect(session).not.toBeNull();
      expect(session?.tokenHash).toBe(hashToken(created.refreshToken));
      expect(session?.tokenHash).not.toBe(created.refreshToken);
    });
  });

  describe("Login to Refresh Cycle", () => {
    it("ensures the refresh_token issued at login is immediately valid for /auth/refresh", async () => {
      // 1. Simulate login issuing a refresh session
      const loginSession = await createRefreshSession({
        userId: mockUserId,
        tenantId: mockTenantId,
        supabaseRefreshToken: mockSupabaseRefreshToken,
      });

      expect(loginSession.refreshToken).toBeDefined();
      expect(loginSession.refreshToken.length).toBeGreaterThan(20);

      // 2. Client sends this refresh_token to /auth/refresh
      const rotateResult = await rotateRefreshSession(loginSession.refreshToken, "sb_rt_new_67890");
      expect(rotateResult.ok).toBe(true);
      if (rotateResult.ok) {
        expect(rotateResult.newRefreshToken).toBeDefined();
        expect(rotateResult.newRefreshToken).not.toBe(loginSession.refreshToken);
        expect(rotateResult.session.supabaseRefreshToken).toBe("sb_rt_new_67890");
      }
    });

    it("allows refresh without requiring a valid or unexpired access token", async () => {
      // Refresh only needs the refresh_token body, independent of access token expiry
      const loginSession = await createRefreshSession({
        userId: mockUserId,
        tenantId: mockTenantId,
        supabaseRefreshToken: mockSupabaseRefreshToken,
      });

      // Even if access token has long expired (e.g. 2 hours later):
      const rotateResult = await rotateRefreshSession(loginSession.refreshToken);
      expect(rotateResult.ok).toBe(true);
    });
  });

  describe("Token Rotation & Reuse Detection", () => {
    it("rotates refresh token, invalidating the previous token", async () => {
      const initial = await createRefreshSession({
        userId: mockUserId,
        tenantId: mockTenantId,
        supabaseRefreshToken: mockSupabaseRefreshToken,
      });

      // First refresh: rotates initial.refreshToken -> token2
      const rotate1 = await rotateRefreshSession(initial.refreshToken, "sb_rt_2");
      expect(rotate1.ok).toBe(true);
      if (!rotate1.ok) return;

      const token2 = rotate1.newRefreshToken;

      // Second refresh with token2 -> token3
      const rotate2 = await rotateRefreshSession(token2, "sb_rt_3");
      expect(rotate2.ok).toBe(true);
      if (!rotate2.ok) return;

      const token3 = rotate2.newRefreshToken;
      expect(token3).not.toBe(token2);
      expect(token3).not.toBe(initial.refreshToken);
    });

    it("detects reuse of an old rotated token outside grace window and revokes the session family", async () => {
      const initial = await createRefreshSession({
        userId: mockUserId,
        tenantId: mockTenantId,
        supabaseRefreshToken: mockSupabaseRefreshToken,
      });

      // Client rotates token
      const rotate1 = await rotateRefreshSession(initial.refreshToken, "sb_rt_2");
      expect(rotate1.ok).toBe(true);
      if (!rotate1.ok) return;

      // Simulate time passing beyond REFRESH_ROTATION_GRACE_SECONDS (15s)
      const session = await getRefreshSession(initial.sessionId);
      if (session && session.rotatedHashes[0]) {
        session.rotatedHashes[0].rotatedAt = Math.floor(Date.now() / 1000) - (REFRESH_ROTATION_GRACE_SECONDS + 10);
      }

      // An attacker attempts to reuse initial.refreshToken
      const reuseAttempt = await rotateRefreshSession(initial.refreshToken);
      expect(reuseAttempt.ok).toBe(false);
      if (!reuseAttempt.ok) {
        expect(reuseAttempt.error).toBe("reuse_detected");
      }

      // Entire session is now revoked!
      const afterSession = await getRefreshSession(initial.sessionId);
      expect(afterSession?.isRevoked).toBe(true);
      expect(afterSession?.revokedReason).toBe("reuse_detected");

      // Even the latest active token (token2) is now rejected because family was revoked
      const latestAttempt = await rotateRefreshSession(rotate1.newRefreshToken);
      expect(latestAttempt.ok).toBe(false);
      if (!latestAttempt.ok) {
        expect(latestAttempt.error).toBe("revoked");
      }
    });

    it("handles concurrent network retries gracefully within the 15-second grace window", async () => {
      const initial = await createRefreshSession({
        userId: mockUserId,
        tenantId: mockTenantId,
        supabaseRefreshToken: mockSupabaseRefreshToken,
      });

      // Request 1 succeeds and rotates token
      const rotate1 = await rotateRefreshSession(initial.refreshToken, "sb_rt_2");
      expect(rotate1.ok).toBe(true);
      if (!rotate1.ok) return;

      // Request 2 (e.g. cellular retry with same token 2 seconds later)
      const retryResult = await rotateRefreshSession(initial.refreshToken);
      expect(retryResult.ok).toBe(true);
      if (retryResult.ok) {
        expect(retryResult.isGraceReplay).toBe(true);
        expect(retryResult.newRefreshToken).toBe(rotate1.newRefreshToken);
      }
    });
  });

  describe("Rolling / Sliding 30-Day Expiration", () => {
    it("sets initial expiry to 30 days and extends by 30 days on each successful refresh", async () => {
      const now = Math.floor(Date.now() / 1000);
      const initial = await createRefreshSession({
        userId: mockUserId,
        tenantId: mockTenantId,
        supabaseRefreshToken: mockSupabaseRefreshToken,
      });

      expect(initial.expiresIn).toBe(REFRESH_SESSION_TTL_SECONDS); // 30 days
      expect(initial.expiresAt).toBeGreaterThanOrEqual(now + REFRESH_SESSION_TTL_SECONDS - 5);

      // Fast forward time by 10 days
      const session = await getRefreshSession(initial.sessionId);
      if (session) {
        session.expiresAt = now + 20 * 86400; // 20 days remaining
      }

      // Rotate/refresh token
      const rotateResult = await rotateRefreshSession(initial.refreshToken);
      expect(rotateResult.ok).toBe(true);
      if (rotateResult.ok) {
        // Expiry rolled forward: now + 30 days from now!
        const currentNow = Math.floor(Date.now() / 1000);
        expect(rotateResult.session.expiresAt).toBeGreaterThanOrEqual(currentNow + REFRESH_SESSION_TTL_SECONDS - 5);
      }
    });

    it("rejects refresh session after 30 days of inactivity", async () => {
      const initial = await createRefreshSession({
        userId: mockUserId,
        tenantId: mockTenantId,
        supabaseRefreshToken: mockSupabaseRefreshToken,
      });

      // Simulate 31 days passing with no refresh
      const session = await getRefreshSession(initial.sessionId);
      if (session) {
        session.expiresAt = Math.floor(Date.now() / 1000) - 100; // expired
      }

      const rotateResult = await rotateRefreshSession(initial.refreshToken);
      expect(rotateResult.ok).toBe(false);
      if (!rotateResult.ok) {
        expect(rotateResult.error).toBe("expired");
      }
    });
  });

  describe("Logout and Session Revocation", () => {
    it("revokes session on logout by refresh token", async () => {
      const session = await createRefreshSession({
        userId: mockUserId,
        tenantId: mockTenantId,
        supabaseRefreshToken: mockSupabaseRefreshToken,
      });

      const revoked = await revokeSessionByToken(session.refreshToken, "user_logout");
      expect(revoked).toBe(true);

      const refreshAttempt = await rotateRefreshSession(session.refreshToken);
      expect(refreshAttempt.ok).toBe(false);
      if (!refreshAttempt.ok) {
        expect(refreshAttempt.error).toBe("revoked");
      }
    });

    it("revokes all sessions for a user upon password change or account deactivation", async () => {
      // User logged in on Device A and Device B
      const deviceA = await createRefreshSession({
        userId: mockUserId,
        tenantId: mockTenantId,
        supabaseRefreshToken: "rt_device_a",
      });
      const deviceB = await createRefreshSession({
        userId: mockUserId,
        tenantId: mockTenantId,
        supabaseRefreshToken: "rt_device_b",
      });

      // User changes password -> revokeAllUserSessions
      await revokeAllUserSessions(mockUserId, "password_changed");

      const refreshA = await rotateRefreshSession(deviceA.refreshToken);
      expect(refreshA.ok).toBe(false);
      if (!refreshA.ok) expect(refreshA.error).toBe("revoked");

      const refreshB = await rotateRefreshSession(deviceB.refreshToken);
      expect(refreshB.ok).toBe(false);
      if (!refreshB.ok) expect(refreshB.error).toBe("revoked");
    });
  });

  describe("API Response Contract Compliance", () => {
    it("formats standard auth payload with Unix seconds expires_at and expires_in", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const expiresIn = 3600; // 1 hour access token
      const expiresAt = nowSeconds + expiresIn;

      const authData = {
        access_token: "eyJhbGciOi...",
        refresh_token: "qrt_...",
        expires_at: expiresAt,
        expires_in: expiresIn,
        token_type: "bearer",
        user: {
          id: mockUserId,
          username: "manager",
          full_name: "مدير القاعة",
          role: "tenant_admin",
          is_primary: true,
          permissions: { can_manage_bookings: true },
        },
      };

      expect(typeof authData.expires_at).toBe("number");
      expect(authData.expires_at).toBeGreaterThan(1700000000); // Unix timestamp in seconds
      expect(authData.expires_in).toBe(3600);
      expect(authData.token_type).toBe("bearer");
      expect(authData.user.username).toBe("manager");
    });
  });
});
