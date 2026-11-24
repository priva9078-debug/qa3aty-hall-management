import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { isReminderBookingEligible, nextReminderRetryDelayMs } from "@/lib/push-reminders";

const gatewayUrl = "https://connector-gateway.lovable.dev/firebase_messaging/v1/projects/_/messages:send";
const maxNotificationsPerRun = 25;
const maxDevicesPerNotification = 100;
const dispatchLeaseMs = 10 * 60_000;

type DeviceRecipient = { id: string; user_id: string; token: string };
type SendResult = { recipient: DeviceRecipient; outcome: "sent" | "failed"; messageId: string | null; errorMessage: string | null; staleToken: boolean };

function cairoDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values["year"]}-${values["month"]}-${values["day"]}`;
}

function backoffUntil(now: Date, attempt: number) {
  return new Date(now.getTime() + nextReminderRetryDelayMs(attempt)).toISOString();
}

async function appendDeliveryLogs(admin: any, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const { error } = await admin.from("notification_logs").insert(rows);
  if (error) console.error("Could not save push delivery logs:", error.message);
}

function parseProviderMessageId(rawBody: string) {
  try {
    const body = JSON.parse(rawBody) as { name?: unknown };
    return typeof body.name === "string" ? body.name : null;
  } catch {
    return null;
  }
}

async function sendPush(connectionKey: string, lovableKey: string, recipient: DeviceRecipient, notification: {
  id: string;
  bookingId: string;
  title: string;
  body: string;
  eventDate: string;
  remainingBalance: string;
  daysRemaining: string;
}): Promise<SendResult> {
  const response = await fetch(gatewayUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connectionKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: recipient.token,
        notification: { title: notification.title, body: notification.body },
        data: {
          notification_id: notification.id,
          booking_id: notification.bookingId,
          event_date: notification.eventDate,
          remaining_balance: notification.remainingBalance,
          days_remaining: notification.daysRemaining,
          path: "/notifications",
        },
        android: {
          priority: "HIGH",
          notification: { channel_id: "qa3aty_reminders" },
        },
        apns: {
          headers: { "apns-priority": "10" },
          payload: { aps: { sound: "default" } },
        },
      },
    }),
  });

  const rawBody = await response.text();
  if (response.ok) {
    return {
      recipient,
      outcome: "sent",
      messageId: parseProviderMessageId(rawBody),
      errorMessage: null,
      staleToken: false,
    };
  }

  console.error(`FCM delivery failed [${response.status}]: ${rawBody.slice(0, 500)}`);
  const staleToken = rawBody.includes("UNREGISTERED") || rawBody.includes("INVALID_ARGUMENT");
  return {
    recipient,
    outcome: "failed",
    messageId: null,
    errorMessage: `FCM ${response.status}: ${rawBody.slice(0, 500)}`,
    staleToken,
  };
}

async function dispatchDueReminders() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["FIREBASE_MESSAGING_API_KEY"];
  if (!lovableKey || !connectionKey) {
    return Response.json({ success: false, error: "push_service_not_configured" }, { status: 503 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const now = new Date();
  const nowIso = now.toISOString();
  const today = cairoDate(now);
  const { data: dueRows, error: dueError } = await admin
    .from("notifications")
    .select("id,tenant_id,booking_id,reminder_days_before,title,payload,scheduled_for,dispatch_attempts")
    .eq("status", "pending")
    .not("booking_id", "is", null)
    .lte("scheduled_for", nowIso)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order("scheduled_for", { ascending: true })
    .limit(maxNotificationsPerRun);

  if (dueError) {
    console.error("Could not load due booking reminders:", dueError.message);
    return Response.json({ success: false, error: "reminder_queue_unavailable" }, { status: 503 });
  }

  const tenantEligibility = new Map<string, Promise<boolean>>();
  const recipientCache = new Map<string, Promise<{ recipients: DeviceRecipient[]; error: string | null }>>();
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let claimed = 0;

  const tenantIsActive = (tenantId: string) => {
    const cached = tenantEligibility.get(tenantId);
    if (cached) return cached;
    const check = (async () => {
      const [{ data: tenant, error: tenantError }, { data: subscription, error: subscriptionError }] = await Promise.all([
        admin.from("tenants").select("status").eq("id", tenantId).maybeSingle(),
        admin.from("subscriptions").select("id").eq("tenant_id", tenantId).eq("status", "active").lte("starts_at", nowIso).gt("ends_at", nowIso).limit(1).maybeSingle(),
      ]);
      return !tenantError && !subscriptionError && tenant?.status === "active" && Boolean(subscription);
    })();
    tenantEligibility.set(tenantId, check);
    return check;
  };

  const getRecipients = (tenantId: string) => {
    const cached = recipientCache.get(tenantId);
    if (cached) return cached;
    const load = (async () => {
      const { data: devices, error: deviceError } = await admin
        .from("device_tokens")
        .select("id,user_id,token")
        .eq("tenant_id", tenantId)
        .eq("provider", "fcm")
        .order("created_at", { ascending: false })
        .limit(maxDevicesPerNotification);
      if (deviceError) return { recipients: [], error: "تعذر تحميل الأجهزة المسجلة." };
      if (!devices?.length) return { recipients: [], error: null };

      const userIds = [...new Set(devices.map((device: DeviceRecipient) => device.user_id))];
      const { data: activeProfiles, error: profileError } = await admin
        .from("profiles")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .in("user_id", userIds);
      if (profileError) return { recipients: [], error: "تعذر التحقق من حالة حسابات الأجهزة." };
      const activeUsers = new Set((activeProfiles ?? []).map((profile: { user_id: string }) => profile.user_id));
      return {
        recipients: (devices as DeviceRecipient[]).filter((device) => activeUsers.has(device.user_id)),
        error: null,
      };
    })();
    recipientCache.set(tenantId, load);
    return load;
  };

  for (const row of (dueRows ?? []) as any[]) {
    const attempt = Math.max(0, Number(row.dispatch_attempts) || 0) + 1;
    const { data: claim, error: claimError } = await admin
      .from("notifications")
      .update({ dispatch_attempts: attempt, next_attempt_at: new Date(now.getTime() + dispatchLeaseMs).toISOString() })
      .eq("id", row.id)
      .eq("status", "pending")
      .lte("scheduled_for", nowIso)
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
      .select("id")
      .maybeSingle();
    if (claimError) {
      console.error("Could not claim a booking reminder:", claimError.message);
      failed += 1;
      continue;
    }
    if (!claim) continue;
    claimed += 1;

    const retryAt = backoffUntil(now, attempt);
    const baseLog = { tenant_id: row.tenant_id, notification_id: row.id, booking_id: row.booking_id, channel: "fcm" };
    const retry = async (outcome: "failed" | "skipped", message: string) => {
      await admin.from("notifications").update({ next_attempt_at: retryAt }).eq("id", row.id).eq("status", "pending");
      await appendDeliveryLogs(admin, [{ ...baseLog, outcome, error_message: message }]);
      if (outcome === "failed") failed += 1;
      else skipped += 1;
    };

    if (!row.booking_id) {
      await admin.from("notifications").update({ status: "cancelled", next_attempt_at: null }).eq("id", row.id);
      skipped += 1;
      continue;
    }

    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("id,tenant_id,status,event_date,remaining_balance,customers(full_name),halls(name)")
      .eq("tenant_id", row.tenant_id)
      .eq("id", row.booking_id)
      .maybeSingle();
    if (bookingError) {
      await retry("failed", "تعذر التحقق من حالة الحجز.");
      continue;
    }
    const reminderDays = Number(row.reminder_days_before ?? (row.payload as any)?.days_remaining ?? 0);
    if (!booking || !isReminderBookingEligible(booking, today, reminderDays)) {
      await admin.from("notifications").update({ status: "cancelled", next_attempt_at: null }).eq("id", row.id);
      skipped += 1;
      continue;
    }

    if (!(await tenantIsActive(row.tenant_id))) {
      await retry("skipped", "المنشأة أو الاشتراك غير نشط حاليًا.");
      continue;
    }

    const { recipients, error: recipientsError } = await getRecipients(row.tenant_id);
    if (recipientsError) {
      await retry("failed", recipientsError);
      continue;
    }
    if (recipients.length === 0) {
      await retry("skipped", "لا يوجد هاتف نشط مسجل لاستقبال الإشعارات.");
      continue;
    }

    const customer = (booking as any).customers?.full_name ?? "العميل";
    const hall = (booking as any).halls?.name ?? "القاعة";
    const balance = Number((booking as any).remaining_balance);
    const daysRemaining = String(reminderDays);
    const push = {
      id: row.id as string,
      bookingId: row.booking_id as string,
      title: (row.title as string) || "تذكير بموعد المناسبة",
      body: `العميل ${customer} · القاعة ${hall} · المناسبة ${booking.event_date} · متبقي ${daysRemaining} أيام · الرصيد ${balance}`,
      eventDate: booking.event_date,
      remainingBalance: String(balance),
      daysRemaining,
    };

    const results: SendResult[] = [];
    for (let index = 0; index < recipients.length; index += 6) {
      const batch = recipients.slice(index, index + 6);
      const batchResults = await Promise.all(batch.map((recipient) => sendPush(connectionKey, lovableKey, recipient, push)));
      results.push(...batchResults);
    }

    const staleIds = results.filter((result) => result.staleToken).map((result) => result.recipient.id);
    if (staleIds.length > 0) {
      const { error } = await admin.from("device_tokens").delete().eq("tenant_id", row.tenant_id).in("id", staleIds);
      if (error) console.error("Could not remove stale FCM device tokens:", error.message);
      const cachedRecipients = await getRecipients(row.tenant_id);
      if (!cachedRecipients.error) {
        recipientCache.set(row.tenant_id, Promise.resolve({
          recipients: cachedRecipients.recipients.filter((recipient) => !staleIds.includes(recipient.id)),
          error: null,
        }));
      }
    }

    await appendDeliveryLogs(admin, results.map((result) => ({
      ...baseLog,
      channel: "fcm",
      outcome: result.outcome,
      provider_message_id: result.messageId,
      error_message: result.errorMessage,
    })));

    const delivered = results.filter((result) => result.outcome === "sent").length;
    if (delivered > 0) {
      const { error } = await admin.from("notifications").update({ status: "sent", sent_at: new Date().toISOString(), next_attempt_at: null }).eq("id", row.id).eq("status", "pending");
      if (error) {
        console.error("Push was accepted but reminder status could not be updated:", error.message);
        failed += 1;
      } else {
        sent += 1;
      }
    } else {
      await admin.from("notifications").update({ next_attempt_at: retryAt }).eq("id", row.id).eq("status", "pending");
      failed += 1;
    }
  }

  return Response.json({ success: true, claimed, sent, failed, skipped });
}

export const Route = createFileRoute("/api/public/jobs/send-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authenticationFailure = await authenticateCronRequest(request);
        if (authenticationFailure) return authenticationFailure;

        try {
          return await dispatchDueReminders();
        } catch (error) {
          console.error("Push reminder dispatch failed:", error);
          return Response.json({ success: false, error: "reminder_dispatch_failed" }, { status: 500 });
        }
      },
    },
  },
});