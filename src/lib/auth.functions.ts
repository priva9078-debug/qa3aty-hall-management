import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createTenantInputSchema, bootstrapInputSchema, loginInputSchema } from "@/lib/auth.schemas";

const BOOTSTRAP_USERNAME = "ahmed.elshora";
const USERNAME_DOMAIN = "qa3aty.internal";
const GENERIC_SETUP_NOT_FOUND = "المسار المطلوب غير موجود أو غير متاح.";

function internalEmail(username: string) {
  const normalized = username.trim().toLowerCase().replace(/\s+/g, ".");
  if (!/^[a-z0-9._-]{3,32}$/.test(normalized)) {
    throw new Error("اسم المستخدم غير صالح.");
  }
  return `${normalized}@${USERNAME_DOMAIN}`;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const hashA = crypto.createHash("sha256").update(a, "utf8").digest();
  const hashB = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function asError(message: string, status = 400) {
  return { ok: false as const, error: message, status };
}

async function failSetupWithDelay(): Promise<{ ok: false; error: string; status: number }> {
  // Artificial delay to prevent timing analysis and brute-force attempts
  await new Promise((resolve) => setTimeout(resolve, 800));
  return asError(GENERIC_SETUP_NOT_FOUND, 404);
}

export const bootstrapSuperAdmin = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data: rawInput }) => {
    // 1. Anti-enumeration: all validation or execution failures return the exact same 404 generic error
    const parsed = bootstrapInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return failSetupWithDelay();
    }
    const data = parsed.data;

    // 2. Validate one-time setup secret with constant-time comparison BEFORE touching any DB or admin client
    const expectedSecret = process.env["QA3ATY_SETUP_SECRET"] || process.env["QA3ATY_BOOTSTRAP_PASSWORD"];
    if (!expectedSecret || !constantTimeEqual(data.setupSecret, expectedSecret)) {
      return failSetupWithDelay();
    }

    if (internalEmail(data.username).split("@")[0] !== BOOTSTRAP_USERNAME) {
      return failSetupWithDelay();
    }

    // 3. ONLY after the setup secret is verified, access database admin
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 4. Atomically check that no super_admin exists (also guaranteed by user_roles_single_super_admin_idx)
    const { data: existingRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "super_admin")
      .maybeSingle();

    if (roleError || existingRole) {
      return failSetupWithDelay();
    }

    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if ((authUsers?.users ?? []).length > 0) {
      return failSetupWithDelay();
    }

    // 5. Create the developer user and call atomic bootstrap_super_admin stored procedure
    const email = internalEmail(data.username);
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { account_kind: "platform_owner" },
    });
    if (createError || !created?.user) {
      return failSetupWithDelay();
    }

    const { error: profileError } = await supabaseAdmin.rpc("bootstrap_super_admin", {
      _user_id: created.user.id,
      _username: BOOTSTRAP_USERNAME,
      _full_name: data.fullName,
    });
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return failSetupWithDelay();
    }

    return { ok: true as const };
  });

