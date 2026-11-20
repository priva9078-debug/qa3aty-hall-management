import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownLeft, ArrowUpLeft, Building2, CalendarDays, Check, ChevronDown, CircleDollarSign,
  Clock3, DoorOpen, House, KeyRound, LayoutDashboard, LogOut, MoreHorizontal, Plus, Search,
  ShieldCheck, UserRound, Users, WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { createDeveloperTenant, extendTenantSubscription, getDeveloperDashboard, listDeveloperTenants, resetTenantPassword, setTenantStatus } from "@/lib/auth.functions";

type Dashboard = Extract<Awaited<ReturnType<typeof getDeveloperDashboard>>, { state: "ready" }>;
type Tenant = NonNullable<Awaited<ReturnType<typeof listDeveloperTenants>> extends { tenants?: infer T } ? T : never>[number];
type Panel = "overview" | "customers";
type Modal = "create" | "extend" | "reset" | null;

const emptyTenantForm = {
  fullName: "", tenantName: "", primaryHallName: "", username: "", password: "", phone: "",
  plan: "monthly", startsAt: localInputValue(new Date()), endsAt: localInputValue(new Date(Date.now() + 30 * 86400_000)),
  subscriptionPrice: "0", status: "active", notes: "",
};

function localInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(value ?? 0);
}

function dateLabel(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value)) : "—";
}

function stateLabel(status: string) {
  return status === "active" ? "نشط" : status === "suspended" ? "موقوف" : status === "cancelled" ? "ملغي" : status;
}

function planLabel(plan: string | undefined) {
  return plan === "yearly" ? "سنوي" : plan === "monthly" ? "شهري" : plan === "custom" ? "مخصص" : "—";
}

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة المطوّر | قاعتي" },
      { name: "description", content: "لوحة إدارة عملاء واشتراكات قاعتي للمطوّر." },
      { property: "og:title", content: "لوحة المطوّر | قاعتي" },
      { property: "og:description", content: "إدارة عملاء واشتراكات منصة قاعتي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeveloperDashboard,
});

