import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";
import {
  AUTOMATION_KINDS, AUTOMATION_LANGUAGES, AUTOMATION_SCOPES, AUTOMATION_TRIGGERS,
  type Automation, type AutomationKind, type AutomationLanguage, type AutomationScope, type AutomationTrigger,
} from "@/lib/automations";
import type { Database } from "@/integrations/supabase/types";

type PowerAction = Database["public"]["Enums"]["endpoint_command_type"];
const POWER_ACTIONS: PowerAction[] = ["wake_on_lan", "shutdown", "restart", "sleep", "hibernate", "logoff"];
const CRON_PRESETS: { key: string; expr: string }[] = [
  { key: "automations.cron.preset.daily8", expr: "0 8 * * *" },
  { key: "automations.cron.preset.daily19", expr: "0 19 * * *" },
  { key: "automations.cron.preset.weekdays8", expr: "0 8 * * 1-5" },
  { key: "automations.cron.preset.weekdays19", expr: "0 19 * * 1-5" },
  { key: "automations.cron.preset.hourly", expr: "0 * * * *" },
];

type Props = { open: boolean; onOpenChange: (o: boolean) => void; automation?: Automation | null };

type FormState = {
  name: string;
  description: string;
  kind: AutomationKind;
  language: AutomationLanguage;
  code: string;
  trigger: AutomationTrigger;
  cron_expr: string;
  scope: AutomationScope;
  client_id: string;
  endpoint_id: string;
  notify_email: string;
  enabled: boolean;
  power_action: PowerAction | "";
  power_delay_seconds: number;
  power_message: string;
};

const empty: FormState = {
  name: "", description: "", kind: "script", language: "powershell", code: "",
  trigger: "manual", cron_expr: "", scope: "all", client_id: "", endpoint_id: "",
  notify_email: "", enabled: true,
  power_action: "", power_delay_seconds: 30, power_message: "",
};

