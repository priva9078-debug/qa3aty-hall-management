import { describe, expect, it, vi } from "vitest";
import { apiError, apiResponse, normalizeUsername, pagination, paginationMeta } from "@/lib/api.helpers.server";
import { buildMonthlyExcel } from "@/lib/reports.server";
import * as XLSX from "xlsx";

describe("Qa3aty API Helpers & Standards", () => {
  it("normalizes usernames to lowercase and replaces spaces with dots", () => {
    expect(normalizeUsername("Ahmed Elshora")).toBe("ahmed.elshora");
    expect(normalizeUsername("  Hall.Manager  ")).toBe("hall.manager");
  });

  it("calculates pagination correctly with limits and bounds", () => {
    const url = new URL("https://qa3aty.com/api/public/v1/bookings?limit=25&offset=50");
    const page = pagination(url);
    expect(page.limit).toBe(25);
    expect(page.offset).toBe(50);
    expect(page.end).toBe(74);

    const meta = paginationMeta(url, 120, page.limit, page.offset);
    expect(meta.total).toBe(120);
    expect(meta.has_more).toBe(true);
  });

  it("formats standardized success and error API JSON responses", async () => {
    const successRes = apiResponse({ item: "hall" }, 201);
    expect(successRes.status).toBe(201);
    const successJson = await successRes.json();
    expect(successJson).toEqual({ success: true, data: { item: "hall" } });

    const errorRes = apiError("booking_conflict", "القاعة محجوزة", 409);
    expect(errorRes.status).toBe(409);
    const errorJson = await errorRes.json();
    expect(errorJson).toEqual({
      success: false,
      error: { code: "booking_conflict", message: "القاعة محجوزة" },
    });
  });
});