function DeveloperDashboard() {
  const navigate = useNavigate();
  const loadDashboard = useServerFn(getDeveloperDashboard);
  const loadTenants = useServerFn(listDeveloperTenants);
  const addTenant = useServerFn(createDeveloperTenant);
  const changeStatus = useServerFn(setTenantStatus);
  const extendSubscription = useServerFn(extendTenantSubscription);
  const resetPassword = useServerFn(resetTenantPassword);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [busy, setBusy] = useState(true);
  const [working, setWorking] = useState(false);
  const [panel, setPanel] = useState<Panel>("overview");
  const [modal, setModal] = useState<Modal>(null);
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tenantForm, setTenantForm] = useState(emptyTenantForm);
  const [newPassword, setNewPassword] = useState("");
  const [extensionDays, setExtensionDays] = useState("30");

  const load = async () => {
    setBusy(true);
    try {
      const result = await loadDashboard();
      if (result.state === "ready") {
        setDashboard(result);
        const listed = await loadTenants({ data: { search, status: statusFilter as "all" | "active" | "suspended" } });
        if ("tenants" in listed && listed.ok) setTenants(listed.tenants as Tenant[]);
      } else if (result.state === "signed_out") {
        await navigate({ to: "/" });
      } else if (result.state === "forbidden") {
        setDashboard(null);
      }
    } catch {
      await navigate({ to: "/" });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, [search, statusFilter]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") void navigate({ to: "/", replace: true });
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") void load();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const expiringCount = dashboard?.metrics.expiringSoon ?? 0;
  const title = panel === "overview" ? "نظرة عامة" : "إدارة العملاء";
  const filteredCount = useMemo(() => tenants.length, [tenants]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    try {
      const result = await addTenant({ data: {
        fullName: tenantForm.fullName, tenantName: tenantForm.tenantName, primaryHallName: tenantForm.primaryHallName,
        username: tenantForm.username.trim().toLowerCase(), password: tenantForm.password, phone: tenantForm.phone,
        plan: tenantForm.plan as "monthly" | "yearly" | "custom", startsAt: new Date(tenantForm.startsAt).toISOString(),
        endsAt: new Date(tenantForm.endsAt).toISOString(), subscriptionPrice: Number(tenantForm.subscriptionPrice),
        status: tenantForm.status as "active" | "suspended", notes: tenantForm.notes,
      } });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success("تم إنشاء حساب العميل والاشتراك بنجاح.");
      setModal(null);
      setTenantForm({ ...emptyTenantForm, startsAt: localInputValue(new Date()), endsAt: localInputValue(new Date(Date.now() + 30 * 86400_000)) });
      await load();
    } catch {
      toast.error("تعذر إنشاء العميل. راجع البيانات وحاول مجددًا.");
    } finally { setWorking(false); }
  }

  async function handleStatus(tenant: Tenant) {
    const status = tenant.status === "active" ? "suspended" : "active";
    const result = await changeStatus({ data: { tenantId: tenant.id, status } });
    if (!result.ok) { toast.error(result.error); return; }
    toast.success(status === "active" ? "تم تفعيل الحساب." : "تم إيقاف الحساب.");
    await load();
  }

  async function handleExtend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setWorking(true);
    try {
      const result = await extendSubscription({ data: { tenantId: selected.id, days: Number(extensionDays), price: 0 } });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success("تم تمديد الاشتراك بنجاح."); setModal(null); await load();
    } catch { toast.error("تعذر تمديد الاشتراك."); }
    finally { setWorking(false); }
  }

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setWorking(true);
    try {
      const result = await resetPassword({ data: { tenantId: selected.id, newPassword } });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success("تم تغيير كلمة مرور المدير."); setModal(null); setNewPassword("");
    } catch { toast.error("تعذر إعادة تعيين كلمة المرور."); }
    finally { setWorking(false); }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/", replace: true });
  }

  if (busy) return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-sm text-muted-foreground">جارٍ تجهيز اللوحة…</p></div>;
  if (!dashboard) return <div className="flex min-h-screen items-center justify-center bg-background px-5"><div className="max-w-md text-center"><ShieldCheck className="mx-auto mb-4 size-10 text-primary"/><h1 className="text-xl font-semibold">هذه الصفحة للمطوّر فقط</h1><p className="mt-2 text-muted-foreground">سجّل الدخول بحساب المطوّر للمتابعة.</p><Button className="mt-6" onClick={() => void navigate({ to: "/" })}>العودة لتسجيل الدخول</Button></div></div>;

  return (
    <div className="qa3aty-shell" dir="rtl">
      <div className="min-h-screen md:grid md:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="bg-sidebar text-sidebar-foreground md:min-h-screen">
          <div className="flex items-center justify-between px-5 py-5 md:block md:px-6 md:py-7">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"><Building2 className="size-5"/></div>
              <div><p className="font-semibold">قاعتي</p><p className="text-xs text-sidebar-foreground/65">Qa3aty · المطوّر</p></div>
            </div>
            <Button aria-label="تسجيل الخروج" title="تسجيل الخروج" variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent md:hidden" onClick={() => void handleSignOut()}><LogOut className="size-4"/></Button>
          </div>
          <nav className="flex gap-2 border-t border-sidebar-border px-4 py-3 md:flex-col md:border-0 md:px-3 md:pt-5">
            <Button variant={panel === "overview" ? "secondary" : "ghost"} className={`justify-start md:w-full ${panel === "overview" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent"}`} onClick={() => setPanel("overview")}><LayoutDashboard className="size-4"/>نظرة عامة</Button>
            <Button variant={panel === "customers" ? "secondary" : "ghost"} className={`justify-start md:w-full ${panel === "customers" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent"}`} onClick={() => setPanel("customers")}><Users className="size-4"/>العملاء والاشتراكات</Button>
            <div className="hidden border-t border-sidebar-border pt-4 md:mt-4 md:block"><p className="px-3 text-xs text-sidebar-foreground/55">إدارة المنصة</p><div className="mt-3 flex items-center gap-2 px-3 text-xs text-sidebar-foreground/75"><ShieldCheck className="size-4 text-sidebar-primary"/>وصول المطوّر</div></div>
          </nav>
          <div className="hidden border-t border-sidebar-border px-5 py-4 md:fixed md:bottom-0 md:block md:w-[248px]"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{dashboard.profile.full_name}</p><p className="truncate text-xs text-sidebar-foreground/60">{dashboard.profile.username}</p></div><Button aria-label="تسجيل الخروج" title="تسجيل الخروج" variant="ghost" size="icon" className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => void handleSignOut()}><LogOut className="size-4"/></Button></div></div>
        </aside>

        <main className="min-w-0 px-4 pb-10 pt-6 sm:px-7 lg:px-10 lg:pt-9">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
            <div><div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><House className="size-3.5"/><span>المنصة</span><ChevronDown className="size-3 rotate-90"/><span>{title}</span></div><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-1 text-sm text-muted-foreground">إدارة حسابات القاعات والاشتراكات.</p></div>
            <div className="flex items-center gap-2"><Badge variant="outline" className="gap-1.5 border-primary/30 bg-primary/5 text-primary"><ShieldCheck className="size-3.5"/>حساب المطوّر</Badge><Button aria-label="تسجيل الخروج" title="تسجيل الخروج" variant="outline" size="icon" className="md:hidden" onClick={() => void handleSignOut()}><LogOut className="size-4"/></Button></div>
          </header>

          {panel === "overview" ? (
            <section className="pt-7">
              <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">مؤشرات المنصة</h2><p className="mt-1 text-sm text-muted-foreground">ملخص حسابات القاعات والاشتراكات.</p></div><Button onClick={() => setPanel("customers")} variant="outline" className="shrink-0">عرض العملاء<ArrowLeftIcon/></Button></div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                <Metric icon={<Users/>} label="إجمالي العملاء" value={dashboard.metrics.totalTenants} tone="navy"/>
                <Metric icon={<Check/>} label="حسابات نشطة" value={dashboard.metrics.activeTenants} tone="green"/>
                <Metric icon={<Clock3/>} label="اشتراكات منتهية" value={dashboard.metrics.expiredSubscriptions} tone="gold"/>
                <Metric icon={<DoorOpen/>} label="حسابات موقوفة" value={dashboard.metrics.suspendedTenants} tone="rose"/>
                <Metric icon={<Building2/>} label="القاعات المسجلة" value={dashboard.metrics.halls} tone="purple"/>
                <Metric icon={<CalendarDays/>} label="تنتهي خلال 30 يومًا" value={expiringCount} tone="gold"/>
              </div>
              <div className="mt-8 flex items-center justify-between border-b border-border pb-4"><div><h2 className="text-lg font-semibold">أحدث العملاء</h2><p className="mt-1 text-sm text-muted-foreground">آخر الحسابات التي أُضيفت إلى المنصة.</p></div><Button variant="outline" onClick={() => setPanel("customers")}>كل العملاء<ArrowLeftIcon/></Button></div>
              <TenantTable tenants={tenants.slice(0, 5)} onStatus={handleStatus} onExtend={(tenant) => { setSelected(tenant); setModal("extend"); }} onReset={(tenant) => { setSelected(tenant); setModal("reset"); }} compact/>
            </section>
          ) : (
            <section className="pt-7">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-lg font-semibold">العملاء والاشتراكات</h2><p className="mt-1 text-sm text-muted-foreground">{filteredCount} عميلًا · إدارة حسابات المنشآت.</p></div><Button onClick={() => setModal("create")}><Plus className="size-4"/>إضافة عميل</Button></div>
              <div className="mb-4 flex flex-wrap gap-3"><div className="relative min-w-[220px] flex-1 sm:max-w-md"><Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input className="pr-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو القاعة أو الهاتف" aria-label="البحث عن عميل"/></div><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-40"><SelectValue placeholder="حالة الحساب"/></SelectTrigger><SelectContent><SelectItem value="all">كل الحالات</SelectItem><SelectItem value="active">نشط</SelectItem><SelectItem value="suspended">موقوف</SelectItem></SelectContent></Select></div>
              <TenantTable tenants={tenants} onStatus={handleStatus} onExtend={(tenant) => { setSelected(tenant); setModal("extend"); }} onReset={(tenant) => { setSelected(tenant); setModal("reset"); }}/>
            </section>
          )}
        </main>
      </div>

      <Dialog open={modal === "create"} onOpenChange={(open) => { if (!open && !working) setModal(null); }}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" dir="rtl">
          <DialogHeader className="text-right"><DialogTitle>إضافة عميل جديد</DialogTitle><DialogDescription>إنشاء حساب مدير القاعة والمنشأة والاشتراك.</DialogDescription></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="الاسم الكامل"><Input required minLength={2} value={tenantForm.fullName} onChange={(e) => setTenantForm({...tenantForm, fullName:e.target.value})} autoComplete="name"/></Field>
              <Field label="اسم المنشأة"><Input required minLength={2} value={tenantForm.tenantName} onChange={(e) => setTenantForm({...tenantForm, tenantName:e.target.value})}/></Field>
              <Field label="اسم القاعة الرئيسية"><Input required value={tenantForm.primaryHallName} onChange={(e) => setTenantForm({...tenantForm, primaryHallName:e.target.value})}/></Field>
              <Field label="اسم المستخدم"><Input required minLength={3} pattern="[A-Za-z0-9._-]+" value={tenantForm.username} onChange={(e) => setTenantForm({...tenantForm, username:e.target.value})} autoComplete="username" dir="ltr"/></Field>
              <Field label="كلمة المرور"><Input required minLength={12} maxLength={128} type="password" value={tenantForm.password} onChange={(e) => setTenantForm({...tenantForm, password:e.target.value})} autoComplete="new-password" dir="ltr"/></Field>
              <Field label="رقم الهاتف"><Input value={tenantForm.phone} onChange={(e) => setTenantForm({...tenantForm, phone:e.target.value})} inputMode="tel" dir="ltr"/></Field>
              <Field label="نوع الاشتراك"><Select value={tenantForm.plan} onValueChange={(plan) => setTenantForm({...tenantForm, plan})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="monthly">شهري</SelectItem><SelectItem value="yearly">سنوي</SelectItem><SelectItem value="custom">مدة مخصصة</SelectItem></SelectContent></Select></Field>
              <Field label="حالة الحساب"><Select value={tenantForm.status} onValueChange={(status) => setTenantForm({...tenantForm, status})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="active">نشط</SelectItem><SelectItem value="suspended">موقوف</SelectItem></SelectContent></Select></Field>
              <Field label="بداية الاشتراك"><Input required type="datetime-local" value={tenantForm.startsAt} onChange={(e) => setTenantForm({...tenantForm, startsAt:e.target.value})} dir="ltr"/></Field>
              <Field label="نهاية الاشتراك"><Input required type="datetime-local" value={tenantForm.endsAt} onChange={(e) => setTenantForm({...tenantForm, endsAt:e.target.value})} dir="ltr"/></Field>
              <Field label="قيمة الاشتراك بالجنيه"><Input required type="number" min="0" step="0.01" value={tenantForm.subscriptionPrice} onChange={(e) => setTenantForm({...tenantForm, subscriptionPrice:e.target.value})} dir="ltr"/></Field>
              <Field label="ملاحظات (اختياري)"><Input value={tenantForm.notes} onChange={(e) => setTenantForm({...tenantForm, notes:e.target.value})}/></Field>
            </div>
            <DialogFooter className="gap-2 sm:gap-2"><Button type="button" variant="outline" onClick={() => setModal(null)} disabled={working}>إلغاء</Button><Button disabled={working} type="submit"><Plus className="size-4"/>{working ? "جارٍ الإنشاء…" : "إنشاء حساب العميل"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "extend"} onOpenChange={(open) => { if (!open && !working) setModal(null); }}><DialogContent dir="rtl"><DialogHeader className="text-right"><DialogTitle>تمديد الاشتراك</DialogTitle><DialogDescription>تمديد {selected?.name ?? ""} وإعادة تفعيله.</DialogDescription></DialogHeader><form onSubmit={handleExtend} className="space-y-4"><Field label="عدد الأيام"><Input type="number" min="1" max="3650" value={extensionDays} onChange={(e) => setExtensionDays(e.target.value)} required dir="ltr"/></Field><DialogFooter className="gap-2 sm:gap-2"><Button type="button" variant="outline" onClick={() => setModal(null)}>إلغاء</Button><Button type="submit" disabled={working}>تأكيد التمديد</Button></DialogFooter></form></DialogContent></Dialog>
      <Dialog open={modal === "reset"} onOpenChange={(open) => { if (!open && !working) setModal(null); }}><DialogContent dir="rtl"><DialogHeader className="text-right"><DialogTitle>إعادة تعيين كلمة المرور</DialogTitle><DialogDescription>كلمة مرور جديدة لمدير {selected?.name ?? "العميل"}.</DialogDescription></DialogHeader><form onSubmit={handleReset} className="space-y-4"><Field label="كلمة المرور الجديدة"><Input type="password" minLength={12} maxLength={128} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required dir="ltr"/></Field><DialogFooter className="gap-2 sm:gap-2"><Button type="button" variant="outline" onClick={() => setModal(null)}>إلغاء</Button><Button type="submit" disabled={working}><KeyRound className="size-4"/>تعيين كلمة المرور</Button></DialogFooter></form></DialogContent></Dialog>
    </div>
  );
}