export function AutomationFormDialog({ open, onOpenChange, automation }: Props) {
  const { t } = useI18n();
  const { tenant } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(empty);

  useEffect(() => {
    if (!open) return;
    if (automation) {
      setForm({
        name: automation.name,
        description: automation.description ?? "",
        kind: automation.kind,
        language: automation.language,
        code: automation.code ?? "",
        trigger: automation.trigger,
        cron_expr: automation.cron_expr ?? "",
        scope: automation.scope,
        client_id: automation.client_id ?? "",
        endpoint_id: automation.endpoint_id ?? "",
        notify_email: automation.notify_email ?? "",
        enabled: automation.enabled,
        power_action: (automation.power_action ?? "") as PowerAction | "",
        power_delay_seconds: automation.power_delay_seconds ?? 30,
        power_message: automation.power_message ?? "",
      });
    } else setForm(empty);
  }, [open, automation]);

  const { data: clients } = useQuery({
    queryKey: ["clients-lite", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!tenant && open,
  });

  const { data: endpoints } = useQuery({
    queryKey: ["endpoints-lite-auto", form.client_id, form.scope],
    queryFn: async () => {
      let q = supabase.from("endpoints").select("id, hostname, client_id").order("hostname");
      if (form.scope === "endpoint" && form.client_id) q = q.eq("client_id", form.client_id);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: open && form.scope === "endpoint",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!tenant) throw new Error("no tenant");
      if (form.kind === "power" && !form.power_action) {
        throw new Error(t("automations.power.required"));
      }
      const payload = {
        tenant_id: tenant.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        kind: form.kind,
        language: form.language,
        code: form.kind === "power" ? "" : form.code,
        trigger: form.trigger,
        cron_expr: form.trigger === "schedule" ? form.cron_expr.trim() || null : null,
        scope: form.scope,
        client_id: (form.scope === "client" || form.scope === "endpoint") ? form.client_id || null : null,
        endpoint_id: form.scope === "endpoint" ? form.endpoint_id || null : null,
        notify_email: form.notify_email.trim() || null,
        enabled: form.enabled,
        power_action: form.kind === "power" ? (form.power_action || null) : null,
        power_delay_seconds: form.kind === "power" ? form.power_delay_seconds : 30,
        power_message: form.kind === "power" ? (form.power_message.trim() || null) : null,
      };
      if (automation) {
        const { error } = await supabase.from("automations").update(payload).eq("id", automation.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("automations").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(t(automation ? "automations.updated" : "automations.created"));
      qc.invalidateQueries({ queryKey: ["automations"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(automation ? "automations.edit" : "automations.new")}</DialogTitle>
          <DialogDescription>{t("automations.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>{t("automations.field.name")} *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>{t("automations.field.description")}</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label={t("automations.field.kind")}>
              <Select value={form.kind} onValueChange={(v) => {
                const k = v as AutomationKind;
                setForm({
                  ...form,
                  kind: k,
                  trigger: k === "power" && form.trigger === "manual" ? "schedule" : form.trigger,
                });
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUTOMATION_KINDS.map((k) => <SelectItem key={k} value={k}>{t(`automations.kind.${k}` as TKey)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            {form.kind !== "power" && (
            <Field label={t("automations.field.language")}>
              <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v as AutomationLanguage })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUTOMATION_LANGUAGES.map((l) => <SelectItem key={l} value={l}>{t(`automations.language.${l}` as TKey)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            )}
            {form.kind === "power" && (
            <Field label={t("automations.power.action")}>
              <Select value={form.power_action} onValueChange={(v) => setForm({ ...form, power_action: v as PowerAction })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {POWER_ACTIONS.map((a) => (
                    <SelectItem key={a} value={a}>{t(`automations.power.action.${a}` as TKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            )}
            <Field label={t("automations.field.trigger")}>
              <Select value={form.trigger} onValueChange={(v) => setForm({ ...form, trigger: v as AutomationTrigger })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUTOMATION_TRIGGERS.map((tr) => <SelectItem key={tr} value={tr}>{t(`automations.trigger.${tr}` as TKey)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {form.trigger === "schedule" && (
            <Field label={t("automations.field.cron")}>
              <Input value={form.cron_expr} onChange={(e) => setForm({ ...form, cron_expr: e.target.value })}
                placeholder="0 8 * * *" className="font-mono" />
              <div className="flex flex-wrap gap-1.5">
                {CRON_PRESETS.map((p) => (
                  <Button key={p.expr} type="button" size="sm" variant="outline"
                    onClick={() => setForm({ ...form, cron_expr: p.expr })}
                    className="h-7 text-xs">
                    {t(p.key as TKey)}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("automations.cron.hint")}</p>
            </Field>
          )}

          {form.kind === "power" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t("automations.power.delay")}>
                <Input type="number" min={0} max={3600} value={form.power_delay_seconds}
                  onChange={(e) => setForm({ ...form, power_delay_seconds: Math.max(0, Math.min(3600, Number(e.target.value) || 0)) })} />
              </Field>
              <Field label={t("automations.power.message")}>
                <Input value={form.power_message} maxLength={120}
                  onChange={(e) => setForm({ ...form, power_message: e.target.value })} />
              </Field>
            </div>
          ) : (
            <Field label={t("automations.field.code")}>
              <Textarea rows={10} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="font-mono text-xs" placeholder={t("automations.code.placeholder")} />
            </Field>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <Field label={t("automations.field.scope")}>
              <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v as AutomationScope, client_id: "", endpoint_id: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUTOMATION_SCOPES.map((s) => <SelectItem key={s} value={s}>{t(`automations.scope.${s}` as TKey)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            {(form.scope === "client" || form.scope === "endpoint") && (
              <Field label={t("automations.field.client")}>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v, endpoint_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {form.scope === "endpoint" && (
              <Field label={t("automations.field.endpoint")}>
                <Select value={form.endpoint_id} onValueChange={(v) => setForm({ ...form, endpoint_id: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {endpoints?.map((e) => <SelectItem key={e.id} value={e.id}>{e.hostname}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>

          <Field label={t("automations.field.notify")}>
            <Input type="email" placeholder="ops@empresa.com" value={form.notify_email} onChange={(e) => setForm({ ...form, notify_email: e.target.value })} />
          </Field>

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
            <Label htmlFor="auto-enabled" className="cursor-pointer">{t("automations.field.enabled")}</Label>
            <Switch id="auto-enabled" checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}