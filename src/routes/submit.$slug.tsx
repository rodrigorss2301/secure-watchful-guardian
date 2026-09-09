import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/submit/$slug")({
  head: () => ({
    meta: [
      { title: "Abrir chamado" },
      { name: "description", content: "Envie uma solicitação de suporte." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublicIntakePage,
});

import { ClientBrandHeader } from "@/components/clients/client-brand-header";
import { normalizeBranding, brandForeground, type ClientBranding } from "@/lib/client-branding";

type Intake = ClientBranding & { client_name: string; tenant_name: string };

function PublicIntakePage() {
  const { slug } = Route.useParams();
  return <ClientIntakePage key={slug} slug={slug} />;
}

function ClientIntakePage({ slug }: { slug: string }) {
  const [intake, setIntake] = useState<Intake | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ number: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    title: "",
    description: "",
    priority: "medium",
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/public/tickets/lookup?slug=${encodeURIComponent(slug)}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        if (r.status === 404) {
          setNotFound(true);
          return;
        }
        if (!r.ok) throw new Error("lookup");
        setIntake(await r.json());
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Não foi possível carregar o portal. Tente atualizar a página.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [slug]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!intake || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/public/tickets/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...form }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail || body?.error || "erro");
      setSuccess({ number: body.number });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao enviar");
    } finally {
      setSubmitting(false);
    }
  }

  const brand = normalizeBranding(intake);

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        {intake && !loading && (
          <div className="mb-6">
            <ClientBrandHeader name={intake.client_name} branding={intake} />
          </div>
        )}
        {!loading && !intake && error && (
          <Card role="alert" className="p-8 text-center">
            <p>{error}</p>
            <Button className="mt-4" onClick={() => window.location.reload()}>
              Tentar novamente
            </Button>
          </Card>
        )}

        {loading && (
          <Card className="p-8 text-center text-sm text-muted-foreground">Carregando…</Card>
        )}

        {!loading && notFound && (
          <Card className="p-8 text-center">
            <h1 className="font-display text-xl font-semibold">Link inválido</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Este link de atendimento não existe ou foi desativado.
            </p>
          </Card>
        )}

        {!loading && intake && success && (
          <Card className="p-8 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
            <h2 className="font-display text-2xl font-semibold">Chamado enviado!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Registramos sua solicitação. Nº{" "}
              <strong className="font-mono">{success.number}</strong>. Nossa equipe entrará em
              contato pelo e-mail informado.
            </p>
            <Button
              className="mt-6"
              variant="outline"
              onClick={() => {
                setSuccess(null);
                setForm({
                  name: "",
                  email: "",
                  phone: "",
                  title: "",
                  description: "",
                  priority: "medium",
                });
              }}
            >
              Abrir outro chamado
            </Button>
          </Card>
        )}

        {!loading && intake && !success && (
          <Card className="p-6">
            <h2 className="font-display text-2xl font-semibold">Abrir chamado</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Envie sua solicitação para <strong>{intake.client_name}</strong>. Sem cadastro
              necessário.
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Seu nome" required>
                  <Input
                    value={form.name}
                    maxLength={120}
                    required
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="E-mail" required>
                  <Input
                    type="email"
                    value={form.email}
                    maxLength={160}
                    required
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
                <Field label="Telefone">
                  <Input
                    value={form.phone}
                    maxLength={40}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Field>
                <Field label="Prioridade">
                  <Select
                    value={form.priority}
                    onValueChange={(v) => setForm({ ...form, priority: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baixa</SelectItem>
                      <SelectItem value="medium">Média</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Assunto" required>
                <Input
                  value={form.title}
                  maxLength={200}
                  required
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </Field>
              <Field label="Descreva o problema">
                <Textarea
                  rows={5}
                  value={form.description}
                  maxLength={5000}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>

              {error && (
                <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full"
                style={{
                  backgroundColor: brand.portal_primary_color,
                  color: brandForeground(brand.portal_primary_color),
                }}
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar chamado
              </Button>
            </form>
          </Card>
        )}
        {intake && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Atendimento de TI · {intake.tenant_name}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
