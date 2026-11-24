import crypto from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { apiError, apiResponse, createPublicClient, loadUser, normalizeUsername, pagination, paginationMeta, requestJson } from "@/lib/api.helpers.server";

const idSchema = z.string().uuid();
const pageSize = 100;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const loginSchema = z.object({ username: z.string().trim().min(3).max(32), password: z.string().min(1).max(128) });
const refreshSchema = z.object({ refresh_token: z.string().min(20).max(4096) });
const hallSchema = z.object({
  name: z.string().trim().min(2).max(160), description: z.string().max(4000).optional(), address: z.string().max(500).optional(),
  capacity: z.number().int().positive().nullable().optional(), contact_phone: z.string().max(40).optional(),
  default_booking_price: z.number().min(0).max(999_999_999_999).optional(), image_path: z.string().max(500).optional(), is_active: z.boolean().optional(),
});
const customerSchema = z.object({
  full_name: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(3).max(40),
  whatsapp_phone: z.string().trim().min(3).max(40).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});
const bookingBaseSchema = z.object({
  hall_id: idSchema,
  customer_id: idSchema.optional(),
  customer: customerSchema.optional(),
  event_name: z.string().trim().min(1).max(160),
  event_type: z.enum(["wedding", "engagement", "birthday", "conference", "other"]),
  event_date: dateSchema,
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
  total_price: z.number().min(0).max(999_999_999_999),
  advance_payment: z.number().min(0).max(999_999_999_999).default(0),
  status: z.enum(["pending", "confirmed"]).default("pending"),
  drinks_cake_responsibility: z.enum(["tenant", "customer"]).default("tenant"),
  notes: z.string().max(4000).optional(),
});
const bookingSchema = bookingBaseSchema.refine((booking) => Boolean(booking.customer_id || booking.customer), { message: "اختر عميلًا أو أرسل بيانات عميل جديد." });
const cancelBookingSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  refund: z.boolean().default(false),
  refund_amount: z.number().min(0).max(999_999_999_999).default(0),
  refund_method: z.enum(["cash", "bank_transfer", "other"]).default("cash"),
  refund_notes: z.string().max(500).optional(),
});
const paymentSchema = z.object({ amount: z.number().positive().max(999_999_999_999), payment_date: z.string().datetime().optional(), payment_method: z.enum(["cash", "bank_transfer", "other"]), notes: z.string().max(4000).optional() });
const expenseSchema = z.object({
  category_id: idSchema.optional().nullable(),
  description: z.string().trim().min(1).max(240),
  amount: z.number().positive().max(999_999_999_999),
  expense_date: dateSchema,
  hall_id: idSchema.optional().nullable(),
  booking_id: idSchema.optional().nullable(),
  receipt_path: z.string().max(500).optional().nullable(),
  receipt_base64: z.string().optional().nullable(),
  receipt_filename: z.string().max(200).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});
const workerSchema = z.object({ full_name: z.string().trim().min(2).max(160), phone: z.string().max(40).optional(), job_title: z.string().max(120).optional(), salary_type: z.enum(["fixed", "daily"]), fixed_salary: z.number().min(0).optional(), daily_wage: z.number().min(0).optional(), joining_date: dateSchema.optional(), status: z.enum(["active", "inactive"]).default("active") });
const workerPaymentSchema = z.object({ payment_type: z.enum(["salary", "daily_wage", "bonus", "deduction"]), amount: z.number().positive().max(999_999_999_999), payment_date: dateSchema.optional(), period_start: dateSchema.optional().nullable(), period_end: dateSchema.optional().nullable(), notes: z.string().max(4000).optional() });
const movementSchema = z.object({ inventory_item_id: idSchema, booking_id: idSchema.optional().nullable(), movement_type: z.enum(["purchase", "consumption", "waste", "adjustment"]), quantity: z.number().positive().max(999_999_999), unit_cost: z.number().min(0).max(999_999_999_999), movement_date: z.string().datetime().optional(), notes: z.string().max(4000).optional() });
const itemSchema = z.object({ product_name: z.string().trim().min(1).max(160), responsibility: z.enum(["tenant", "customer"]).default("tenant"), quantity_purchased: z.number().min(0).default(0), purchase_unit_price: z.number().min(0).default(0), quantity_consumed: z.number().min(0).default(0), quantity_wasted: z.number().min(0).default(0), waste_cost: z.number().min(0).default(0), notes: z.string().max(4000).optional() });

const subAccountPermissionsSchema = z.object({
  can_manage_bookings: z.boolean().default(true),
  can_view_reports: z.boolean().default(false),
  can_manage_expenses: z.boolean().default(false),
  can_manage_inventory: z.boolean().default(false),
  can_manage_workers: z.boolean().default(false),
});

const createSubAccountSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-z0-9._-]+$/i, "اسم المستخدم يجب أن يحتوي على أحرف وأرقام ونقاط فقط."),
  password: z.string().min(8).max(128),
  full_name: z.string().trim().min(2).max(160),
  phone: z.string().max(40).optional(),
  permissions: subAccountPermissionsSchema.default({
    can_manage_bookings: true,
    can_view_reports: false,
    can_manage_expenses: false,
    can_manage_inventory: false,
    can_manage_workers: false,
  }),
});

const updateSubAccountSchema = z.object({
  full_name: z.string().trim().min(2).max(160).optional(),
  phone: z.string().max(40).optional().nullable(),
  is_active: z.boolean().optional(),
  permissions: subAccountPermissionsSchema.partial().optional(),
});

function validationError(error: z.ZodError) {
  const message = error.issues.map((issue) => issue.message).join(" ");
  return apiError("validation_error", message || "البيانات المدخلة غير صالحة.", 400);
}

function normalizePhone(phone: string) {
  return phone.replace(/[\s().-]/g, "");
}

async function jsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<{ data: T } | { response: Response }> {
  const body = await requestJson(request);
  const parsed = schema.safeParse(body);
  return parsed.success ? { data: parsed.data } : { response: validationError(parsed.error) };
}

function emailForUsername(value: string) {
  const username = normalizeUsername(value);
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return null;
  return `${username}@qa3aty.internal`;
}

function bearerRequest(request: Request, token: string) {
  const headers = new Headers(request.headers);
  headers.set("authorization", `Bearer ${token}`);
  return new Request(request.url, { method: "GET", headers });
}

