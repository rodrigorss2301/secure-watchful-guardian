import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LangToggle } from "@/components/lang-toggle";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Autotechs RMM" },
      { name: "description", content: "Access the Autotechs RMM monitoring command center." },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "signup" | "forgot";

function AuthPage() {
  const { user, profile, loading } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");

  // If already authenticated, push to the right place
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (profile?.status === "pending") navigate({ to: "/pending-approval", replace: true });
    else if (profile) navigate({ to: "/dashboard", replace: true });
  }, [user, profile, loading, navigate]);

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background p-4 pt-16 sm:pt-4">
      {/* Atmospheric backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-40" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-primary/10 blur-[100px]" />

      <div className="absolute right-4 top-4 z-10 flex items-center gap-1">
        <LangToggle />
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo size={44} />
        </div>

        <Card className="border-border/60 bg-card/80 p-6 shadow-elegant backdrop-blur-xl md:p-8">
          {mode === "forgot" ? (
            <ForgotPasswordForm onBack={() => setMode("login")} />
          ) : (
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="w-full">
              <TabsList className="mb-6 grid w-full grid-cols-2">
                <TabsTrigger value="login">{t("auth.tab.login")}</TabsTrigger>
                <TabsTrigger value="signup">{t("auth.tab.signup")}</TabsTrigger>
              </TabsList>
              <TabsContent value="login" className="mt-0">
                <LoginForm onForgot={() => setMode("forgot")} />
              </TabsContent>
              <TabsContent value="signup" className="mt-0">
                <SignupForm onSuccess={() => setMode("login")} />
              </TabsContent>
            </Tabs>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Autotechs RMM
        </p>
      </div>
    </main>
  );
}

const emailSchema = z.string().trim().email();

/**
 * Distingue "servidor fora do ar" de "credencial errada".
 * Sem isso, uma queda do backend aparece como um `Failed to fetch` cru na tela
 * e é lida como erro de senha — foi exatamente o que mascarou a queda de agosto.
 */
function isNetworkFailure(err: unknown): boolean {
  if (!err) return false;
  const msg = (typeof err === "string" ? err : (err as { message?: string })?.message ?? "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("fetch failed")
  );
}

async function probeBackend(): Promise<boolean> {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL;
    if (!url) return false;
    await fetch(`${url}/auth/v1/health`, { method: "GET", mode: "no-cors", cache: "no-store" });
    return true;
  } catch {
    return false;
  }
}

function LoginForm({ onForgot }: { onForgot: () => void }) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [probing, setProbing] = useState(false);
  const [loading, setLoading] = useState(false);

  const recheck = async () => {
    setProbing(true);
    const ok = await probeBackend();
    setProbing(false);
    setOffline(!ok);
    if (ok) setError(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOffline(false);
    if (!emailSchema.safeParse(email).success) return setError(t("auth.invalidEmail"));
    if (!password) return setError(t("auth.required"));
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (isNetworkFailure(error)) setOffline(true);
        else setError(error.message);
      }
    } catch (err) {
      // supabase-js relança o TypeError do fetch quando o host não resolve
      if (isNetworkFailure(err)) setOffline(true);
      else setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold">{t("auth.welcome")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("auth.welcome.sub")}</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="login-email">{t("auth.email")}</Label>
          <Input id="login-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">{t("auth.password")}</Label>
            <button type="button" onClick={onForgot} className="-my-2 rounded-sm py-2 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
              {t("auth.forgot")}
            </button>
          </div>
          <Input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {offline && (
          <Alert variant="destructive" role="alert" className="py-3">
            <AlertDescription className="space-y-2 text-xs">
              <p className="font-semibold">{t("auth.offline.title")}</p>
              <p className="opacity-90">{t("auth.offline.body")}</p>
              <button
                type="button"
                onClick={recheck}
                disabled={probing}
                className="inline-flex min-h-9 items-center rounded-sm font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {probing && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden="true" />}
                {probing ? t("auth.checking") : t("auth.offline.retry")}
              </button>
            </AlertDescription>
          </Alert>
        )}
        {error && !offline && (
          <Alert variant="destructive" role="alert" className="py-2.5">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full font-semibold shadow-glow" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {t("auth.signIn")}
        </Button>
      </form>
    </div>
  );
}

function SignupForm({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useI18n();
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) return setError(t("auth.required"));
    if (!company.trim()) return setError(t("auth.required"));
    if (!emailSchema.safeParse(email).success) return setError(t("auth.invalidEmail"));
    if (password.length < 8) return setError(t("auth.passwordMin"));

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
        data: { full_name: fullName.trim(), company_name: company.trim() },
      },
    });
    setLoading(false);
    if (error) return setError(error.message);
    toast.success(t("auth.signedUp"));
    onSuccess();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold">{t("auth.signup.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("auth.signup.sub")}</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-3.5">
        <div className="space-y-1.5">
          <Label htmlFor="su-name">{t("auth.fullName")}</Label>
          <Input id="su-name" autoComplete="name" required maxLength={100} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="su-company">{t("auth.company")}</Label>
          <Input id="su-company" autoComplete="organization" aria-describedby="su-company-help" required maxLength={100} value={company} onChange={(e) => setCompany(e.target.value)} />
          <p id="su-company-help" className="text-xs leading-snug text-muted-foreground">{t("auth.company.help")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="su-email">{t("auth.email")}</Label>
          <Input id="su-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="su-password">{t("auth.password")}</Label>
          <Input id="su-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && (
          <Alert variant="destructive" role="alert" className="py-2.5">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full font-semibold shadow-glow" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {t("auth.signUp")}
        </Button>
      </form>
    </div>
  );
}

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!emailSchema.safeParse(email).success) return setError(t("auth.invalidEmail"));
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return setError(error.message);
    setSent(true);
    toast.success(t("auth.reset.sent"));
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold">{t("auth.forgot.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("auth.forgot.sub")}</p>
      </div>
      {sent ? (
        <Alert role="status">
          <AlertDescription>{t("auth.reset.sent")}</AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fp-email">{t("auth.email")}</Label>
            <Input id="fp-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && (
            <Alert variant="destructive" role="alert" className="py-2.5">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full font-semibold" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t("auth.sendReset")}
          </Button>
        </form>
      )}
      <Button type="button" variant="ghost" className="mt-3 w-full" onClick={onBack}>
        {t("auth.back")}
      </Button>
    </div>
  );
}