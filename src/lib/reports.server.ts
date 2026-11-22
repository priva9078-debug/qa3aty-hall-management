import * as XLSX from "xlsx";
import type { ApiUser } from "@/lib/api.helpers.server";

function nextDay(dateString: string): string {
  const d = new Date(dateString);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function buildMonthlyExcel(
  user: ApiUser,
  startDate: string,
  endDate: string,
  hallId: string | null
): Promise<{ bytes: Uint8Array }> {
  const tenantId = user.tenantId;
  if (!tenantId) {
    throw new Error("Tenant ID required");
  }

  // 1. Fetch Financial Report
  const { data: finReport } = await user.client.rpc("financial_report", {
    _tenant_id: tenantId,
    _start_date: startDate,
    _end_date: endDate,
    ...(hallId ? { _hall_id: hallId } : {}),
  });

  const report = finReport as {
    booking_revenue?: number;
    collected_payments?: number;
    outstanding_receivables?: number;
    operating_expenses?: number;
    worker_costs?: number;
    drinks_cake_costs?: number;
    inventory_costs?: number;
    actual_waste_costs?: number;
    net_profit?: number;
  } | null;

  // 2. Fetch Bookings
  let bookingsQuery = user.client
    .from("bookings")
    .select("id,event_name,event_type,event_date,start_time,end_time,total_price,total_paid,remaining_balance,status,drinks_cake_responsibility,notes,halls(name),customers(full_name,phone)")
    .eq("tenant_id", tenantId)
    .gte("event_date", startDate)
    .lte("event_date", endDate)
    .order("event_date", { ascending: true });

  if (hallId) {
    bookingsQuery = bookingsQuery.eq("hall_id", hallId);
  }
  const { data: bookings } = await bookingsQuery;

  // 3. Fetch Payments
  let paymentsQuery = user.client
    .from("booking_payments")
    .select("id,booking_id,amount,payment_date,payment_method,status,notes,bookings!inner(event_name,event_date,hall_id,halls(name),customers(full_name,phone))")
    .eq("tenant_id", tenantId)
    .gte("payment_date", `${startDate}T00:00:00Z`)
    .lt("payment_date", `${nextDay(endDate)}T00:00:00Z`)
    .order("payment_date", { ascending: false });

  if (hallId) {
    paymentsQuery = paymentsQuery.eq("bookings.hall_id", hallId);
  }
  const { data: payments } = await paymentsQuery;

  // 4. Fetch Expenses
  let expensesQuery = user.client
    .from("expenses")
    .select("id,description,amount,expense_date,notes,expense_categories(name),halls(name)")
    .eq("tenant_id", tenantId)
    .gte("expense_date", startDate)
    .lte("expense_date", endDate)
    .order("expense_date", { ascending: false });

  if (hallId) {
    expensesQuery = expensesQuery.eq("hall_id", hallId);
  }
  const { data: expenses } = await expensesQuery;

  // 5. Fetch Worker Payments
  let workerPaymentsQuery = user.client
    .from("worker_payments")
    .select("id,payment_type,amount,payment_date,period_start,period_end,notes,workers(full_name,job_title,salary_type)")
    .eq("tenant_id", tenantId)
    .gte("payment_date", startDate)
    .lte("payment_date", endDate)
    .order("payment_date", { ascending: false });

  const { data: workerPayments } = await workerPaymentsQuery;

  // 6. Fetch Booking Items (Drinks & Cake)
  let itemsQuery = user.client
    .from("booking_items")
    .select("id,product_name,responsibility,quantity_purchased,purchase_unit_price,quantity_consumed,quantity_wasted,waste_cost,notes,bookings!inner(event_name,event_date,hall_id,halls(name))")
    .eq("tenant_id", tenantId);

  if (hallId) {
    itemsQuery = itemsQuery.eq("bookings.hall_id", hallId);
  }
  const { data: bookingItems } = await itemsQuery;

  // Filter booking items by event date
  const filteredBookingItems = (bookingItems ?? []).filter((item: any) => {
    const evDate = item.bookings?.event_date;
    return evDate >= startDate && evDate <= endDate;
  });

  // 7. Fetch Inventory Movements
  const { data: inventoryMovements } = await user.client
    .from("inventory_movements")
    .select("id,movement_type,quantity_delta,unit_cost,movement_date,notes,inventory_items(name,unit),bookings(event_name)")
    .eq("tenant_id", tenantId)
    .gte("movement_date", `${startDate}T00:00:00Z`)
    .lt("movement_date", `${nextDay(endDate)}T00:00:00Z`)
    .order("movement_date", { ascending: false });

  // 8. Prepare Workbook
  const wb = XLSX.utils.book_new();

  // Sheet 1: Monthly Summary (الملخص الشهري)
  const summaryData = [
    ["قاعتي | Qa3aty — التقرير المالي الشهري"],
    ["الفترة من", startDate, "إلى", endDate],
    [],
    ["البند", "القيمة (ج.م)"],
    ["إجمالي إيرادات الحجوزات", report?.booking_revenue ?? 0],
    ["إجمالي المبالغ المحصلة", report?.collected_payments ?? 0],
    ["المبالغ المستحقة (الرصيد المتبقي)", report?.outstanding_receivables ?? 0],
    ["المصروفات التشغيلية العامة", report?.operating_expenses ?? 0],
    ["أجور ومستحقات العاملين", report?.worker_costs ?? 0],
    ["تكاليف المشروبات والجاتوه", report?.drinks_cake_costs ?? 0],
    ["تكاليف استهلاك المخزون", report?.inventory_costs ?? 0],
    ["تكلفة الهالك الفعلية", report?.actual_waste_costs ?? 0],
    [],
    ["صافي الربح التقديري", report?.net_profit ?? 0],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summarySheet, "الملخص الشهري");

  // Sheet 2: Bookings (الحجوزات)
  const bookingsData = [
    [
      "اسم المناسبة",
      "القاعة",
      "اسم العميل",
      "رقم الهاتف",
      "نوع المناسبة",
      "تاريخ المناسبة",
      "وقت البدء",
      "وقت الانتهاء",
      "الإجمالي (ج.م)",
      "المدفوع (ج.م)",
      "المتبقي (ج.م)",
      "الحالة",
      "مسؤولية المشروبات",
      "ملاحظات",
    ],
    ...(bookings ?? []).map((b: any) => [
      b.event_name,
      b.halls?.name ?? "—",
      b.customers?.full_name ?? "—",
      b.customers?.phone ?? "—",
      b.event_type,
      b.event_date,
      b.start_time,
      b.end_time,
      Number(b.total_price),
      Number(b.total_paid),
      Number(b.remaining_balance),
      b.status,
      b.drinks_cake_responsibility === "tenant" ? "القاعة" : "العميل",
      b.notes ?? "",
    ]),
  ];
  const bookingsSheet = XLSX.utils.aoa_to_sheet(bookingsData);
  XLSX.utils.book_append_sheet(wb, bookingsSheet, "الحجوزات");

  // Sheet 3: Payments (المدفوعات)
  const paymentsData = [
    [
      "رقم الدفعة",
      "اسم المناسبة",
      "القاعة",
      "العميل",
      "المبلغ (ج.م)",
      "تاريخ الدفع",
      "طريقة الدفع",
      "الحالة",
      "ملاحظات",
    ],
    ...(payments ?? []).map((p: any) => [
      p.id,
      p.bookings?.event_name ?? "—",
      p.bookings?.halls?.name ?? "—",
      p.bookings?.customers?.full_name ?? "—",
      Number(p.amount),
      p.payment_date ? new Date(p.payment_date).toLocaleString("ar-EG") : "—",
      p.payment_method === "cash" ? "نقدي" : p.payment_method === "bank_transfer" ? "تحويل بنكي" : "أخرى",
      p.status === "confirmed" ? "مؤكد" : "ملغي",
      p.notes ?? "",
    ]),
  ];
  const paymentsSheet = XLSX.utils.aoa_to_sheet(paymentsData);
  XLSX.utils.book_append_sheet(wb, paymentsSheet, "المدفوعات");

  // Sheet 4: Expenses (المصروفات)
  const expensesData = [
    [
      "التصنيف",
      "البيان",
      "المبلغ (ج.م)",
      "تاريخ المصروف",
      "القاعة",
      "ملاحظات",
    ],
    ...(expenses ?? []).map((e: any) => [
      e.expense_categories?.name ?? "عام",
      e.description,
      Number(e.amount),
      e.expense_date,
      e.halls?.name ?? "عام",
      e.notes ?? "",
    ]),
  ];
  const expensesSheet = XLSX.utils.aoa_to_sheet(expensesData);
  XLSX.utils.book_append_sheet(wb, expensesSheet, "المصروفات");

  // Sheet 5: Workers (أجور ومستحقات العمال)
  const workersData = [
    [
      "اسم العامل",
      "المسمى الوظيفي",
      "نوع الراتب",
      "نوع المستحق / المعاملة",
      "المبلغ (ج.م)",
      "تاريخ الصرف",
      "الفترة من",
      "الفترة إلى",
      "ملاحظات",
    ],
    ...(workerPayments ?? []).map((wp: any) => [
      wp.workers?.full_name ?? "—",
      wp.workers?.job_title ?? "—",
      wp.workers?.salary_type === "fixed" ? "شهري ثابت" : "يومية",
      wp.payment_type === "salary"
        ? "راتب"
        : wp.payment_type === "daily_wage"
        ? "أجرة يومية"
        : wp.payment_type === "bonus"
        ? "مكافأة"
        : "خصم",
      Number(wp.amount),
      wp.payment_date,
      wp.period_start ?? "—",
      wp.period_end ?? "—",
      wp.notes ?? "",
    ]),
  ];
  const workersSheet = XLSX.utils.aoa_to_sheet(workersData);
  XLSX.utils.book_append_sheet(wb, workersSheet, "العمال ومستحقاتهم");

  // Sheet 6: Drinks & Cake (المشروبات والجاتوه)
  const drinksData = [
    [
      "اسم المناسبة",
      "القاعة",
      "المنتج",
      "الجهة المسؤولة",
      "الكمية المشتراة",
      "سعر شراء الوحدة",
      "الكمية المستهلكة",
      "كمية الهالك",
      "تكلفة الهالك (ج.م)",
      "ملاحظات",
    ],
    ...filteredBookingItems.map((item: any) => [
      item.bookings?.event_name ?? "—",
      item.bookings?.halls?.name ?? "—",
      item.product_name,
      item.responsibility === "tenant" ? "القاعة" : "العميل",
      Number(item.quantity_purchased),
      Number(item.purchase_unit_price),
      Number(item.quantity_consumed),
      Number(item.quantity_wasted),
      Number(item.waste_cost),
      item.notes ?? "",
    ]),
  ];
  const drinksSheet = XLSX.utils.aoa_to_sheet(drinksData);
  XLSX.utils.book_append_sheet(wb, drinksSheet, "المشروبات والجاتوه");

  // Sheet 7: Inventory (المخزون)
  const inventoryData = [
    [
      "الصنف",
      "الوحدة",
      "نوع الحركة",
      "الكمية (+/-)",
      "تكلفة الوحدة (ج.م)",
      "تاريخ الحركة",
      "مرتبط بمناسبة",
      "ملاحظات",
    ],
    ...(inventoryMovements ?? []).map((m: any) => [
      m.inventory_items?.name ?? "—",
      m.inventory_items?.unit ?? "وحدة",
      m.movement_type === "purchase"
        ? "شراء"
        : m.movement_type === "consumption"
        ? "استهلاك"
        : m.movement_type === "waste"
        ? "هالك"
        : "تسوية",
      Number(m.quantity_delta),
      Number(m.unit_cost),
      m.movement_date ? new Date(m.movement_date).toLocaleString("ar-EG") : "—",
      m.bookings?.event_name ?? "—",
      m.notes ?? "",
    ]),
  ];
  const inventorySheet = XLSX.utils.aoa_to_sheet(inventoryData);
  XLSX.utils.book_append_sheet(wb, inventorySheet, "المخزون");

  // Sheet 8: Waste (الهالك)
  const wasteData = [
    [
      "نوع الهالك",
      "البيان / الصنف",
      "الكمية الهالكة",
      "التكلفة المقدرة (ج.م)",
      "المناسبة إن وجدت",
      "ملاحظات",
    ],
    ...filteredBookingItems
      .filter((i: any) => Number(i.quantity_wasted) > 0 || Number(i.waste_cost) > 0)
      .map((i: any) => [
        "مستلزمات مناسبة",
        i.product_name,
        Number(i.quantity_wasted),
        Number(i.waste_cost),
        i.bookings?.event_name ?? "—",
        i.notes ?? "",
      ]),
    ...(inventoryMovements ?? [])
      .filter((m: any) => m.movement_type === "waste")
      .map((m: any) => [
        "هالك مخزون مركزي",
        m.inventory_items?.name ?? "—",
        Math.abs(Number(m.quantity_delta)),
        Math.abs(Number(m.quantity_delta)) * Number(m.unit_cost),
        m.bookings?.event_name ?? "—",
        m.notes ?? "",
      ]),
  ];
  const wasteSheet = XLSX.utils.aoa_to_sheet(wasteData);
  XLSX.utils.book_append_sheet(wb, wasteSheet, "الهالك");

  // Sheet 9: Profit & Loss (الأرباح والخسائر)
  const plData = [
    ["قاعتي | Qa3aty — بيان الأرباح والخسائر الشامل"],
    ["الفترة", `من ${startDate} إلى ${endDate}`],
    [],
    ["البند", "التصنيف", "المبلغ (ج.م)"],
    ["إجمالي إيرادات الحجوزات", "إيرادات", report?.booking_revenue ?? 0],
    ["المصروفات التشغيلية", "مصروفات", report?.operating_expenses ?? 0],
    ["أجور العاملين", "مصروفات", report?.worker_costs ?? 0],
    ["تكاليف المشروبات والجاتوه", "تكلفة مبيعات", report?.drinks_cake_costs ?? 0],
    ["تكاليف استهلاك المخزون", "تكلفة مبيعات", report?.inventory_costs ?? 0],
    ["تكلفة الهالك الإجمالية", "خسائر هالك", report?.actual_waste_costs ?? 0],
    [],
    ["صافي الربح / الخسارة", "الصافي", report?.net_profit ?? 0],
    [],
    ["معلومات التدفق النقدي المحصل"],
    ["إجمالي النقدية المحصلة فعليًا", "تحصيل نقدي", report?.collected_payments ?? 0],
    ["مستحقات آجلة لدى العملاء", "ذمم مدينة", report?.outstanding_receivables ?? 0],
  ];
  const plSheet = XLSX.utils.aoa_to_sheet(plData);
  XLSX.utils.book_append_sheet(wb, plSheet, "الأرباح والخسائر");

  // Generate binary output
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return { bytes: new Uint8Array(buffer) };
}