export const loginWithUsername = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => loginInputSchema.parse(input))
  .handler(async ({ data }) => {
    const email = internalEmail(data.username);
    const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
    const supabaseUrl = process.env["SUPABASE_URL"];
    if (!publishableKey || !supabaseUrl) return asError("خدمة الدخول غير متاحة حاليًا.", 503);
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          headers.delete("Authorization");
          headers.set("apikey", publishableKey);
          return fetch(input, { ...init, headers });
        },
      },
    });
    const { data: sessionData, error } = await client.auth.signInWithPassword({ email, password: data.password });
    if (error || !sessionData.session || !sessionData.user) return asError("اسم المستخدم أو كلمة المرور غير صحيحة.", 401);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("username, full_name, tenant_id, is_active")
      .eq("user_id", sessionData.user.id)
      .maybeSingle();
    const { data: role, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", sessionData.user.id)
      .maybeSingle();
    if (profileError || roleError || !profile || !role) {
      await client.auth.signOut();
      return asError("تعذر التحقق من صلاحيات الحساب.", 403);
    }
    if (!profile.is_active) {
      await client.auth.signOut();
      return asError("هذا الحساب موقوف. يرجى التواصل مع المطوّر.", 403);
    }
    if (role.role === "tenant_admin") {
      const tenantId = role.tenant_id ?? profile.tenant_id;
      if (!tenantId) {
        await client.auth.signOut();
        return asError("تعذر التحقق من حساب القاعة.", 403);
      }
      const [{ data: tenant }, { data: subscription }] = await Promise.all([
        supabaseAdmin.from("tenants").select("status").eq("id", tenantId).maybeSingle(),
        supabaseAdmin
          .from("subscriptions")
          .select("ends_at, status")
          .eq("tenant_id", tenantId)
          .eq("status", "active")
          .gte("ends_at", new Date().toISOString())
          .order("ends_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (tenant?.status !== "active") {
        await client.auth.signOut();
        return asError("هذا الحساب موقوف. يرجى التواصل مع المطوّر.", 403);
      }
      if (!subscription) {
        await client.auth.signOut();
        return asError("انتهى الاشتراك. يرجى التواصل مع المطوّر لتجديده.", 403);
      }
    }
    return {
      ok: true as const,
      session: {
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        expires_at: sessionData.session.expires_at,
        token_type: sessionData.session.token_type,
        user: { id: sessionData.user.id, username: profile.username, full_name: profile.full_name, role: role.role },
      },
    };
  });

export const refreshUsernameSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ refreshToken: z.string().min(20).max(4096) }).parse(input))
  .handler(async ({ data }) => {
    const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
    const supabaseUrl = process.env["SUPABASE_URL"];
    if (!publishableKey || !supabaseUrl) return asError("خدمة الدخول غير متاحة حاليًا.", 503);
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => { const headers = new Headers(init?.headers); headers.delete("Authorization"); headers.set("apikey", publishableKey); return fetch(input, { ...init, headers }); } },
    });
    const { data: refreshed, error } = await client.auth.refreshSession({ refresh_token: data.refreshToken });
    if (error || !refreshed.session || !refreshed.user) return asError("انتهت جلسة الدخول. سجّل الدخول مجددًا.", 401);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin.from("profiles").select("username,full_name,tenant_id,is_active").eq("user_id", refreshed.user.id).maybeSingle();
    const { data: role } = await supabaseAdmin.from("user_roles").select("role,tenant_id").eq("user_id", refreshed.user.id).maybeSingle();
    if (!profile?.is_active || !role) return asError("هذا الحساب غير نشط.", 403);
    if (role.role === "tenant_admin") {
      const tenantId = role.tenant_id ?? profile.tenant_id;
      if (!tenantId) return asError("تعذر التحقق من حساب القاعة.", 403);
      const [{ data: tenant }, { data: subscription }] = await Promise.all([
        supabaseAdmin.from("tenants").select("status").eq("id", tenantId).maybeSingle(),
        supabaseAdmin
          .from("subscriptions")
          .select("ends_at")
          .eq("tenant_id", tenantId)
          .eq("status", "active")
          .gte("ends_at", new Date().toISOString())
          .order("ends_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (tenant?.status !== "active") return asError("هذا الحساب موقوف.", 403);
      if (!subscription) return asError("انتهى الاشتراك.", 403);
    }
    return { ok: true as const, session: { access_token: refreshed.session.access_token, refresh_token: refreshed.session.refresh_token, expires_at: refreshed.session.expires_at, token_type: refreshed.session.token_type, user: { id: refreshed.user.id, username: profile.username, full_name: profile.full_name, role: role.role } } };
  });

export const logoutUsername = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ accessToken: z.string().min(20).max(4096) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (authError || !authUser.user) return { ok: true as const };
    await supabaseAdmin.auth.admin.signOut(data.accessToken, "local");
    return { ok: true as const };
  });