async function authRoute(request: Request, method: string, action: string) {
  if (action === "login" && method === "POST") {
    const body = await jsonBody(request, loginSchema);
    if ("response" in body) return body.response;
    const email = emailForUsername(body.data.username);
    if (!email) return apiError("invalid_credentials", "اسم المستخدم أو كلمة المرور غير صحيحة.", 401);
    let client;
    try { client = createPublicClient(); } catch { return apiError("service_unavailable", "خدمة الدخول غير متاحة.", 503); }
    const { data, error } = await client.auth.signInWithPassword({ email, password: body.data.password });
    if (error || !data.session || !data.user) return apiError("invalid_credentials", "اسم المستخدم أو كلمة المرور غير صحيحة.", 401);
    const loaded = await loadUser(bearerRequest(request, data.session.access_token), false);
    if ("response" in loaded || loaded.user.role !== "tenant_admin") {
      await client.auth.signOut();
      if ("response" in loaded) return loaded.response;
      return apiError("forbidden", "هذا الحساب غير مخصص لتطبيق إدارة القاعات.", 403);
    }
    return apiResponse({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      token_type: data.session.token_type,
      user: {
        id: loaded.user.userId,
        username: loaded.user.username,
        full_name: loaded.user.fullName,
        role: loaded.user.role,
        is_primary: loaded.user.isPrimary,
        permissions: loaded.user.permissions,
      },
    });
  }

  if (action === "refresh" && method === "POST") {
    const body = await jsonBody(request, refreshSchema);
    if ("response" in body) return body.response;
    let client;
    try { client = createPublicClient(); } catch { return apiError("service_unavailable", "خدمة الدخول غير متاحة.", 503); }
    const { data, error } = await client.auth.refreshSession({ refresh_token: body.data.refresh_token.trim() });
    if (error || !data.session) return apiError("invalid_refresh_token", "انتهت جلسة الدخول. سجّل الدخول مجددًا.", 401);
    const loaded = await loadUser(bearerRequest(request, data.session.access_token), false);
    if ("response" in loaded) return loaded.response;
    if (loaded.user.role !== "tenant_admin") return apiError("forbidden", "هذا الحساب غير مخصص لتطبيق إدارة القاعات.", 403);
    return apiResponse({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      token_type: data.session.token_type,
      user: {
        id: loaded.user.userId,
        username: loaded.user.username,
        full_name: loaded.user.fullName,
        role: loaded.user.role,
        is_primary: loaded.user.isPrimary,
        permissions: loaded.user.permissions,
      },
    });
  }

  if (action === "logout" && method === "POST") {
    const loaded = await loadUser(request, false);
    if ("response" in loaded) return loaded.response;
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    await loaded.user.admin.auth.admin.signOut(token, "local");
    return apiResponse({ logged_out: true });
  }

  if (action === "me" && method === "GET") {
    const loaded = await loadUser(request, false);
    if ("response" in loaded) return loaded.response;
    return apiResponse({
      id: loaded.user.userId,
      username: loaded.user.username,
      full_name: loaded.user.fullName,
      role: loaded.user.role,
      tenant_id: loaded.user.tenantId,
      is_primary: loaded.user.isPrimary,
      permissions: loaded.user.permissions,
    });
  }

  if (action === "change-password" && method === "POST") {
    const body = await jsonBody(request, z.object({ current_password: z.string().min(1).max(128), new_password: z.string().min(12).max(128) }));
    if ("response" in body) return body.response;
    const loaded = await loadUser(request, false);
    if ("response" in loaded) return loaded.response;
    const email = emailForUsername(loaded.user.username);
    if (!email) return apiError("account_unavailable", "تعذر التحقق من بيانات الحساب.", 403);
    const client = createPublicClient();
    const { data: login, error: loginError } = await client.auth.signInWithPassword({ email, password: body.data.current_password });
    if (loginError || login.user?.id !== loaded.user.userId || !login.session) return apiError("current_password_invalid", "كلمة المرور الحالية غير صحيحة.", 400);
    const { error } = await client.auth.updateUser({ password: body.data.new_password });
    if (error) return apiError("password_update_failed", "تعذر تغيير كلمة المرور.", 400);
    return apiResponse({ password_changed: true, access_token: login.session.access_token, refresh_token: login.session.refresh_token, expires_at: login.session.expires_at });
  }

  return apiError("not_found", "المسار غير موجود.", 404);
}

