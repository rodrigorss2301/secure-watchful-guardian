import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/portal/tickets")({
  head: () => ({
    meta: [
      { title: "Abrir chamado — Suporte" },
      { name: "description", content: "Envie uma solicitação de suporte sem precisar de cadastro." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublicPortalPage,
});

type Intake = { slug: string; client_name: string; tenant_name: string };

function PublicPortalPage() {
  const { t } = useI18n();
  const [intake, setIntake] = useState<Intake | null>(null);
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ number: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", title: "", description: "", priority: "medium",
  });

  useEffect(() => {
    fetch("/api/public/tickets/default-intake")
      .then(async (r) => {
        if (r.status === 404) { setNotConfigured(true); return; }
        if (!r.ok) throw new Error("lookup");
        setIntake(await r.json());
      })
      .catch(() => setNotConfigured(true))
      .finally(() => setLoading(false));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!intake) return;
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/public/tickets/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: intake.slug, ...form }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail || body?.error || t("submit.sendError"));
      setSuccess({ number: body.number });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("submit.sendError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <LifeBuoy className="h-4 w-4 text-primary" />
          <span>{intake?.tenant_name ?? t("submit.support")}</span>
        </div>

        {loading && (
          <Card role="status" className="p-8 text-center text-sm text-muted-foreground">{t("common.loading")}</Card>
        )}

        {!loading && notConfigured && (
          <Card role="alert" className="p-8 text-center">
            <h1 className="font-display text-xl font-semibold">{t("submit.unavailable.title")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("submit.unavailable.body")}
            </p>
          </Card>
        )}

        {!loading && intake && success && (
          <Card role="status" className="p-8 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" aria-hidden="true" />
            <h1 className="font-display text-2xl font-semibold">{t("submit.sent.title")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("submit.sent.body1")} <strong className="font-mono">{success.number}</strong>. {t("submit.sent.body2")}
            </p>
            <Button
              className="mt-6"
              variant="outline"
              onClick={() => {
                setSuccess(null);
                setForm({ name: "", email: "", phone: "", title: "", description: "", priority: "medium" });
              }}
            >
              {t("submit.another")}
            </Button>
          </Card>
        )}

        {!loading && intake && !success && (
          <Card className="p-5 sm:p-6">
            <h1 className="font-display text-2xl font-semibold">{t("portal.new")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("submit.intro")}
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="ticket-name" label={t("submit.name")} required>
                  <Input id="ticket-name" autoComplete="name" value={form.name} maxLength={120} required
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field id="ticket-email" label={t("submit.email")} required>
                  <Input id="ticket-email" type="email" autoComplete="email" value={form.email} maxLength={160} required
                    onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field id="ticket-phone" label={t("submit.phone")}>
                  <Input id="ticket-phone" type="tel" autoComplete="tel" value={form.phone} maxLength={40}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </Field>
                <Field id="ticket-priority" label={t("portal.field.priority")}>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger id="ticket-priority"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">{t("tickets.priority.low")}</SelectItem>
                      <SelectItem value="medium">{t("tickets.priority.medium")}</SelectItem>
                      <SelectItem value="high">{t("tickets.priority.high")}</SelectItem>
                      <SelectItem value="urgent">{t("tickets.priority.urgent")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field id="ticket-title" label={t("portal.field.title")} required>
                <Input id="ticket-title" value={form.title} maxLength={200} required
                  onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </Field>
              <Field id="ticket-description" label={t("portal.field.description")}>
                <Textarea id="ticket-description" rows={5} value={form.description} maxLength={5000}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>

              {error && (
                <p role="alert" className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={submitting} className="w-full shadow-glow">
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {t("submit.send")}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </main>
  );
}

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}{required && <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>}
      </Label>
      {children}
    </div>
  );
}