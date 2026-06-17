import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";
import { ENDPOINT_STATUSES, ENDPOINT_TYPES, type Endpoint, type EndpointStatus, type EndpointType } from "@/lib/endpoints";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  endpoint?: Endpoint | null;
  defaultClientId?: string;
};

type FormState = {
  client_id: string;
  hostname: string;
  display_name: string;
  type: EndpointType;
  status: EndpointStatus;
  os: string;
  os_version: string;
  ip_address: string;
  mac_address: string;
  agent_version: string;
  cpu_usage: string;
  ram_usage: string;
  disk_usage: string;
  tags: string;
  notes: string;
};

const empty: FormState = {
  client_id: "",
  hostname: "",
  display_name: "",
  type: "workstation",
  status: "offline",
  os: "",
  os_version: "",
  ip_address: "",
  mac_address: "",
  agent_version: "",
  cpu_usage: "",
  ram_usage: "",
  disk_usage: "",
  tags: "",
  notes: "",
};

function num(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

export function EndpointFormDialog({ open, onOpenChange, endpoint, defaultClientId }: Props) {
  const { t } = useI18n();
  const { tenant } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(empty);

  const { data: clients } = useQuery({
    queryKey: ["clients-lite", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!tenant && open,
  });

  useEffect(() => {
    if (!open) return;
    if (endpoint) {
      setForm({
        client_id: endpoint.client_id,
        hostname: endpoint.hostname,
        display_name: endpoint.display_name ?? "",
        type: endpoint.type,
        status: endpoint.status,
        os: endpoint.os ?? "",
        os_version: endpoint.os_version ?? "",
        ip_address: endpoint.ip_address ?? "",
        mac_address: endpoint.mac_address ?? "",
        agent_version: endpoint.agent_version ?? "",
        cpu_usage: endpoint.cpu_usage?.toString() ?? "",
        ram_usage: endpoint.ram_usage?.toString() ?? "",
        disk_usage: endpoint.disk_usage?.toString() ?? "",
        tags: (endpoint.tags ?? []).join(", "),
        notes: endpoint.notes ?? "",
      });
    } else {
      setForm({ ...empty, client_id: defaultClientId ?? "" });
    }
  }, [open, endpoint, defaultClientId]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!tenant) throw new Error("Tenant missing");
      if (!form.client_id) throw new Error("Selecione um cliente");
      const payload = {
        hostname: form.hostname.trim(),
        display_name: form.display_name.trim() || null,
        client_id: form.client_id,
        type: form.type,
        status: form.status,
        os: form.os.trim() || null,
        os_version: form.os_version.trim() || null,
        ip_address: form.ip_address.trim() || null,
        mac_address: form.mac_address.trim() || null,
        agent_version: form.agent_version.trim() || null,
        cpu_usage: num(form.cpu_usage),
        ram_usage: num(form.ram_usage),
        disk_usage: num(form.disk_usage),
        tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
        notes: form.notes.trim() || null,
      };
      if (endpoint) {
        const { error } = await supabase.from("endpoints").update(payload).eq("id", endpoint.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("endpoints").insert({ ...payload, tenant_id: tenant.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(t(endpoint ? "endpoints.updated" : "endpoints.created"));
      qc.invalidateQueries({ queryKey: ["endpoints"] });
      if (endpoint) qc.invalidateQueries({ queryKey: ["endpoint", endpoint.id] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(endpoint ? "endpoints.edit" : "endpoints.new")}</DialogTitle>
          <DialogDescription>{t("endpoints.subtitle")}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); if (form.hostname.trim()) mutation.mutate(); }}
          className="space-y-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome de exibição" className="md:col-span-2">
              <Input
                maxLength={120}
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="Ex.: PC do João - Recepção"
              />
              <p className="text-[11px] text-muted-foreground">
                Apelido amigável mostrado na interface. O hostname real do equipamento não é alterado.
              </p>
            </Field>
            <Field label={t("endpoints.field.hostname")} required>
              <Input required maxLength={120} value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} />
            </Field>
            <Field label={t("endpoints.field.client")} required>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("endpoints.field.type")}>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as EndpointType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENDPOINT_TYPES.map((tp) => (
                    <SelectItem key={tp} value={tp}>{t(`endpoints.type.${tp}` as TKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("endpoints.field.status")}>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as EndpointStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENDPOINT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{t(`endpoints.status.${s}` as TKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("endpoints.field.os")}>
              <Input maxLength={80} value={form.os} onChange={(e) => setForm({ ...form, os: e.target.value })} placeholder="Windows 11 / Ubuntu 22.04" />
            </Field>
            <Field label={t("endpoints.field.osVersion")}>
              <Input maxLength={80} value={form.os_version} onChange={(e) => setForm({ ...form, os_version: e.target.value })} />
            </Field>
            <Field label={t("endpoints.field.ip")}>
              <Input maxLength={64} value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} placeholder="192.168.1.10" />
            </Field>
            <Field label={t("endpoints.field.mac")}>
              <Input maxLength={32} value={form.mac_address} onChange={(e) => setForm({ ...form, mac_address: e.target.value })} placeholder="aa:bb:cc:dd:ee:ff" />
            </Field>
            <Field label={t("endpoints.field.agent")}>
              <Input maxLength={40} value={form.agent_version} onChange={(e) => setForm({ ...form, agent_version: e.target.value })} placeholder="1.0.0" />
            </Field>
            <Field label={t("endpoints.field.cpu")}>
              <Input type="number" min={0} max={100} step="0.1" value={form.cpu_usage} onChange={(e) => setForm({ ...form, cpu_usage: e.target.value })} />
            </Field>
            <Field label={t("endpoints.field.ram")}>
              <Input type="number" min={0} max={100} step="0.1" value={form.ram_usage} onChange={(e) => setForm({ ...form, ram_usage: e.target.value })} />
            </Field>
            <Field label={t("endpoints.field.disk")}>
              <Input type="number" min={0} max={100} step="0.1" value={form.disk_usage} onChange={(e) => setForm({ ...form, disk_usage: e.target.value })} />
            </Field>
            <Field label={t("endpoints.field.tags")} className="md:col-span-2">
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="prod, vip, sql" />
              <p className="text-[11px] text-muted-foreground">{t("endpoints.field.tagsHelp")}</p>
            </Field>
            <Field label={t("endpoints.field.notes")} className="md:col-span-2">
              <Textarea rows={3} maxLength={2000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={mutation.isPending} className="shadow-glow">
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}