async function uploadExpenseReceipt(
  admin: any,
  tenantId: string,
  buffer: Buffer,
  filename: string,
  contentType?: string
): Promise<{ receipt_path: string; receipt_url: string }> {
  try {
    await admin.storage.createBucket("qa3aty-private", { public: false });
  } catch {}

  const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
  const cleanExt = ["jpg", "jpeg", "png", "webp", "pdf"].includes(ext) ? ext : "jpg";
  const uniqueName = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${cleanExt}`;
  const filePath = `tenants/${tenantId}/expenses/${uniqueName}`;

  const mimeType = contentType && contentType !== "application/octet-stream"
    ? contentType
    : cleanExt === "pdf"
      ? "application/pdf"
      : `image/${cleanExt === "jpg" ? "jpeg" : cleanExt}`;

  const { error } = await admin.storage
    .from("qa3aty-private")
    .upload(filePath, buffer, { contentType: mimeType, upsert: true });

  if (error) {
    throw new Error(`تعذر حفظ الصورة في التخزين: ${error.message}`);
  }

  const { data: signed } = await admin.storage
    .from("qa3aty-private")
    .createSignedUrl(filePath, 3600 * 24 * 7);

  return {
    receipt_path: filePath,
    receipt_url: signed?.signedUrl ?? "",
  };
}

async function getSignedReceiptUrl(admin: any, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  try {
    const { data } = await admin.storage.from("qa3aty-private").createSignedUrl(path, 3600 * 24 * 7);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

async function tenantRoute(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/public\/v1\/?/, "").split("/").filter(Boolean);
  const method = request.method.toUpperCase();
  if (path[0] === "auth") return authRoute(request, method, path[1] ?? "");

  const loaded = await loadUser(request, true);
  if ("response" in loaded) return loaded.response;
  const { user } = loaded;
  const tenantId = user.tenantId;
  if (!tenantId) return apiError("tenant_required", "الحساب غير مرتبط بمنشأة.", 403);

  if (path[0] === "dashboard" && path[1] === "summary" && method === "GET") {
    const fetchFinancial = user.permissions.can_view_reports
      ? user.client.rpc("financial_report", { _tenant_id: tenantId, _start_date: new Date().toISOString().slice(0, 10), _end_date: new Date().toISOString().slice(0, 10) })
      : Promise.resolve({ data: null, error: null });

    const [{ count: halls }, { count: customers }, { count: bookings }, { data: financial }, { data: nextEvents }] = await Promise.all([
      user.client.from("halls").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true),
      user.client.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      user.client.from("bookings").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).neq("status", "cancelled"),
      fetchFinancial,
      user.client.from("bookings").select("id,event_name,event_date,start_time,status,remaining_balance,halls(name),customers(full_name,phone)").eq("tenant_id", tenantId).gte("event_date", new Date().toISOString().slice(0, 10)).neq("status", "cancelled").order("event_date").limit(5),
    ]);
    return apiResponse({
      halls_count: halls ?? 0,
      customers_count: customers ?? 0,
      bookings_count: bookings ?? 0,
      daily_financial: user.permissions.can_view_reports ? (financial ?? null) : null,
      upcoming_bookings: nextEvents ?? [],
    });
  }

  if (path[0] === "sub-accounts") {
    if (!user.isPrimary) {
      return apiError("forbidden", "إدارة الحسابات الفرعية متاحة فقط للحساب الرئيسي.", 403);
    }
    const id = path[1];
    const action = path[2];

    if (method === "GET" && !id) {
      const { data: profiles, error } = await user.admin
        .from("profiles")
        .select("user_id, username, full_name, phone, is_active, is_primary, permissions, created_at, updated_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true });

      if (error) return apiError("query_failed", "تعذر تحميل قائمة الحسابات.", 500);

      const items = (profiles ?? []).map((p: any) => ({
        id: p.user_id,
        username: p.username,
        full_name: p.full_name,
        phone: p.phone,
        is_active: p.is_active,
        is_primary: p.is_primary ?? false,
        permissions: p.is_primary
          ? {
              can_manage_bookings: true,
              can_view_reports: true,
              can_manage_expenses: true,
              can_manage_inventory: true,
              can_manage_workers: true,
              can_manage_sub_accounts: true,
            }
          : {
              can_manage_bookings: p.permissions?.can_manage_bookings ?? true,
              can_view_reports: p.permissions?.can_view_reports ?? false,
              can_manage_expenses: p.permissions?.can_manage_expenses ?? false,
              can_manage_inventory: p.permissions?.can_manage_inventory ?? false,
              can_manage_workers: p.permissions?.can_manage_workers ?? false,
              can_manage_sub_accounts: false,
            },
        created_at: p.created_at,
      }));

      return apiResponse({ items });
    }

    if (method === "POST" && !id) {
      const body = await jsonBody(request, createSubAccountSchema);
      if ("response" in body) return body.response;

      const email = emailForUsername(body.data.username);
      if (!email) return apiError("invalid_username", "اسم المستخدم غير صالح.", 400);

      const { data: created, error: createError } = await user.admin.auth.admin.createUser({
        email,
        password: body.data.password,
        email_confirm: true,
        user_metadata: { account_kind: "tenant_sub_account", tenant_id: tenantId },
      });

      if (createError || !created.user) {
        return apiError("user_create_failed", createError?.message === "User already registered" ? "اسم المستخدم مستخدم مسبقًا." : "تعذر إنشاء الحساب الفرعي.", 400);
      }

      const { error: profileError } = await user.admin.from("profiles").insert({
        user_id: created.user.id,
        tenant_id: tenantId,
        username: normalizeUsername(body.data.username),
        full_name: body.data.full_name,
        phone: body.data.phone || null,
        is_active: true,
        is_primary: false,
        permissions: body.data.permissions,
      } as any);

      if (profileError) {
        await user.admin.auth.admin.deleteUser(created.user.id);
        return apiError("profile_create_failed", "تعذر حفظ بيانات الحساب الفرعي.", 400);
      }

      const { error: roleError } = await user.admin.from("user_roles").insert({
        user_id: created.user.id,
        tenant_id: tenantId,
        role: "tenant_admin",
      });

      if (roleError) {
        await user.admin.auth.admin.deleteUser(created.user.id);
        return apiError("role_create_failed", "تعذر تعيين دور الحساب الفرعي.", 400);
      }

      return apiResponse({
        id: created.user.id,
        username: normalizeUsername(body.data.username),
        full_name: body.data.full_name,
        phone: body.data.phone || null,
        is_active: true,
        is_primary: false,
        permissions: {
          ...body.data.permissions,
          can_manage_sub_accounts: false,
        },
      }, 201);
    }

    if (!id || !idSchema.safeParse(id).success) return apiError("not_found", "الحساب غير موجود.", 404);

    const { data: targetProfile, error: targetError } = await user.admin
      .from("profiles")
      .select("user_id, username, full_name, phone, is_active, is_primary, permissions")
      .eq("tenant_id", tenantId)
      .eq("user_id", id)
      .maybeSingle();

    if (targetError || !targetProfile) return apiError("not_found", "الحساب غير موجود.", 404);
    if ((targetProfile as any).is_primary) {
      return apiError("forbidden", "لا يمكن تعديل أو حذف الحساب الرئيسي من خلال هذه الواجهة.", 403);
    }

    if (id && (method === "PATCH" || method === "PUT") && action !== "reset-password") {
      const body = await jsonBody(request, updateSubAccountSchema);
      if ("response" in body) return body.response;

      const updateData: any = {};
      if (body.data.full_name !== undefined) updateData.full_name = body.data.full_name;
      if (body.data.phone !== undefined) updateData.phone = body.data.phone;
      if (body.data.is_active !== undefined) updateData.is_active = body.data.is_active;
      if (body.data.permissions !== undefined) {
        const currentPerms = (targetProfile as any).permissions ?? {};
        updateData.permissions = { ...currentPerms, ...body.data.permissions };
      }

      const { data: updated, error: updateError } = await user.admin
        .from("profiles")
        .update(updateData)
        .eq("tenant_id", tenantId)
        .eq("user_id", id)
        .select()
        .single();

      if (updateError) return apiError("update_failed", "تعذر تحديث بيانات الحساب الفرعي.", 400);

      return apiResponse({
        id: (updated as any).user_id,
        username: (updated as any).username,
        full_name: (updated as any).full_name,
        phone: (updated as any).phone,
        is_active: (updated as any).is_active,
        is_primary: false,
        permissions: {
          ...((updated as any).permissions ?? {}),
          can_manage_sub_accounts: false,
        },
      });
    }

    if (id && method === "POST" && action === "reset-password") {
      const body = await jsonBody(request, z.object({ new_password: z.string().min(8).max(128) }));
      if ("response" in body) return body.response;

      const { error: passError } = await user.admin.auth.admin.updateUserById(id, { password: body.data.new_password });
      if (passError) return apiError("password_reset_failed", "تعذر إعادة تعيين كلمة المرور.", 400);
      return apiResponse({ password_reset: true });
    }

    if (id && method === "DELETE") {
      const { error: delError } = await user.admin.auth.admin.deleteUser(id);
      if (delError) return apiError("delete_failed", "تعذر حذف الحساب الفرعي.", 400);
      return apiResponse({ id, deleted: true });
    }
  }

  const page = pagination(url);

  if (path[0] === "halls") {
    const id = path[1];
    if (method === "GET" && !id) {
      let query = user.client.from("halls").select("*", { count: "exact" }).eq("tenant_id", tenantId).order("created_at", { ascending: false });
      const search = url.searchParams.get("search")?.trim();
      if (search) query = query.ilike("name", `%${search.replace(/[%_]/g, " ")}%`);
      if (url.searchParams.get("active") === "true") query = query.eq("is_active", true);
      const { data, count, error } = await query.range(page.offset, page.end);
      if (error) return apiError("query_failed", "تعذر تحميل القاعات.", 500);
      return apiResponse({ items: data, pagination: paginationMeta(url, count, page.limit, page.offset) });
    }
    if (method === "POST" && !id) {
      const body = await jsonBody(request, hallSchema);
      if ("response" in body) return body.response;
      const { data, error } = await user.client.from("halls").insert({ ...body.data, tenant_id: tenantId } as any).select().single();
      return error ? apiError("hall_create_failed", "تعذر إضافة القاعة.", 400) : apiResponse(data, 201);
    }
    if (id && !idSchema.safeParse(id).success) return apiError("not_found", "القاعة غير موجودة.", 404);
    if (id && method === "GET") {
      const { data, error } = await user.client.from("halls").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
      if (error) return apiError("query_failed", "تعذر تحميل القاعة.", 500);
      return data ? apiResponse(data) : apiError("not_found", "القاعة غير موجودة.", 404);
    }
    if (id && method === "PUT") {
      const body = await jsonBody(request, hallSchema.partial());
      if ("response" in body) return body.response;
      const { data, error } = await user.client.from("halls").update(body.data as any).eq("tenant_id", tenantId).eq("id", id).select().maybeSingle();
      if (error) return apiError("hall_update_failed", "تعذر تحديث القاعة.", 400);
      return data ? apiResponse(data) : apiError("not_found", "القاعة غير موجودة.", 404);
    }
    if (id && method === "DELETE") {
      const { data, error } = await user.client.from("halls").update({ is_active: false }).eq("tenant_id", tenantId).eq("id", id).select("id").maybeSingle();
      if (error) return apiError("hall_deactivate_failed", "تعذر إيقاف القاعة.", 400);
      return data ? apiResponse({ id, deleted: true }) : apiError("not_found", "القاعة غير موجودة.", 404);
    }
  }

  if (path[0] === "customers") {
    const id = path[1];
    if (method === "GET" && !id) {
      let query = user.client.from("customers").select("*", { count: "exact" }).eq("tenant_id", tenantId).order("created_at", { ascending: false });
      const search = url.searchParams.get("search")?.trim();
      if (search) query = query.or(`full_name.ilike.%${search.replace(/[%_,()]/g, " ")}%,phone.ilike.%${search.replace(/[%_,()]/g, " ")}%,whatsapp_phone.ilike.%${search.replace(/[%_,()]/g, " ")}%`);
      const { data, count, error } = await query.range(page.offset, page.end);
      if (error) return apiError("query_failed", "تعذر تحميل العملاء.", 500);
      return apiResponse({ items: data, pagination: paginationMeta(url, count, page.limit, page.offset) });
    }
    if (method === "POST" && !id) {
      const body = await jsonBody(request, customerSchema);
      if ("response" in body) return body.response;
      const phone = normalizePhone(body.data.phone);
      const whatsapp_phone = body.data.whatsapp_phone ? normalizePhone(body.data.whatsapp_phone) : null;
      const { data: existing } = await user.client.from("customers").select("*").eq("tenant_id", tenantId).eq("phone", phone).maybeSingle();
      if (existing) return apiResponse({ ...existing, reused_existing: true });
      const insertPayload: Record<string, unknown> = { ...body.data, phone, tenant_id: tenantId };
      if (whatsapp_phone) insertPayload["whatsapp_phone"] = whatsapp_phone;
      const { data, error } = await user.client.from("customers").insert(insertPayload as any).select().single();
      if (error?.code === "23505") {
        const { data: raced } = await user.client.from("customers").select("*").eq("tenant_id", tenantId).eq("phone", phone).maybeSingle();
        if (raced) return apiResponse({ ...raced, reused_existing: true });
      }
      return error ? apiError("customer_create_failed", "تعذر إضافة العميل.", 400) : apiResponse(data, 201);
    }
    if (id && !idSchema.safeParse(id).success) return apiError("not_found", "العميل غير موجود.", 404);
    if (id && method === "GET") {
      const { data, error } = await user.client.from("customers").select("*,bookings(id,event_name,event_date,status,total_price,total_paid,remaining_balance)").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
      if (error) return apiError("query_failed", "تعذر تحميل العميل.", 500);
      return data ? apiResponse(data) : apiError("not_found", "العميل غير موجود.", 404);
    }
    if (id && method === "PUT") {
      const body = await jsonBody(request, customerSchema.partial());
      if ("response" in body) return body.response;
      const values: Record<string, unknown> = { ...body.data };
      if (body.data.phone) values["phone"] = normalizePhone(body.data.phone);
      if (body.data.whatsapp_phone !== undefined) {
        values["whatsapp_phone"] = body.data.whatsapp_phone ? normalizePhone(body.data.whatsapp_phone) : null;
      }
      const { data, error } = await user.client.from("customers").update(values as any).eq("tenant_id", tenantId).eq("id", id).select().maybeSingle();
      if (error) return apiError("customer_update_failed", error.code === "23505" ? "رقم الهاتف مسجل لعميل آخر." : "تعذر تحديث بيانات العميل.", 400);
      return data ? apiResponse(data) : apiError("not_found", "العميل غير موجود.", 404);
    }
    if (id && method === "DELETE") {
      const { count } = await user.client.from("bookings").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("customer_id", id);
      if (count && count > 0) return apiError("customer_has_bookings", "لا يمكن حذف العميل لوجود حجوزات سابقة مرتبطة به.", 409);
      const { data, error } = await user.client.from("customers").delete().eq("tenant_id", tenantId).eq("id", id).select("id").maybeSingle();
      if (error) return apiError("customer_delete_failed", "تعذر حذف العميل.", 400);
      return data ? apiResponse({ id, deleted: true }) : apiError("not_found", "العميل غير موجود.", 404);
    }
  }

  if (path[0] === "bookings") {
    if (["POST", "PUT", "DELETE"].includes(method) && !user.permissions.can_manage_bookings) {
      return apiError("forbidden", "ليس لديك صلاحية لإضافة أو تعديل الحجوزات والمدفوعات.", 403);
    }
    if (path[1] === "calendar" && method === "GET") {
      let query = user.client.from("bookings").select("id,event_name,event_type,event_date,start_time,end_time,total_price,total_paid,remaining_balance,status,drinks_cake_responsibility,halls(id,name),customers(id,full_name,phone)").eq("tenant_id", tenantId).order("event_date", { ascending: true });
      const hall = url.searchParams.get("hall_id");
      const start = url.searchParams.get("start_date");
      const end = url.searchParams.get("end_date");
      const status = url.searchParams.get("status");
      if (hall && idSchema.safeParse(hall).success) query = query.eq("hall_id", hall);
      if (start && dateSchema.safeParse(start).success) query = query.gte("event_date", start);
      if (end && dateSchema.safeParse(end).success) query = query.lte("event_date", end);
      if (status && ["pending", "confirmed", "completed", "cancelled"].includes(status)) query = query.eq("status", status);
      const { data, error } = await query;
      if (error) return apiError("query_failed", "تعذر تحميل تقويم الحجوزات.", 500);
      return apiResponse(data);
    }

    const id = path[1];
    const action = path[2];
    if (method === "GET" && !id) {
      let query = user.client.from("bookings").select("*,halls(id,name),customers(id,full_name,phone)", { count: "exact" }).eq("tenant_id", tenantId).order("event_date", { ascending: true });
      const hall = url.searchParams.get("hall_id");
      const start = url.searchParams.get("start_date");
      const end = url.searchParams.get("end_date");
      const kind = url.searchParams.get("event_type");
      const status = url.searchParams.get("status");
      if (hall && idSchema.safeParse(hall).success) query = query.eq("hall_id", hall);
      if (start && dateSchema.safeParse(start).success) query = query.gte("event_date", start);
      if (end && dateSchema.safeParse(end).success) query = query.lte("event_date", end);
      if (kind && ["wedding", "engagement", "birthday", "conference", "other"].includes(kind)) query = query.eq("event_type", kind);
      if (status && ["pending", "confirmed", "completed", "cancelled"].includes(status)) query = query.eq("status", status);
      const { data, count, error } = await query.range(page.offset, page.end);
      if (error) return apiError("query_failed", "تعذر تحميل الحجوزات.", 500);
      return apiResponse({ items: data, pagination: paginationMeta(url, count, page.limit, page.offset) });
    }
    if (method === "POST" && !id) {
      const body = await jsonBody(request, bookingSchema);
      if ("response" in body) return body.response;
      let customerId = body.data.customer_id;
      if (!customerId && body.data.customer) {
        const customer = body.data.customer;
        const phone = normalizePhone(customer.phone);
        const whatsapp_phone = customer.whatsapp_phone ? normalizePhone(customer.whatsapp_phone) : null;
        const { data: existing } = await user.client.from("customers").select("id").eq("tenant_id", tenantId).eq("phone", phone).maybeSingle();
        customerId = existing?.id;
        if (!customerId) {
          const custPayload: Record<string, unknown> = { ...customer, phone, tenant_id: tenantId };
          if (whatsapp_phone) custPayload["whatsapp_phone"] = whatsapp_phone;
          const { data: createdCustomer, error: customerError } = await user.client.from("customers").insert(custPayload as any).select("id").single();
          if (customerError?.code === "23505") {
            const { data: raced } = await user.client.from("customers").select("id").eq("tenant_id", tenantId).eq("phone", phone).maybeSingle();
            customerId = raced?.id;
          } else if (customerError) return apiError("customer_create_failed", "تعذر حفظ بيانات العميل.", 400);
          else customerId = createdCustomer.id;
        }
      }
      if (!customerId) return apiError("customer_required", "لم يتم العثور على العميل.", 400);
      const { customer: _customer, customer_id: _customerId, ...values } = body.data;
      const { data, error } = await user.client.from("bookings").insert({ ...values, customer_id: customerId, tenant_id: tenantId, created_by: user.userId } as any).select("*,halls(id,name),customers(id,full_name,phone)").single();
      if (error) {
        if (error.code === "23P01" || error.message.includes("BOOKING_TIME_CONFLICT")) return apiError("booking_conflict", "القاعة محجوزة في هذا التوقيت.", 409);
        if (error.code === "23514") return apiError("invalid_booking_amount", "الدفعة المقدمة لا يمكن أن تتجاوز إجمالي قيمة الحجز.", 400);
        return apiError("booking_create_failed", "تعذر إنشاء الحجز.", 400);
      }
      return apiResponse(data, 201);
    }
    if (id && !idSchema.safeParse(id).success) return apiError("not_found", "الحجز غير موجود.", 404);
    if (id && action === "payments") {
      if (method === "GET") {
        const { data, error } = await user.client.from("booking_payments").select("*").eq("tenant_id", tenantId).eq("booking_id", id).order("payment_date", { ascending: false }).range(page.offset, page.end);
        return error ? apiError("query_failed", "تعذر تحميل الدفعات.", 500) : apiResponse({ items: data, pagination: { limit: page.limit, offset: page.offset } });
      }
      if (method === "POST") {
        const body = await jsonBody(request, paymentSchema);
        if ("response" in body) return body.response;
        const { data, error } = await user.client.from("booking_payments").insert({ ...body.data, tenant_id: tenantId, booking_id: id, created_by: user.userId } as any).select().single();
        if (error) return apiError(error.message.includes("PAYMENT_EXCEEDS_REMAINING_BALANCE") ? "payment_exceeds_balance" : "payment_create_failed", error.message.includes("PAYMENT_EXCEEDS_REMAINING_BALANCE") ? "قيمة الدفعة أكبر من الرصيد المتبقي." : "تعذر تسجيل الدفعة.", error.message.includes("PAYMENT_EXCEEDS_REMAINING_BALANCE") ? 409 : 400);
        const { data: booking } = await user.client.from("bookings").select("total_price,total_paid,remaining_balance").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
        return apiResponse({ ...data, booking_balance: booking }, 201);
      }
    }
    if (id && action === "items") {
      const itemId = path[3];
      if (method === "GET" && !itemId) {
        const { data, error } = await user.client.from("booking_items").select("*").eq("tenant_id", tenantId).eq("booking_id", id).order("created_at");
        return error ? apiError("query_failed", "تعذر تحميل مستلزمات المناسبة.", 500) : apiResponse(data);
      }
      if (method === "POST" && !itemId) {
        const body = await jsonBody(request, itemSchema);
        if ("response" in body) return body.response;
        const { data, error } = await user.client.from("booking_items").insert({ ...body.data, tenant_id: tenantId, booking_id: id } as any).select().single();
        return error ? apiError("booking_item_invalid", "تعذر حفظ مستلزمات المناسبة.", 400) : apiResponse(data, 201);
      }
      if (itemId && idSchema.safeParse(itemId).success) {
        if (method === "PUT") {
          const body = await jsonBody(request, itemSchema.partial());
          if ("response" in body) return body.response;
          const { data, error } = await user.client.from("booking_items").update(body.data as any).eq("tenant_id", tenantId).eq("booking_id", id).eq("id", itemId).select().maybeSingle();
          return error ? apiError("booking_item_invalid", "تعذر تحديث مستلزمات المناسبة.", 400) : data ? apiResponse(data) : apiError("not_found", "المستلزم غير موجود.", 404);
        }
        if (method === "DELETE") {
          const { data, error } = await user.client.from("booking_items").delete().eq("tenant_id", tenantId).eq("booking_id", id).eq("id", itemId).select("id").maybeSingle();
          return error ? apiError("booking_item_delete_failed", "تعذر حذف المستلزم.", 400) : data ? apiResponse({ id: itemId, deleted: true }) : apiError("not_found", "المستلزم غير موجود.", 404);
        }
      }
    }
    if (id && !action && method === "GET") {
      const { data, error } = await user.client.from("bookings").select("*,halls(id,name),customers(id,full_name,phone,address),booking_payments(*),booking_items(*),expenses(id,description,amount,expense_date)").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
      if (error) return apiError("query_failed", "تعذر تحميل تفاصيل الحجز.", 500);
      return data ? apiResponse(data) : apiError("not_found", "الحجز غير موجود.", 404);
    }
    if (id && !action && method === "PUT") {
      const body = await jsonBody(request, bookingBaseSchema.omit({ customer: true, customer_id: true, advance_payment: true }).extend({ customer_id: idSchema }).partial());
      if ("response" in body) return body.response;
      const { data, error } = await user.client.from("bookings").update({ ...body.data, updated_at: new Date().toISOString() } as any).eq("tenant_id", tenantId).eq("id", id).select().maybeSingle();
      if (error?.code === "23P01" || error?.message.includes("BOOKING_TIME_CONFLICT")) return apiError("booking_conflict", "القاعة محجوزة في هذا التوقيت.", 409);
      return error ? apiError("booking_update_failed", "تعذر تحديث الحجز.", 400) : data ? apiResponse(data) : apiError("not_found", "الحجز غير موجود.", 404);
    }
    if (id && ((action === "cancel" && method === "POST") || (method === "DELETE" && !action))) {
      let cancelData: { refund: boolean; refund_amount: number; refund_method: "cash" | "bank_transfer" | "other"; reason: string; refund_notes: string } = {
        refund: false,
        refund_amount: 0,
        refund_method: "cash",
        reason: "",
        refund_notes: "",
      };
      if (request.headers.get("content-type")?.includes("application/json")) {
        const bodyParsed = await jsonBody(request, cancelBookingSchema);
        if ("response" in bodyParsed) return bodyParsed.response;
        cancelData = {
          refund: Boolean(bodyParsed.data.refund),
          refund_amount: Number(bodyParsed.data.refund_amount ?? 0),
          refund_method: bodyParsed.data.refund_method ?? "cash",
          reason: bodyParsed.data.reason || "",
          refund_notes: bodyParsed.data.refund_notes || "",
        };
      }

      const { data: booking, error: bError } = await user.client
        .from("bookings")
        .select("*,halls(id,name),customers(id,full_name,phone)")
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .maybeSingle();

      if (bError || !booking) return apiError("not_found", "الحجز غير موجود.", 404);
      if (booking.status === "cancelled") return apiError("booking_already_cancelled", "هذا الحجز ملغي بالفعل مسبقًا.", 400);

      const totalPaid = Number(booking.total_paid || 0);

      if (cancelData.refund && cancelData.refund_amount > totalPaid) {
        return apiError("refund_exceeds_paid", `المبلغ المراد استرداده (${cancelData.refund_amount} ج.م) أكبر من إجمالي ما دفعه العميل (${totalPaid} ج.م).`, 400);
      }

      const actualRefundAmount = cancelData.refund ? cancelData.refund_amount : 0;
      const retainedAmount = totalPaid - actualRefundAmount;

      let refundExpense = null;
      if (actualRefundAmount > 0) {
        let { data: cat } = await user.admin
          .from("expense_categories")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("name", "استرداد حجوزات")
          .maybeSingle();

        if (!cat) {
          const { data: newCat } = await user.admin
            .from("expense_categories")
            .insert({ tenant_id: tenantId, name: "استرداد حجوزات", is_default: false })
            .select("id")
            .maybeSingle();
          cat = newCat;
        }

        const customerName = (booking.customers as any)?.full_name ?? "";
        const { data: exp } = await user.admin
          .from("expenses")
          .insert({
            tenant_id: tenantId,
            category_id: cat?.id ?? null,
            hall_id: booking.hall_id,
            booking_id: booking.id,
            description: `استرداد حجز ملغي - ${booking.event_name} (${customerName})`.slice(0, 240),
            amount: actualRefundAmount,
            expense_date: new Date().toISOString().slice(0, 10),
            notes: `طريقة الاسترداد: ${cancelData.refund_method}. ${cancelData.refund_notes || ""}`.trim(),
            created_by: user.userId,
          } as any)
          .select()
          .maybeSingle();
        refundExpense = exp;
      }

      const refundStatus = actualRefundAmount === 0
        ? (totalPaid > 0 ? "retained" : "no_payment")
        : actualRefundAmount === totalPaid
          ? "full_refund"
          : "partial_refund";

      const cancellationSummary = {
        cancelled_at: new Date().toISOString(),
        cancelled_by: user.userId,
        reason: cancelData.reason || "إلغاء الحجز",
        total_price: Number(booking.total_price),
        total_paid: totalPaid,
        refunded: actualRefundAmount > 0,
        refund_amount: actualRefundAmount,
        retained_amount: retainedAmount,
        refund_method: cancelData.refund_method,
        refund_status: refundStatus,
        refund_notes: cancelData.refund_notes || "",
      };

      const dateStr = new Date().toLocaleDateString("ar-EG");
      const noteAppend = actualRefundAmount > 0
        ? `[إلغاء بتاريخ ${dateStr}]: تم استرداد ${actualRefundAmount} ج.م للعميل (${cancelData.refund_method})، والمبلغ المحتفظ به بالقاعة: ${retainedAmount} ج.م.`
        : totalPaid > 0
          ? `[إلغاء بتاريخ ${dateStr}]: تم إلغاء الحجز واحتجاز كامل المبلغ المدفوع (${totalPaid} ج.م) كرسوم إلغاء.`
          : `[إلغاء بتاريخ ${dateStr}]: تم إلغاء الحجز بدون أي دفعات مسبقة.`;

      const updatedNotes = booking.notes ? `${booking.notes}\n${noteAppend}` : noteAppend;

      const { data: updatedBooking, error: updateError } = await user.admin
        .from("bookings")
        .update({
          status: "cancelled",
          notes: updatedNotes,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .select("*,halls(id,name),customers(id,full_name,phone)")
        .single();

      if (updateError) return apiError("booking_cancel_failed", "تعذر تسجيل إلغاء الحجز.", 400);

      await user.admin.from("audit_logs").insert({
        tenant_id: tenantId,
        actor_user_id: user.userId,
        action: "booking.cancelled",
        entity_type: "booking",
        entity_id: id,
        before_data: { status: booking.status, total_paid: totalPaid },
        after_data: { status: "cancelled", cancellation: cancellationSummary },
      });

      return apiResponse({
        id,
        status: "cancelled",
        event_name: booking.event_name,
        event_date: booking.event_date,
        financial_summary: {
          total_price: Number(booking.total_price),
          total_paid: totalPaid,
          refund_amount: actualRefundAmount,
          retained_amount: retainedAmount,
          refund_status: refundStatus,
        },
        cancellation: cancellationSummary,
        refund_expense: refundExpense,
        booking: updatedBooking,
      });
    }
  }

  if (path[0] === "expense-categories" || (path[0] === "expenses" && path[1] === "categories")) {
    if (method === "GET") {
      const { data, error } = await user.client.from("expense_categories").select("*").or(`tenant_id.is.null,tenant_id.eq.${tenantId}`).order("name");
      return error ? apiError("query_failed", "تعذر تحميل تصنيفات المصروفات.", 500) : apiResponse(data);
    }
    if (method === "POST") {
      if (!user.permissions.can_manage_expenses) {
        return apiError("forbidden", "ليس لديك صلاحية لإضافة أو تعديل تصنيفات المصروفات.", 403);
      }
      const body = await jsonBody(request, z.object({ name: z.string().trim().min(1).max(100) }));
      if ("response" in body) return body.response;
      const { data, error } = await user.client.from("expense_categories").insert({ name: body.data.name, tenant_id: tenantId, is_default: false }).select().single();
      if (error?.code === "23505") return apiError("category_exists", "هذا التصنيف موجود بالفعل.", 409);
      return error ? apiError("category_create_failed", "تعذر إضافة تصنيف المصروف.", 400) : apiResponse(data, 201);
    }
  }

  if (path[0] === "expenses") {
    if (["POST", "PUT", "DELETE"].includes(method) && !user.permissions.can_manage_expenses) {
      return apiError("forbidden", "ليس لديك صلاحية لإدارة أو تسجيل المصروفات والمشتريات.", 403);
    }

    if (path[1] === "upload-receipt" && method === "POST") {
      let fileBuffer: Buffer | null = null;
      let filename = "receipt.jpg";
      let contentType = "image/jpeg";

      const contentTypeHeader = request.headers.get("content-type") ?? "";
      if (contentTypeHeader.includes("multipart/form-data")) {
        const formData = await request.formData();
        const file = (formData.get("file") || formData.get("receipt") || formData.get("image")) as File | null;
        if (!file || typeof file === "string") return apiError("file_required", "لم يتم إرسال أي ملف صورة.", 400);
        filename = file.name || "receipt.jpg";
        contentType = file.type || "image/jpeg";
        const arrayBuf = await file.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuf);
      } else {
        const body = await jsonBody(request, z.object({
          file_base64: z.string().min(10),
          file_name: z.string().optional().default("receipt.jpg"),
          content_type: z.string().optional().default("image/jpeg"),
        }));
        if ("response" in body) return body.response;
        filename = body.data.file_name ?? "receipt.jpg";
        contentType = body.data.content_type ?? "image/jpeg";
        const cleanBase64 = body.data.file_base64.replace(/^data:[^;]+;base64,/, "");
        fileBuffer = Buffer.from(cleanBase64, "base64");
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return apiError("invalid_file", "ملف الصورة غير صالح.", 400);
      }

      if (fileBuffer.length > 10 * 1024 * 1024) {
        return apiError("file_too_large", "حجم الصورة يتجاوز الحد الأقصى (10 ميجابايت).", 400);
      }

      try {
        const uploaded = await uploadExpenseReceipt(user.admin, tenantId, fileBuffer, filename, contentType);
        return apiResponse(uploaded, 201);
      } catch (err: any) {
        return apiError("upload_failed", err.message || "تعذر رفع صورة الإيصال.", 500);
      }
    }

    const id = path[1];
    const action = path[2];

    if (method === "GET" && !id) {
      if (!user.permissions.can_manage_expenses && !user.permissions.can_view_reports) {
        return apiError("forbidden", "ليس لديك صلاحية لعرض المصروفات المالية.", 403);
      }
      let query = user.client.from("expenses").select("*,expense_categories(name)", { count: "exact" }).eq("tenant_id", tenantId).order("expense_date", { ascending: false });
      const start = url.searchParams.get("start_date"); const end = url.searchParams.get("end_date"); const hall = url.searchParams.get("hall_id");
      if (start && dateSchema.safeParse(start).success) query = query.gte("expense_date", start);
      if (end && dateSchema.safeParse(end).success) query = query.lte("expense_date", end);
      if (hall && idSchema.safeParse(hall).success) query = query.eq("hall_id", hall);
      const { data, count, error } = await query.range(page.offset, page.end);
      if (error) return apiError("query_failed", "تعذر تحميل المصروفات.", 500);

      const itemsWithUrls = await Promise.all(
        (data ?? []).map(async (exp: any) => ({
          ...exp,
          receipt_url: exp.receipt_path ? await getSignedReceiptUrl(user.admin, exp.receipt_path) : null,
        }))
      );
      return apiResponse({ items: itemsWithUrls, pagination: paginationMeta(url, count, page.limit, page.offset) });
    }

    if (method === "POST" && !id) {
      const contentTypeHeader = request.headers.get("content-type") ?? "";
      let insertData: any = {};
      let receiptPathToSave: string | null = null;

      if (contentTypeHeader.includes("multipart/form-data")) {
        const formData = await request.formData();
        const rawAmount = formData.get("amount");
        const amount = Number(rawAmount);
        const description = String(formData.get("description") ?? "").trim();
        const expense_date = String(formData.get("expense_date") ?? new Date().toISOString().slice(0, 10));
        const category_id = formData.get("category_id") ? String(formData.get("category_id")) : null;
        const hall_id = formData.get("hall_id") ? String(formData.get("hall_id")) : null;
        const booking_id = formData.get("booking_id") ? String(formData.get("booking_id")) : null;
        const notes = formData.get("notes") ? String(formData.get("notes")) : null;

        if (!description || isNaN(amount) || amount <= 0 || !dateSchema.safeParse(expense_date).success) {
          return apiError("validation_error", "يرجى التحقق من صحة الوصف والمبلغ والتاريخ.", 400);
        }

        const file = (formData.get("receipt") || formData.get("file") || formData.get("image")) as File | null;
        if (file && typeof file !== "string" && file.size > 0) {
          if (file.size > 10 * 1024 * 1024) return apiError("file_too_large", "حجم الصورة يتجاوز 10 ميجابايت.", 400);
          const buf = Buffer.from(await file.arrayBuffer());
          const uploaded = await uploadExpenseReceipt(user.admin, tenantId, buf, file.name, file.type);
          receiptPathToSave = uploaded.receipt_path;
        }

        insertData = {
          tenant_id: tenantId,
          description,
          amount,
          expense_date,
          category_id,
          hall_id,
          booking_id,
          receipt_path: receiptPathToSave,
          notes,
          created_by: user.userId,
        };
      } else {
        const body = await jsonBody(request, expenseSchema);
        if ("response" in body) return body.response;
        const { receipt_base64, receipt_filename, ...restData } = body.data;

        if (receipt_base64) {
          const cleanBase64 = receipt_base64.replace(/^data:[^;]+;base64,/, "");
          const buf = Buffer.from(cleanBase64, "base64");
          if (buf.length > 10 * 1024 * 1024) return apiError("file_too_large", "حجم الصورة يتجاوز 10 ميجابايت.", 400);
          const uploaded = await uploadExpenseReceipt(user.admin, tenantId, buf, receipt_filename || "receipt.jpg");
          receiptPathToSave = uploaded.receipt_path;
        } else {
          receiptPathToSave = restData.receipt_path ?? null;
        }

        insertData = {
          ...restData,
          receipt_path: receiptPathToSave,
          tenant_id: tenantId,
          created_by: user.userId,
        };
      }

      if (insertData.category_id) {
        const { data: category } = await user.admin.from("expense_categories").select("id,tenant_id").eq("id", insertData.category_id).maybeSingle();
        if (category?.tenant_id && category.tenant_id !== tenantId) return apiError("category_not_found", "تصنيف المصروف غير موجود في هذه المنشأة.", 400);
      }

      const { data, error } = await user.client.from("expenses").insert(insertData).select("*,expense_categories(name)").single();
      if (error) return apiError("expense_create_failed", "تعذر تسجيل المصروف.", 400);

      const receiptUrl = data.receipt_path ? await getSignedReceiptUrl(user.admin, data.receipt_path) : null;
      return apiResponse({ ...data, receipt_url: receiptUrl }, 201);
    }

    if (id && !idSchema.safeParse(id).success) return apiError("not_found", "المصروف غير موجود.", 404);

    if (id && action === "receipt-url" && method === "GET") {
      const { data } = await user.client.from("expenses").select("receipt_path").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
      if (!data || !data.receipt_path) return apiError("not_found", "لا توجد صورة إيصال لهذا المصروف.", 404);
      const url = await getSignedReceiptUrl(user.admin, data.receipt_path);
      return apiResponse({ receipt_path: data.receipt_path, receipt_url: url });
    }

    if (id && !action && method === "GET") {
      const { data, error } = await user.client.from("expenses").select("*,expense_categories(name)").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
      if (error) return apiError("query_failed", "تعذر تحميل المصروف.", 500);
      if (!data) return apiError("not_found", "المصروف غير موجود.", 404);
      const receiptUrl = data.receipt_path ? await getSignedReceiptUrl(user.admin, data.receipt_path) : null;
      return apiResponse({ ...data, receipt_url: receiptUrl });
    }

    if (id && !action && method === "PUT") {
      const contentTypeHeader = request.headers.get("content-type") ?? "";
      let updateValues: any = {};

      if (contentTypeHeader.includes("multipart/form-data")) {
        const formData = await request.formData();
        if (formData.has("description")) updateValues.description = String(formData.get("description")).trim();
        if (formData.has("amount")) updateValues.amount = Number(formData.get("amount"));
        if (formData.has("expense_date")) updateValues.expense_date = String(formData.get("expense_date"));
        if (formData.has("category_id")) updateValues.category_id = formData.get("category_id") ? String(formData.get("category_id")) : null;
        if (formData.has("hall_id")) updateValues.hall_id = formData.get("hall_id") ? String(formData.get("hall_id")) : null;
        if (formData.has("booking_id")) updateValues.booking_id = formData.get("booking_id") ? String(formData.get("booking_id")) : null;
        if (formData.has("notes")) updateValues.notes = formData.get("notes") ? String(formData.get("notes")) : null;

        const file = (formData.get("receipt") || formData.get("file") || formData.get("image")) as File | null;
        if (file && typeof file !== "string" && file.size > 0) {
          if (file.size > 10 * 1024 * 1024) return apiError("file_too_large", "حجم الصورة يتجاوز 10 ميجابايت.", 400);
          const buf = Buffer.from(await file.arrayBuffer());
          const uploaded = await uploadExpenseReceipt(user.admin, tenantId, buf, file.name, file.type);
          updateValues.receipt_path = uploaded.receipt_path;
        }
      } else {
        const body = await jsonBody(request, expenseSchema.partial());
        if ("response" in body) return body.response;
        const { receipt_base64, receipt_filename, ...restData } = body.data;

        if (receipt_base64) {
          const cleanBase64 = receipt_base64.replace(/^data:[^;]+;base64,/, "");
          const buf = Buffer.from(cleanBase64, "base64");
          if (buf.length > 10 * 1024 * 1024) return apiError("file_too_large", "حجم الصورة يتجاوز 10 ميجابايت.", 400);
          const uploaded = await uploadExpenseReceipt(user.admin, tenantId, buf, receipt_filename || "receipt.jpg");
          updateValues = { ...restData, receipt_path: uploaded.receipt_path };
        } else {
          updateValues = restData;
        }
      }

      const { data, error } = await user.client.from("expenses").update(updateValues).eq("tenant_id", tenantId).eq("id", id).select("*,expense_categories(name)").maybeSingle();
      if (error) return apiError("expense_update_failed", "تعذر تحديث المصروف.", 400);
      if (!data) return apiError("not_found", "المصروف غير موجود.", 404);

      const receiptUrl = data.receipt_path ? await getSignedReceiptUrl(user.admin, data.receipt_path) : null;
      return apiResponse({ ...data, receipt_url: receiptUrl });
    }

    if (id && !action && method === "DELETE") {
      const { data, error } = await user.client.from("expenses").delete().eq("tenant_id", tenantId).eq("id", id).select("id").maybeSingle();
      return error ? apiError("expense_delete_failed", "تعذر حذف المصروف.", 400) : data ? apiResponse({ id, deleted: true }) : apiError("not_found", "المصروف غير موجود.", 404);
    }
  }

  if (path[0] === "workers") {
    if (["POST", "PUT", "DELETE"].includes(method) && !user.permissions.can_manage_workers) {
      return apiError("forbidden", "ليس لديك صلاحية لإدارة شؤون العمال والرواتب.", 403);
    }
    const id = path[1]; const action = path[2];
    if (method === "GET" && !id) {
      let query = user.client.from("workers").select("*", { count: "exact" }).eq("tenant_id", tenantId).order("full_name");
      const status = url.searchParams.get("status"); if (status === "active" || status === "inactive") query = query.eq("status", status);
      const { data, count, error } = await query.range(page.offset, page.end);
      return error ? apiError("query_failed", "تعذر تحميل قائمة العاملين.", 500) : apiResponse({ items: data, pagination: paginationMeta(url, count, page.limit, page.offset) });
    }
    if (method === "POST" && !id) {
      const body = await jsonBody(request, workerSchema);
      if ("response" in body) return body.response;
      const { data, error } = await user.client.from("workers").insert({ ...body.data, tenant_id: tenantId } as any).select().single();
      return error ? apiError("worker_create_failed", "تعذر إضافة العامل.", 400) : apiResponse(data, 201);
    }
    if (id && !idSchema.safeParse(id).success) return apiError("not_found", "العامل غير موجود.", 404);
    if (id && !action && method === "GET") {
      const { data, error } = await user.client.from("workers").select("*,worker_payments(*)").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
      return error ? apiError("query_failed", "تعذر تحميل بيانات العامل.", 500) : data ? apiResponse(data) : apiError("not_found", "العامل غير موجود.", 404);
    }
    if (id && !action && method === "PUT") {
      const body = await jsonBody(request, workerSchema.partial());
      if ("response" in body) return body.response;
      const { data, error } = await user.client.from("workers").update(body.data as any).eq("tenant_id", tenantId).eq("id", id).select().maybeSingle();
      return error ? apiError("worker_update_failed", "تعذر تحديث بيانات العامل.", 400) : data ? apiResponse(data) : apiError("not_found", "العامل غير موجود.", 404);
    }
    if (id && action === "payments" && method === "GET") {
      const { data, count, error } = await user.client.from("worker_payments").select("*", { count: "exact" }).eq("tenant_id", tenantId).eq("worker_id", id).order("payment_date", { ascending: false }).range(page.offset, page.end);
      return error ? apiError("query_failed", "تعذر تحميل مستحقات العامل.", 500) : apiResponse({ items: data, pagination: paginationMeta(url, count, page.limit, page.offset) });
    }
    if (id && action === "payments" && method === "POST") {
      const body = await jsonBody(request, workerPaymentSchema);
      if ("response" in body) return body.response;
      const { data, error } = await user.client.from("worker_payments").insert({ ...body.data, tenant_id: tenantId, worker_id: id, created_by: user.userId } as any).select().single();
      return error ? apiError("worker_payment_failed", "تعذر تسجيل مستحق العامل.", 400) : apiResponse(data, 201);
    }
    if (id && !action && method === "DELETE") {
      const { data, error } = await user.client.from("workers").update({ status: "inactive" }).eq("tenant_id", tenantId).eq("id", id).select("id,status").maybeSingle();
      return error ? apiError("worker_deactivate_failed", "تعذر إيقاف العامل.", 400) : data ? apiResponse(data) : apiError("not_found", "العامل غير موجود.", 404);
    }
  }

  if (path[0] === "inventory") {
    if (["POST", "PUT", "DELETE"].includes(method) && !user.permissions.can_manage_inventory) {
      return apiError("forbidden", "ليس لديك صلاحية لإدارة المخزون والمشتريات.", 403);
    }
    if (path[1] === "movements") {
      if (method === "GET") {
        const { data, count, error } = await user.client.from("inventory_movements").select("*,inventory_items(name,unit)", { count: "exact" }).eq("tenant_id", tenantId).order("movement_date", { ascending: false }).range(page.offset, page.end);
        return error ? apiError("query_failed", "تعذر تحميل حركات المخزون.", 500) : apiResponse({ items: data, pagination: paginationMeta(url, count, page.limit, page.offset) });
      }
      if (method === "POST") {
        const body = await jsonBody(request, movementSchema);
        if ("response" in body) return body.response;
        const quantityDelta = body.data.movement_type === "consumption" || body.data.movement_type === "waste" ? -body.data.quantity : body.data.quantity;
        const { quantity: _quantity, ...values } = body.data;
        const { data, error } = await user.client.from("inventory_movements").insert({ ...values, quantity_delta: quantityDelta, tenant_id: tenantId, created_by: user.userId } as any).select().single();
        if (error?.message.includes("INVENTORY_STOCK_CANNOT_BE_NEGATIVE")) return apiError("insufficient_stock", "الكمية المطلوبة أكبر من المخزون المتاح.", 409);
        return error ? apiError("inventory_movement_failed", "تعذر تسجيل حركة المخزون.", 400) : apiResponse(data, 201);
      }
    }
    if (path.length === 1 && method === "GET") {
      let query = user.client.from("inventory_items").select("*", { count: "exact" }).eq("tenant_id", tenantId).order("name");
      const { data, count, error } = await query.range(page.offset, page.end);
      return error ? apiError("query_failed", "تعذر تحميل المخزون.", 500) : apiResponse({ items: data, pagination: paginationMeta(url, count, page.limit, page.offset) });
    }
    if (path.length === 1 && method === "POST") {
      const body = await jsonBody(request, z.object({ name: z.string().trim().min(1).max(160), unit: z.string().trim().min(1).max(30).default("unit"), unit_cost: z.number().min(0).default(0), notes: z.string().max(4000).optional() }));
      if ("response" in body) return body.response;
      const { data, error } = await user.client.from("inventory_items").insert({ ...body.data, tenant_id: tenantId } as any).select().single();
      return error ? apiError("inventory_create_failed", "تعذر إضافة المنتج.", 400) : apiResponse(data, 201);
    }
    const id = path[1];
    if (id && id !== "movements" && idSchema.safeParse(id).success) {
      if (method === "GET") {
        const { data, error } = await user.client.from("inventory_items").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
        return error ? apiError("query_failed", "تعذر تحميل الصنف.", 500) : data ? apiResponse(data) : apiError("not_found", "الصنف غير موجود.", 404);
      }
      if (method === "PUT") {
        const body = await jsonBody(request, z.object({ name: z.string().trim().min(1).max(160).optional(), unit: z.string().trim().min(1).max(30).optional(), unit_cost: z.number().min(0).optional(), notes: z.string().max(4000).optional(), is_active: z.boolean().optional() }));
        if ("response" in body) return body.response;
        const { data, error } = await user.client.from("inventory_items").update(body.data as any).eq("tenant_id", tenantId).eq("id", id).select().maybeSingle();
        return error ? apiError("inventory_update_failed", "تعذر تحديث الصنف.", 400) : data ? apiResponse(data) : apiError("not_found", "الصنف غير موجود.", 404);
      }
      if (method === "DELETE") {
        const { data, error } = await user.client.from("inventory_items").update({ is_active: false }).eq("tenant_id", tenantId).eq("id", id).select("id").maybeSingle();
        return error ? apiError("inventory_delete_failed", "تعذر إيقاف الصنف.", 400) : data ? apiResponse({ id, deleted: true }) : apiError("not_found", "الصنف غير موجود.", 404);
      }
    }
  }

  if (path[0] === "notifications" && method === "GET") {
    let query = user.client.from("notifications").select("*", { count: "exact" }).eq("tenant_id", tenantId).order("scheduled_for", { ascending: false, nullsFirst: false });
    if (url.searchParams.get("unread") === "true") query = query.eq("is_read", false);
    const { data, count, error } = await query.range(page.offset, page.end);
    return error ? apiError("query_failed", "تعذر تحميل التنبيهات.", 500) : apiResponse({ items: data, pagination: paginationMeta(url, count, page.limit, page.offset) });
  }
  if (path[0] === "notifications" && path[1] && path[2] === "read" && method === "PATCH") {
    if (!idSchema.safeParse(path[1]).success) return apiError("not_found", "التنبيه غير موجود.", 404);
    const { data, error } = await user.client.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("id", path[1]).select("id,is_read,read_at").maybeSingle();
    return error ? apiError("notification_update_failed", "تعذر تحديث التنبيه.", 400) : data ? apiResponse(data) : apiError("not_found", "التنبيه غير موجود.", 404);
  }

  if (path[0] === "device-tokens" && method === "POST") {
    const body = await jsonBody(request, z.object({ token: z.string().min(20).max(4096), device_label: z.string().max(120).optional() }));
    if ("response" in body) return body.response;
    const { data, error } = await user.client.from("device_tokens").upsert({ tenant_id: tenantId, user_id: user.userId, provider: "fcm", token: body.data.token, device_label: body.data.device_label, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any, { onConflict: "provider,token" }).select("id,provider,device_label,last_seen_at").maybeSingle();
    return error ? apiError("device_token_failed", "تعذر تسجيل هذا الجهاز.", 400) : apiResponse(data, 201);
  }
  if (path[0] === "device-tokens" && path[1] && method === "DELETE") {
    if (!idSchema.safeParse(path[1]).success) return apiError("not_found", "الجهاز غير موجود.", 404);
    const { data, error } = await user.client.from("device_tokens").delete().eq("tenant_id", tenantId).eq("user_id", user.userId).eq("id", path[1]).select("id").maybeSingle();
    return error ? apiError("device_token_delete_failed", "تعذر حذف هذا الجهاز.", 400) : apiResponse({ deleted: Boolean(data) });
  }

  if (path[0] === "reports") {
    if (!user.permissions.can_view_reports) {
      return apiError("forbidden", "ليس لديك صلاحية لعرض أو استخراج التقارير المالية.", 403);
    }
  }

  if (["monthly", "yearly", "profit-loss"].includes(path[1] ?? "") && path[0] === "reports" && method === "GET") {
    let startDate: string; let endDate: string;
    if (path[1] === "monthly") {
      const month = Number(url.searchParams.get("month") ?? new Date().getMonth() + 1);
      const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());
      if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2200) return apiError("invalid_period", "الشهر أو السنة غير صالح.", 400);
      startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      endDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    } else if (path[1] === "yearly") {
      const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());
      if (!Number.isInteger(year) || year < 2000 || year > 2200) return apiError("invalid_period", "السنة غير صالحة.", 400);
      startDate = `${year}-01-01`; endDate = `${year}-12-31`;
    } else {
      startDate = url.searchParams.get("start_date") ?? ""; endDate = url.searchParams.get("end_date") ?? "";
      if (!dateSchema.safeParse(startDate).success || !dateSchema.safeParse(endDate).success || endDate < startDate) return apiError("invalid_period", "فترة التقرير غير صالحة.", 400);
    }
    const hallParam = url.searchParams.get("hall_id");
    if (hallParam && !idSchema.safeParse(hallParam).success) return apiError("invalid_hall", "معرّف القاعة غير صالح.", 400);
    const { data, error } = await user.client.rpc("financial_report", { _tenant_id: tenantId, _start_date: startDate, _end_date: endDate, ...(hallParam ? { _hall_id: hallParam } : {}) });
    return error ? apiError("report_failed", "تعذر إعداد التقرير المالي.", 400) : apiResponse(data);
  }

  if (path[0] === "reports" && path[1] === "bookings" && method === "GET") {
    let query = user.client.from("bookings").select("*,halls(name),customers(full_name,phone)", { count: "exact" }).eq("tenant_id", tenantId).order("event_date");
    const start = url.searchParams.get("start_date"); const end = url.searchParams.get("end_date");
    if (start && dateSchema.safeParse(start).success) query = query.gte("event_date", start);
    if (end && dateSchema.safeParse(end).success) query = query.lte("event_date", end);
    const { data, count, error } = await query.range(page.offset, page.end);
    return error ? apiError("report_failed", "تعذر تحميل تقرير الحجوزات.", 500) : apiResponse({ items: data, pagination: paginationMeta(url, count, page.limit, page.offset) });
  }

  if (path[0] === "reports" && path[1] === "export" && path[2] === "excel" && method === "GET") {
    const month = Number(url.searchParams.get("month") ?? new Date().getMonth() + 1);
    const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2200) return apiError("invalid_period", "الشهر أو السنة غير صالحان.", 400);
    const { buildMonthlyExcel } = await import("@/lib/reports.server");
    try {
      const workbook = await buildMonthlyExcel(user, `${year}-${String(month).padStart(2, "0")}-01`, new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10), hallParamFromUrl(url));
      return new Response(workbook.bytes as unknown as BodyInit, { status: 200, headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="qa3aty-${year}-${String(month).padStart(2, "0")}.xlsx"`, "cache-control": "private, no-store" } });
    } catch {
      return apiError("export_failed", "تعذر إنشاء ملف التقرير.", 500);
    }
  }

  return apiError("not_found", "المسار غير موجود.", 404);
}

function hallParamFromUrl(url: URL) {
  const value = url.searchParams.get("hall_id");
  return value && idSchema.safeParse(value).success ? value : null;
}

async function handle(request: Request) {
  try {
    return await tenantRoute(request);
  } catch {
    return apiError("internal_error", "حدث خطأ أثناء تنفيذ الطلب.", 500);
  }
}

export const Route = createFileRoute("/api/public/v1/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
      PUT: ({ request }) => handle(request),
      PATCH: ({ request }) => handle(request),
      DELETE: ({ request }) => handle(request),
    },
  },
});