function ArrowLeftIcon() { return <ArrowUpLeft className="size-4"/>; }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label className="qa3aty-label">{label}</Label>{children}</div>;
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "navy" | "green" | "gold" | "rose" | "purple" }) {
  return <div className="border-y border-border bg-card px-4 py-4 first:border-t sm:rounded-md sm:border"><div className={`qa3aty-metric-icon qa3aty-metric-${tone}`}>{icon}</div><div className="mt-3 text-2xl font-semibold tabular-nums">{new Intl.NumberFormat("ar-EG").format(value)}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{label}</p></div>;
}

function TenantTable({ tenants, onStatus, onExtend, onReset, compact = false }: { tenants: Tenant[]; onStatus: (tenant: Tenant) => void; onExtend: (tenant: Tenant) => void; onReset: (tenant: Tenant) => void; compact?: boolean }) {
  return <div className="overflow-hidden border-y border-border bg-card sm:mt-4 sm:rounded-md sm:border">
    <Table><TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead>العميل</TableHead><TableHead>اسم المستخدم</TableHead><TableHead>الاشتراك</TableHead><TableHead>ينتهي في</TableHead><TableHead>القاعات</TableHead><TableHead>الحالة</TableHead><TableHead className="w-16">إجراء</TableHead></TableRow></TableHeader>
      <TableBody>{tenants.length === 0 ? <TableRow><TableCell colSpan={7} className="h-28 text-center text-muted-foreground">لا توجد حسابات مطابقة.</TableCell></TableRow> : tenants.map((tenant) => {
        const admin = tenant.admin;
        const subscription = Array.isArray(tenant.subscriptions) ? tenant.subscriptions[0] : tenant.subscriptions;
        return <TableRow key={tenant.id}>
          <TableCell><div className="flex min-w-44 items-center gap-2.5"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-secondary text-secondary-foreground"><Building2 className="size-4"/></span><span className="min-w-0"><span className="block truncate font-medium">{tenant.name}</span><span className="block truncate text-xs text-muted-foreground">{admin?.full_name ?? tenant.primary_hall_name}</span></span></div></TableCell>
          <TableCell className="font-mono text-xs" dir="ltr">{admin?.username ?? "—"}</TableCell><TableCell><span className="font-medium">{planLabel(subscription?.plan)}</span><span className="block text-xs text-muted-foreground">{money(subscription?.price)}</span></TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{dateLabel(subscription?.ends_at)}</TableCell><TableCell>{Array.isArray(tenant.halls) ? tenant.halls.length : 0}</TableCell><TableCell><Badge variant={tenant.status === "active" ? "default" : "destructive"}>{stateLabel(tenant.status)}</Badge></TableCell>
          <TableCell><div className="flex items-center gap-0.5"><Button variant="ghost" size="icon" className="size-8" aria-label={tenant.status === "active" ? "إيقاف الحساب" : "تفعيل الحساب"} title={tenant.status === "active" ? "إيقاف الحساب" : "تفعيل الحساب"} onClick={() => void onStatus(tenant)}>{tenant.status === "active" ? <DoorOpen className="size-4"/> : <Check className="size-4"/>}</Button>{!compact && <Button variant="ghost" size="icon" className="size-8" aria-label="تمديد الاشتراك" title="تمديد الاشتراك" onClick={() => onExtend(tenant)}><Clock3 className="size-4"/></Button>}{!compact && <Button variant="ghost" size="icon" className="size-8" aria-label="إعادة تعيين كلمة المرور" title="إعادة تعيين كلمة المرور" onClick={() => onReset(tenant)}><KeyRound className="size-4"/></Button>}</div></TableCell>
        </TableRow>;
      })}</TableBody></Table>
  </div>;
}