export const getDeveloperDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const { data: role } = await context.supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if (role?.role !== "super_admin") return { state: "forbidden" as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error: profileError } = await supabaseAdmin.from("profiles").select("full_name,username").eq("user_id", userId).maybeSingle();
    if (profileError || !profile) return { state: "forbidden" as const };
    const now = new Date().toISOString();
    const soon = new Date(Date.now() + 30 * 86400_000).toISOString();
    const [tenants, activeTenants, suspendedTenants, halls, expiredSubscriptions, expiringSoon, users, recent] = await Promise.all([
      supabaseAdmin.from("tenants").select("id,status,created_at", { count: "exact", head: true }),
      supabaseAdmin.from("tenants").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabaseAdmin.from("tenants").select("id", { count: "exact", head: true }).eq("status", "suspended"),
      supabaseAdmin.from("halls").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active").lt("ends_at", now),
      supabaseAdmin.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active").gte("ends_at", now).lte("ends_at", soon),
      supabaseAdmin.from("profiles").select("user_id,is_active", { count: "exact", head: true }).not("tenant_id", "is", null),
      supabaseAdmin.from("tenants").select("id,name,primary_hall_name,phone,status,created_at,profiles!inner(username,full_name,is_active),subscriptions(plan,status,ends_at,price),halls(id)").order("created_at", { ascending: false }).limit(6),
    ]);
    if (tenants.error || activeTenants.error || suspendedTenants.error || halls.error || expiredSubscriptions.error || expiringSoon.error || users.error || recent.error) {
      return { state: "error" as const, message: "تعذر تحميل ملخص العملاء." };
    }
    return {
      state: "ready" as const,
      profile,
      metrics: {
        totalTenants: tenants.count ?? 0,
        activeTenants: activeTenants.count ?? 0,
        suspendedTenants: suspendedTenants.count ?? 0,
        halls: halls.count ?? 0,
        expiredSubscriptions: expiredSubscriptions.count ?? 0,
        expiringSoon: expiringSoon.count ?? 0,
        tenantAdmins: users.count ?? 0,
      },
      recent: (recent.data ?? []).map((tenant) => ({
        ...tenant,
        admin: Array.isArray(tenant.profiles) ? tenant.profiles[0] : tenant.profiles,
        subscription: Array.isArray(tenant.subscriptions) ? tenant.subscriptions[0] : tenant.subscriptions,
        hallsCount: Array.isArray(tenant.halls) ? tenant.halls.length : 0,
      })),
    };
  });

export const listDeveloperTenants = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ search: z.string().max(120).default(""), status: z.enum(["all", "active", "suspended"]).default("all") }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: role } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).maybeSingle();
    if (role?.role !== "super_admin") return asError("غير مصرح.", 403);
    let query = supabaseAdmin.from("tenants").select("id,name,primary_hall_name,phone,status,notes,created_at,profiles!inner(user_id,username,full_name,is_active),subscriptions(id,plan,status,starts_at,ends_at,price),halls(id)").order("created_at", { ascending: false }).range(0, 99);
    if (data.status !== "all") query = query.eq("status", data.status);
    if (data.search) {
      const term = data.search.replace(/[%_(),.]/g, " ").trim();
      query = query.or(`name.ilike.%${term}%,primary_hall_name.ilike.%${term}%,phone.ilike.%${term}%`);
    }
    const { data: tenants, error } = await query;
    if (error) return asError("تعذر تحميل قائمة العملاء.", 500);
    return { ok: true as const, tenants: (tenants ?? []).map((tenant) => {
      const admin = Array.isArray(tenant.profiles) ? tenant.profiles[0] : tenant.profiles;
      return { ...tenant, admin: admin ? { username: admin.username, full_name: admin.full_name, is_active: admin.is_active } : null, hallsCount: Array.isArray(tenant.halls) ? tenant.halls.length : 0 };
    }) };
  });

export const createDeveloperTenant = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => createTenantInputSchema.parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: role } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).maybeSingle();
    if (role?.role !== "super_admin") return asError("غير مصرح.", 403);
    const email = internalEmail(data.username);
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({ email, password: data.password, email_confirm: true });
    if (createError || !created.user) return asError(createError?.message === "User already registered" ? "اسم المستخدم مستخدم مسبقًا." : "تعذر إنشاء حساب العميل.");
    const { data: tenantId, error } = await supabaseAdmin.rpc("create_tenant_bundle", {
      _actor_user_id: context.userId, _admin_user_id: created.user.id, _username: data.username.toLowerCase(), _full_name: data.fullName,
      _tenant_name: data.tenantName, _primary_hall_name: data.primaryHallName, _phone: data.phone || "", _tenant_status: data.status,
      _plan: data.plan, _starts_at: data.startsAt, _ends_at: data.endsAt, _subscription_price: data.subscriptionPrice, _notes: data.notes || "",
    });
    if (error) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return asError(error.message.includes("duplicate key") ? "اسم المستخدم مستخدم مسبقًا." : "تعذر حفظ بيانات العميل.", 400);
    }
    return { ok: true as const, tenantId };
  });