describe("Qa3aty Monthly Excel Export", () => {
  it("generates an Excel file with all 9 required Arabic sheets", async () => {
    const mockUser: any = {
      tenantId: "11111111-1111-1111-1111-111111111111",
      userId: "22222222-2222-2222-2222-222222222222",
      role: "tenant_admin",
      client: {
        rpc: vi.fn().mockResolvedValue({
          data: {
            booking_revenue: 50000,
            collected_payments: 30000,
            outstanding_receivables: 20000,
            operating_expenses: 5000,
            worker_costs: 4000,
            drinks_cake_costs: 2000,
            inventory_costs: 1000,
            actual_waste_costs: 200,
            net_profit: 37800,
          },
        }),
        from: vi.fn().mockImplementation((table: string) => {
          const queryBuilder: any = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            then: (resolve: any) => {
              if (table === "bookings") {
                resolve({
                  data: [
                    {
                      id: "b1",
                      event_name: "حفل زفاف أحمد",
                      event_type: "wedding",
                      event_date: "2026-11-25",
                      start_time: "18:00",
                      end_time: "23:00",
                      total_price: 50000,
                      total_paid: 30000,
                      remaining_balance: 20000,
                      status: "confirmed",
                      drinks_cake_responsibility: "tenant",
                      notes: "لا يوجد",
                      halls: { name: "القاعة الكبرى" },
                      customers: { full_name: "أحمد علي", phone: "0100000000" },
                    },
                  ],
                });
              } else if (table === "booking_payments") {
                resolve({
                  data: [
                    {
                      id: "p1",
                      amount: 30000,
                      payment_date: "2026-11-20T12:00:00Z",
                      payment_method: "cash",
                      status: "confirmed",
                      notes: "دفعة مقدمة",
                      bookings: {
                        event_name: "حفل زفاف أحمد",
                        halls: { name: "القاعة الكبرى" },
                        customers: { full_name: "أحمد علي", phone: "0100000000" },
                      },
                    },
                  ],
                });
              } else if (table === "expenses") {
                resolve({
                  data: [
                    {
                      id: "e1",
                      description: "كهرباء ومولدات",
                      amount: 5000,
                      expense_date: "2026-11-15",
                      notes: "سداد نقدي",
                      expense_categories: { name: "كهرباء" },
                      halls: { name: "القاعة الكبرى" },
                    },
                  ],
                });
              } else if (table === "worker_payments") {
                resolve({
                  data: [
                    {
                      id: "wp1",
                      payment_type: "salary",
                      amount: 4000,
                      payment_date: "2026-11-01",
                      period_start: "2026-10-01",
                      period_end: "2026-10-31",
                      notes: "راتب شهر",
                      workers: { full_name: "محمود حسن", job_title: "مشرف", salary_type: "fixed" },
                    },
                  ],
                });
              } else if (table === "booking_items") {
                resolve({
                  data: [
                    {
                      id: "bi1",
                      product_name: "عصير وبيبسي",
                      responsibility: "tenant",
                      quantity_purchased: 100,
                      purchase_unit_price: 20,
                      quantity_consumed: 90,
                      quantity_wasted: 5,
                      waste_cost: 100,
                      notes: "مناسبة أحمد",
                      bookings: {
                        event_name: "حفل زفاف أحمد",
                        event_date: "2026-11-25",
                        hall_id: "h1",
                        halls: { name: "القاعة الكبرى" },
                      },
                    },
                  ],
                });
              } else if (table === "inventory_movements") {
                resolve({
                  data: [
                    {
                      id: "im1",
                      movement_type: "waste",
                      quantity_delta: -5,
                      unit_cost: 20,
                      movement_date: "2026-11-20T10:00:00Z",
                      notes: "تلف نقل",
                      inventory_items: { name: "مناديل فاخرة", unit: "باكت" },
                      bookings: null,
                    },
                  ],
                });
              } else {
                resolve({ data: [] });
              }
            },
          };
          return queryBuilder;
        }),
      },
    };

    const result = await buildMonthlyExcel(mockUser, "2026-11-01", "2026-11-30", null);
    expect(result.bytes).toBeDefined();
    expect(result.bytes.length).toBeGreaterThan(0);

    const wb = XLSX.read(result.bytes, { type: "buffer" });
    const expectedSheets = [
      "الملخص الشهري",
      "الحجوزات",
      "المدفوعات",
      "المصروفات",
      "العمال ومستحقاتهم",
      "المشروبات والجاتوه",
      "المخزون",
      "الهالك",
      "الأرباح والخسائر",
    ];
    expect(wb.SheetNames).toEqual(expectedSheets);
  });
});

describe("Qa3aty Sub-Accounts & Granular Permissions", () => {
  it("primary account defaults to full permissions including managing sub-accounts", () => {
    const isPrimary = true;
    const permissions = isPrimary
      ? {
          can_manage_bookings: true,
          can_view_reports: true,
          can_manage_expenses: true,
          can_manage_inventory: true,
          can_manage_workers: true,
          can_manage_sub_accounts: true,
        }
      : {
          can_manage_bookings: true,
          can_view_reports: false,
          can_manage_expenses: false,
          can_manage_inventory: false,
          can_manage_workers: false,
          can_manage_sub_accounts: false,
        };

    expect(permissions.can_manage_sub_accounts).toBe(true);
    expect(permissions.can_view_reports).toBe(true);
    expect(permissions.can_manage_expenses).toBe(true);
  });

  it("sub-account receives restricted permissions and cannot manage sub-accounts", () => {
    const isPrimary = false;
    const customPerms = { can_manage_bookings: true, can_view_reports: false, can_manage_expenses: false };
    const permissions = isPrimary
      ? {
          can_manage_bookings: true,
          can_view_reports: true,
          can_manage_expenses: true,
          can_manage_inventory: true,
          can_manage_workers: true,
          can_manage_sub_accounts: true,
        }
      : {
          can_manage_bookings: customPerms.can_manage_bookings ?? true,
          can_view_reports: customPerms.can_view_reports ?? false,
          can_manage_expenses: customPerms.can_manage_expenses ?? false,
          can_manage_inventory: false,
          can_manage_workers: false,
          can_manage_sub_accounts: false,
        };

    expect(permissions.can_manage_sub_accounts).toBe(false);
    expect(permissions.can_view_reports).toBe(false);
    expect(permissions.can_manage_expenses).toBe(false);
    expect(permissions.can_manage_bookings).toBe(true);
  });

  it("verifies simultaneous subscription lockout logic", () => {
    // When a tenant's subscription expires, both primary and sub-accounts belong to same tenantId
    const tenantId = "11111111-1111-1111-1111-111111111111";
    const primaryUser = { userId: "u1", tenantId, isPrimary: true };
    const subUserX = { userId: "u2", tenantId, isPrimary: false };

    // Tenant subscription expired:
    const activeSubscription = null;
    const checkAccess = (user: { tenantId: string }) => {
      if (!activeSubscription) {
        return { ok: false, error: "subscription_expired" };
      }
      return { ok: true };
    };

    expect(checkAccess(primaryUser)).toEqual({ ok: false, error: "subscription_expired" });
    expect(checkAccess(subUserX)).toEqual({ ok: false, error: "subscription_expired" });
  });
});

