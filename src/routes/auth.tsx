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
      { title: "Autotechs RMM — Sign in" },
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
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background p-4">
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
    </div>
  );
}

const emailSchema = z.string().trim().email();

function LoginForm({ onForgot }: { onForgot: () => void }) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!emailSchema.safeParse(email).success) return setError(t("auth.invalidEmail"));
    if (!password) return setError(t("auth.required"));
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
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
            <button type="button" onClick={onForgot} className="text-xs font-medium text-primary hover:underline">
              {t("auth.forgot")}
            </button>
          </div>
          <Input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && (
          <Alert variant="destructive" className="py-2.5">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full font-semibold shadow-glow" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
          <Input id="su-name" required maxLength={100} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="su-company">{t("auth.company")}</Label>
          <Input id="su-company" required maxLength={100} value={company} onChange={(e) => setCompany(e.target.value)} />
          <p className="text-[11px] leading-snug text-muted-foreground">{t("auth.company.help")}</p>
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
          <Alert variant="destructive" className="py-2.5">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full font-semibold shadow-glow" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
        <Alert>
          <AlertDescription>{t("auth.reset.sent")}</AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fp-email">{t("auth.email")}</Label>
            <Input id="fp-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && (
            <Alert variant="destructive" className="py-2.5">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full font-semibold" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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