export const setTenantStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ tenantId: z.string().uuid(), status: z.enum(["active", "suspended"]) }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: role } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).maybeSingle();
    if (role?.role !== "super_admin") return asError("غير مصرح.", 403);
    const { data: before } = await supabaseAdmin.from("tenants").select("status,name").eq("id", data.tenantId).maybeSingle();
    if (!before) return asError("العميل غير موجود.", 404);
    const { error } = await supabaseAdmin.from("tenants").update({ status: data.status }).eq("id", data.tenantId);
    if (error) return asError("تعذر تحديث حالة العميل.", 500);
    await supabaseAdmin.from("profiles").update({ is_active: data.status === "active" }).eq("tenant_id", data.tenantId);
    if (data.status === "suspended") {
      const { revokeAllUserSessions } = await import("@/lib/session.server");
      const { data: tenantUsers } = await supabaseAdmin.from("profiles").select("user_id").eq("tenant_id", data.tenantId);
      for (const u of tenantUsers || []) {
        await revokeAllUserSessions(u.user_id, "tenant_suspended");
      }
    }
    await supabaseAdmin.from("subscription_history").insert({ tenant_id: data.tenantId, action: data.status === "active" ? "reactivated" : "suspended", actor_user_id: context.userId, details: { previous_status: before.status } });
    await supabaseAdmin.from("audit_logs").insert({ tenant_id: data.tenantId, actor_user_id: context.userId, action: `tenant.${data.status}`, entity_type: "tenant", entity_id: data.tenantId, before_data: before, after_data: { status: data.status } });
    return { ok: true as const };
  });

export const resetTenantPassword = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ tenantId: z.string().uuid(), newPassword: z.string().min(12).max(128) }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: role } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).maybeSingle();
    if (role?.role !== "super_admin") return asError("غير مصرح.", 403);
    const { data: admin } = await supabaseAdmin.from("profiles").select("user_id").eq("tenant_id", data.tenantId).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!admin) return asError("العميل غير موجود.", 404);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(admin.user_id, { password: data.newPassword });
    if (error) return asError("تعذر إعادة تعيين كلمة المرور.", 500);
    const { revokeAllUserSessions } = await import("@/lib/session.server");
    await revokeAllUserSessions(admin.user_id, "password_reset");
    await supabaseAdmin.from("audit_logs").insert({ tenant_id: data.tenantId, actor_user_id: context.userId, action: "tenant.password_reset", entity_type: "profile", entity_id: admin.user_id });
    return { ok: true as const };
  });

export const extendTenantSubscription = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ tenantId: z.string().uuid(), days: z.number().int().min(1).max(3650), price: z.number().min(0).max(999_999_999_999).default(0) }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: role } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).maybeSingle();
    if (role?.role !== "super_admin") return asError("غير مصرح.", 403);
    const { data: sub } = await supabaseAdmin.from("subscriptions").select("id,ends_at,status,plan").eq("tenant_id", data.tenantId).order("ends_at", { ascending: false }).limit(1).maybeSingle();
    if (!sub) return asError("لا يوجد اشتراك للعميل.", 404);
    const startsAt = new Date().toISOString();
    const currentExpiry = Math.max(Date.now(), Date.parse(sub.ends_at));
    const endsAt = new Date(currentExpiry + data.days * 86400_000).toISOString();
    const { error } = await supabaseAdmin.from("subscriptions").insert({ tenant_id: data.tenantId, plan: "custom", status: "active", starts_at: startsAt, ends_at: endsAt, price: data.price, created_by: context.userId });
    if (error) return asError("تعذر تمديد الاشتراك.", 500);
    await supabaseAdmin.from("tenants").update({ status: "active" }).eq("id", data.tenantId);
    await supabaseAdmin.from("profiles").update({ is_active: true }).eq("tenant_id", data.tenantId);
    await supabaseAdmin.from("subscriptions").update({ status: "cancelled" }).eq("id", sub.id).eq("status", "active");
    await supabaseAdmin.from("subscription_history").insert({ tenant_id: data.tenantId, subscription_id: sub.id, action: "extended", previous_ends_at: sub.ends_at, new_ends_at: endsAt, actor_user_id: context.userId, details: { days: data.days } });
    await supabaseAdmin.from("audit_logs").insert({ tenant_id: data.tenantId, actor_user_id: context.userId, action: "subscription.extended", entity_type: "subscription", entity_id: sub.id, before_data: { ends_at: sub.ends_at }, after_data: { ends_at: endsAt, days: data.days } });
    return { ok: true as const };
  });