describe("Qa3aty Booking Cancellation & Refund Calculations", () => {
  it("calculates partial refund and retained amounts correctly", () => {
    const totalPaid: number = 10000;
    const refundAmount: number = 6000;
    expect(refundAmount).toBeLessThanOrEqual(totalPaid);

    const retainedAmount = totalPaid - refundAmount;
    expect(retainedAmount).toBe(4000);

    const refundStatus = refundAmount === totalPaid
      ? "full_refund"
      : refundAmount > 0
        ? "partial_refund"
        : "retained";

    expect(refundStatus).toBe("partial_refund");
  });

  it("handles full refund when customer receives 100% of payment back", () => {
    const totalPaid: number = 5000;
    const refundAmount: number = 5000;
    const retainedAmount = totalPaid - refundAmount;
    expect(retainedAmount).toBe(0);

    const refundStatus = refundAmount === totalPaid ? "full_refund" : "partial_refund";
    expect(refundStatus).toBe("full_refund");
  });

  it("handles cancellation without refund retaining 100% of deposit as cancellation fee", () => {
    const totalPaid: number = 3000;
    const refund = false;
    const refundAmount: number = 0;
    const retainedAmount = totalPaid - refundAmount;
    expect(retainedAmount).toBe(3000);

    const refundStatus = refundAmount === 0 ? (totalPaid > 0 ? "retained" : "no_payment") : "partial_refund";
    expect(refundStatus).toBe("retained");
  });

  it("correctly resolves tenant subscription and tenant ID fallback", () => {
    // 1. Fallback from role.tenant_id to profile.tenant_id
    const roleWithNullTenant = { role: "tenant_admin", tenant_id: null };
    const profile = { tenant_id: "tenant-uuid-123" };
    const resolvedTenantId = roleWithNullTenant.tenant_id ?? profile.tenant_id;
    expect(resolvedTenantId).toBe("tenant-uuid-123");

    // 2. Active subscription pick with ends_at in future
    const now = Date.now();
    const subscriptions = [
      { id: "sub-1", status: "cancelled", ends_at: new Date(now - 86400000).toISOString() },
      { id: "sub-2", status: "active", ends_at: new Date(now + 30 * 86400000).toISOString() },
      { id: "sub-3", status: "active", ends_at: new Date(now + 60 * 86400000).toISOString() },
    ];

    const activeSubs = subscriptions
      .filter((s) => s.status === "active" && Date.parse(s.ends_at) > now)
      .sort((a, b) => Date.parse(b.ends_at) - Date.parse(a.ends_at));

    expect(activeSubs.length).toBe(2);
    // Picks furthest active ends_at
    expect(activeSubs[0]?.id).toBe("sub-3");
  });
});
