import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ArrowLeft, Building2, Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { loginWithUsername } from "@/lib/auth.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "دخول المطوّر | قاعتي — Qa3aty" },
      { name: "description", content: "دخول خاص بمطوّر منصة قاعتي لإدارة العملاء والاشتراكات." },
      { property: "og:title", content: "دخول المطوّر | قاعتي — Qa3aty" },
      { property: "og:description", content: "بوابة المطوّر الخاصة بمنصة قاعتي لإدارة قاعات الأفراح." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeveloperSignIn,
});

function DeveloperSignIn() {
  const navigate = useNavigate();
  const login = useServerFn(loginWithUsername);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("Ahmed Elshora");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) void navigate({ to: "/dashboard", replace: true });
    });
    return () => { data.subscription.unsubscribe(); };
  }, [navigate]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await login({ data: { username, password } });
      if (!result.ok) { toast.error(result.error); return; }
      const { error } = await supabase.auth.setSession({ access_token: result.session.access_token, refresh_token: result.session.refresh_token });
      if (error) { toast.error("تعذر فتح جلسة الدخول."); return; }
      await navigate({ to: "/dashboard", replace: true });
    } catch { toast.error("تعذر تسجيل الدخول. تحقق من البيانات وحاول مجددًا."); }
    finally { setBusy(false); }
  }

  return (
    <main className="qa3aty-login min-h-screen" dir="rtl">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl lg:grid-cols-[1fr_0.95fr]">
        <section className="relative flex min-h-[320px] flex-col justify-between overflow-hidden bg-sidebar px-7 py-8 text-sidebar-foreground sm:px-12 sm:py-12 lg:min-h-screen lg:px-16">
          <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"><Building2 className="size-5"/></span><span><span className="block text-lg font-semibold">قاعتي</span><span className="text-xs text-sidebar-foreground/65">Qa3aty</span></span></div>
          <div className="relative z-10 max-w-lg py-7 lg:py-0"><p className="mb-3 flex items-center gap-2 text-sm text-sidebar-primary"><ShieldCheck className="size-4"/>منصة إدارة القاعات</p><h1 className="text-3xl font-semibold leading-tight sm:text-4xl">إدارة منظومة قاعتي<br/>في مكان واحد.</h1><p className="mt-4 max-w-md leading-7 text-sidebar-foreground/70">بوابة مطوّر خاصة لإدارة حسابات العملاء والاشتراكات.</p></div>
          <div className="hidden items-center gap-2 border-t border-sidebar-border pt-5 text-xs text-sidebar-foreground/60 lg:flex"><span className="size-1.5 rounded-full bg-sidebar-primary"/> وصول إداري آمن <span className="mx-1">·</span> بيانات منفصلة لكل عميل</div>
        </section>
        <section className="flex items-center justify-center px-5 py-10 sm:px-12 lg:px-16">
          <div className="w-full max-w-md">
            <div className="mb-8"><p className="text-sm text-muted-foreground">قاعتي | Qa3aty</p><h2 className="mt-2 text-2xl font-semibold">مرحبًا بعودتك</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">سجّل الدخول للمتابعة إلى لوحة إدارة المنصة.</p></div>
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2"><Label htmlFor="username">اسم المستخدم</Label><Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" dir="ltr"/></div>
              <div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="password">كلمة المرور</Label><span className="text-xs text-muted-foreground">دخول خاص بالمطوّر</span></div><div className="relative"><Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" dir="ltr" className="pl-10"/><Button type="button" variant="ghost" size="icon" className="absolute left-1 top-1/2 size-8 -translate-y-1/2" aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff className="size-4"/> : <Eye className="size-4"/>}</Button></div></div>
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "جارٍ التحقق…" : "تسجيل الدخول"}<ArrowLeft className="size-4"/></Button>
              <p className="text-center text-xs text-muted-foreground">لإعادة تعيين كلمة مرور عميل، استخدم لوحة المطوّر بعد تسجيل الدخول.</p>
            </form>
            <div className="mt-10 flex items-center justify-center gap-2 text-xs text-muted-foreground"><KeyRound className="size-3.5"/> منصة قاعتي · وصول مخصص للمطوّر فقط</div>
          </div>
        </section>
      </div>
    </main>
  );
}