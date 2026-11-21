import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export type ApiUser = {
  userId: string;
  tenantId: string | null;
  username: string;
  fullName: string;
  role: "super_admin" | "tenant_admin";
  client: SupabaseClient<Database>;
  admin: SupabaseClient<Database>;
};

export function apiResponse(data: unknown, status = 200) {
  return Response.json({ success: true, data }, { status, headers: { "cache-control": "no-store" } });
}

export function apiError(code: string, message: string, status: number) {
  return Response.json({ success: false, error: { code, message } }, { status, headers: { "cache-control": "no-store" } });
}

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ".");
}

function getBaseCredentials() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Backend credentials are not configured.");
  return { url, key };
}

function fetchWithPublishableKey(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

export function createPublicClient() {
  const { url, key } = getBaseCredentials();
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithPublishableKey(key) },
  });
}

export async function loadUser(request: Request, requireTenant = true): Promise<{ user: ApiUser } | { response: Response }> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([\w.-]+)$/i.exec(authorization);
  const token = match?.[1];
  if (!token) return { response: apiError("unauthorized", "يلزم تسجيل الدخول.", 401) };

  try {
    const client = createPublicClient();
    const { data: auth, error: authError } = await client.auth.getUser(token);
    if (authError || !auth.user) return { response: apiError("invalid_token", "جلسة الدخول غير صالحة.", 401) };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profile, error: profileError }, { data: role, error: roleError }] = await Promise.all([
      supabaseAdmin.from("profiles").select("username,full_name,tenant_id,is_active").eq("user_id", auth.user.id).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role,tenant_id").eq("user_id", auth.user.id).maybeSingle(),
    ]);
    if (profileError || roleError || !profile || !role) return { response: apiError("account_unavailable", "الحساب غير مفعّل.", 403) };
    if (!profile.is_active) return { response: apiError("account_suspended", "الحساب موقوف.", 403) };
    if (role.role === "tenant_admin") {
      const tenantId = role.tenant_id ?? profile.tenant_id;
      if (!tenantId) return { response: apiError("account_unavailable", "الحساب غير مفعّل.", 403) };
      const [{ data: tenant }, { data: subscription }] = await Promise.all([
        supabaseAdmin.from("tenants").select("status").eq("id", tenantId).maybeSingle(),
        supabaseAdmin.from("subscriptions").select("id").eq("tenant_id", tenantId).eq("status", "active").lte("starts_at", new Date().toISOString()).gt("ends_at", new Date().toISOString()).limit(1).maybeSingle(),
      ]);
      if (tenant?.status !== "active") return { response: apiError("account_suspended", "الحساب موقوف.", 403) };
      if (!subscription) return { response: apiError("subscription_expired", "انتهى الاشتراك. يرجى التواصل مع المطوّر لتجديده.", 403) };
      return { user: { userId: auth.user.id, tenantId, username: profile.username, fullName: profile.full_name, role: role.role, client, admin: supabaseAdmin } };
    }
    if (role.role !== "super_admin") return { response: apiError("forbidden", "لا تملك صلاحية الوصول.", 403) };
    if (requireTenant) return { response: apiError("tenant_required", "هذه العملية متاحة لمدير القاعة.", 403) };
    return { user: { userId: auth.user.id, tenantId: null, username: profile.username, fullName: profile.full_name, role: role.role, client, admin: supabaseAdmin } };
  } catch {
    return { response: apiError("service_unavailable", "الخدمة غير متاحة حاليًا.", 503) };
  }
}

export function pagination(url: URL) {
  const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
  const requestedOffset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.floor(requestedLimit))) : 50;
  const offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.floor(requestedOffset)) : 0;
  return { limit, offset, end: offset + limit - 1 };
}

export function paginationMeta(url: URL, count: number | null, limit: number, offset: number) {
  return { total: count ?? 0, limit, offset, has_more: (count ?? 0) > offset + limit };
}

export async function requestJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}