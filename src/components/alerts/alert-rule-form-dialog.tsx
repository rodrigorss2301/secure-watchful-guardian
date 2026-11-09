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
  ALERT_COMPARATORS, ALERT_METRICS, ALERT_SCOPES, ALERT_SEVERITIES,
  type AlertComparator, type AlertMetric, type AlertRule, type AlertScope, type AlertSeverity,
} from "@/lib/alerts";

type Props = { open: boolean; onOpenChange: (o: boolean) => void; rule?: AlertRule | null };

type FormState = {
  name: string;
  description: string;
  metric: AlertMetric;
  comparator: AlertComparator;
  threshold: string;
  duration_minutes: string;
  severity: AlertSeverity;
  scope: AlertScope;
  client_id: string;
  endpoint_id: string;
  notify_email: string;
  enabled: boolean;
};

const empty: FormState = {
  name: "",
  description: "",
  metric: "cpu",
  comparator: "gte",
  threshold: "90",
  duration_minutes: "5",
  severity: "warning",
  scope: "all",
  client_id: "",
  endpoint_id: "",
  notify_email: "",
  enabled: true,
};

export function AlertRuleFormDialog({ open, onOpenChange, rule }: Props) {
  const { t } = useI18n();
  const { tenant } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(empty);

  useEffect(() => {
    if (!open) return;
    if (rule) {
      setForm({
        name: rule.name,
        description: rule.description ?? "",
        metric: rule.metric,
        comparator: rule.comparator,
        threshold: String(rule.threshold ?? ""),
        duration_minutes: String(rule.duration_minutes ?? 5),
        severity: rule.severity,
        scope: rule.scope,
        client_id: rule.client_id ?? "",
        endpoint_id: rule.endpoint_id ?? "",
        notify_email: rule.notify_email ?? "",
        enabled: rule.enabled,
      });
    } else {
      setForm(empty);
    }
  }, [open, rule]);

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
    queryKey: ["endpoints-lite-rule", form.client_id, form.scope],
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
      const payload = {
        tenant_id: tenant.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        metric: form.metric,
        comparator: form.comparator,
        threshold: Number(form.threshold) || 0,
        duration_minutes: Number(form.duration_minutes) || 5,
        severity: form.severity,
        scope: form.scope,
        client_id: form.scope === "client" || (form.scope === "endpoint" && form.client_id) ? form.client_id || null : null,
        endpoint_id: form.scope === "endpoint" ? form.endpoint_id || null : null,
        notify_email: form.notify_email.trim() || null,
        enabled: form.enabled,
      };
      if (rule) {
        const { error } = await supabase.from("alert_rules").update(payload).eq("id", rule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("alert_rules").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(t(rule ? "alerts.rules.updated" : "alerts.rules.created"));
      qc.invalidateQueries({ queryKey: ["alert_rules"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isOffline = form.metric === "offline";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(rule ? "alerts.rules.edit" : "alerts.rules.new")}</DialogTitle>
          <DialogDescription>{t("alerts.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="ar-name">{t("alerts.field.name")} <span aria-hidden className="text-destructive">*</span></Label>
            <Input id="ar-name" aria-required="true" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ar-description">{t("alerts.field.description")}</Label>
            <Textarea id="ar-description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="ar-metric">{t("alerts.field.metric")}</Label>
              <Select value={form.metric} onValueChange={(v) => setForm({ ...form, metric: v as AlertMetric })}>
                <SelectTrigger id="ar-metric"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALERT_METRICS.map((m) => <SelectItem key={m} value={m}>{t(`alerts.metric.${m}` as TKey)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!isOffline && (
              <div className="grid gap-2">
                <Label htmlFor="ar-comparator">{t("alerts.field.comparator")}</Label>
                <Select value={form.comparator} onValueChange={(v) => setForm({ ...form, comparator: v as AlertComparator })}>
                  <SelectTrigger id="ar-comparator"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALERT_COMPARATORS.map((c) => <SelectItem key={c} value={c}>{t(`alerts.comparator.${c}` as TKey)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!isOffline && (
              <div className="grid gap-2">
                <Label htmlFor="ar-threshold">{t("alerts.field.threshold")} (%)</Label>
                <Input id="ar-threshold" type="number" min={0} max={100} value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="ar-duration">{t("alerts.field.duration")}</Label>
              <Input id="ar-duration" type="number" min={1} value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ar-severity">{t("alerts.field.severity")}</Label>
              <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v as AlertSeverity })}>
                <SelectTrigger id="ar-severity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALERT_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{t(`alerts.severity.${s}` as TKey)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="ar-scope">{t("alerts.field.scope")}</Label>
              <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v as AlertScope, client_id: "", endpoint_id: "" })}>
                <SelectTrigger id="ar-scope"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALERT_SCOPES.map((s) => <SelectItem key={s} value={s}>{t(`alerts.scope.${s}` as TKey)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {(form.scope === "client" || form.scope === "endpoint") && (
              <div className="grid gap-2">
                <Label htmlFor="ar-client">{t("alerts.field.client")}</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v, endpoint_id: "" })}>
                  <SelectTrigger id="ar-client"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.scope === "endpoint" && (
              <div className="grid gap-2">
                <Label htmlFor="ar-endpoint">{t("alerts.field.endpoint")}</Label>
                <Select value={form.endpoint_id} onValueChange={(v) => setForm({ ...form, endpoint_id: v })}>
                  <SelectTrigger id="ar-endpoint"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {endpoints?.map((e) => <SelectItem key={e.id} value={e.id}>{e.hostname}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ar-notify">{t("alerts.field.notify")}</Label>
            <Input id="ar-notify" type="email" placeholder="ops@empresa.com" value={form.notify_email} onChange={(e) => setForm({ ...form, notify_email: e.target.value })} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
            <Label htmlFor="enabled" className="cursor-pointer">{t("alerts.field.enabled")}</Label>
            <Switch id="enabled" checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
            {save.isPending && <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}