import { cloneElement, isValidElement, useEffect, useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";
import {
  CLIENT_STATUSES,
  SLA_TIERS,
  type Client,
  type ClientStatus,
  type SlaTier,
} from "@/lib/clients";

import { brandingSchema, normalizeBranding, type ClientBranding } from "@/lib/client-branding";
import { ClientBrandHeader } from "./client-brand-header";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client | null;
};

type FormState = ClientBranding & {
  name: string;
  industry: string;
  website: string;
  email: string;
  phone: string;
  address_line: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  status: ClientStatus;
  sla_tier: SlaTier;
  contract_start: string;
  contract_end: string;
  notes: string;
};

const empty: FormState = {
  ...normalizeBranding(null),
  name: "",
  industry: "",
  website: "",
  email: "",
  phone: "",
  address_line: "",
  city: "",
  state: "",
  country: "",
  postal_code: "",
  status: "active",
  sla_tier: "bronze",
  contract_start: "",
  contract_end: "",
  notes: "",
};

function fromClient(c: Client): FormState {
  return {
    ...normalizeBranding(c),
    name: c.name,
    industry: c.industry ?? "",
    website: c.website ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    address_line: c.address_line ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    country: c.country ?? "",
    postal_code: c.postal_code ?? "",
    status: c.status,
    sla_tier: c.sla_tier,
    contract_start: c.contract_start ?? "",
    contract_end: c.contract_end ?? "",
    notes: c.notes ?? "",
  };
}

export function ClientFormDialog({ open, onOpenChange, client }: Props) {
  const { t } = useI18n();
  const { tenant, user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(empty);

  useEffect(() => {
    if (open) setForm(client ? fromClient(client) : empty);
  }, [open, client]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!tenant) throw new Error("Tenant missing");
      const payload = {
        ...form,
        ...brandingSchema.parse(form),
        name: form.name.trim(),
        industry: form.industry.trim() || null,
        website: form.website.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address_line: form.address_line.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        country: form.country.trim() || null,
        postal_code: form.postal_code.trim() || null,
        contract_start: form.contract_start || null,
        contract_end: form.contract_end || null,
        notes: form.notes.trim() || null,
      };
      if (client) {
        const { error } = await supabase.from("clients").update(payload).eq("id", client.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("clients")
          .insert({ ...payload, tenant_id: tenant.id, created_by: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(t(client ? "clients.updated" : "clients.created"));
      qc.invalidateQueries({ queryKey: ["clients"] });
      if (client) qc.invalidateQueries({ queryKey: ["client", client.id] });
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message || t("common.error")),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(client ? "clients.edit" : "clients.new")}</DialogTitle>
          <DialogDescription>{t("clients.subtitle")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("clients.field.name")} required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={120}
                required
              />
            </Field>
            <Field label={t("clients.field.industry")}>
              <Input
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                maxLength={80}
              />
            </Field>
            <Field label={t("clients.field.status")}>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as ClientStatus })}
              >
                <SelectTrigger aria-label={t("clients.field.status")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`clients.status.${s}` as TKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("clients.field.sla")}>
              <Select
                value={form.sla_tier}
                onValueChange={(v) => setForm({ ...form, sla_tier: v as SlaTier })}
              >
                <SelectTrigger aria-label={t("clients.field.sla")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLA_TIERS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`clients.sla.${s}` as TKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("clients.field.email")}>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                maxLength={120}
              />
            </Field>
            <Field label={t("clients.field.phone")}>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                maxLength={40}
              />
            </Field>
            <Field label={t("clients.field.website")} className="md:col-span-2">
              <Input
                type="url"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                placeholder="https://"
                maxLength={200}
              />
            </Field>
            <Field label={t("clients.field.address")} className="md:col-span-2">
              <Input
                value={form.address_line}
                onChange={(e) => setForm({ ...form, address_line: e.target.value })}
                maxLength={200}
              />
            </Field>
            <Field label={t("clients.field.city")}>
              <Input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                maxLength={80}
              />
            </Field>
            <Field label={t("clients.field.state")}>
              <Input
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                maxLength={80}
              />
            </Field>
            <Field label={t("clients.field.country")}>
              <Input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                maxLength={80}
              />
            </Field>
            <Field label={t("clients.field.postal")}>
              <Input
                value={form.postal_code}
                onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                maxLength={20}
              />
            </Field>
            <Field label={t("clients.field.contractStart")}>
              <Input
                type="date"
                value={form.contract_start}
                onChange={(e) => setForm({ ...form, contract_start: e.target.value })}
              />
            </Field>
            <Field label={t("clients.field.contractEnd")}>
              <Input
                type="date"
                value={form.contract_end}
                onChange={(e) => setForm({ ...form, contract_end: e.target.value })}
              />
            </Field>
            <Field label={t("clients.field.notes")} className="md:col-span-2">
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                maxLength={2000}
              />
            </Field>
          </div>
          <section
            className="space-y-4 rounded-xl border p-4"
            aria-label={t("clients.brand.section")}
          >
            <div>
              <h3 className="font-semibold">{t("clients.brand.section")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("clients.brand.sectionDesc")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portal-logo">{t("clients.brand.logoUrl")}</Label>
              <Input
                id="portal-logo"
                type="url"
                placeholder="https://suaempresa.com/logo.png"
                maxLength={1000}
                value={form.portal_logo_url}
                onChange={(e) => setForm({ ...form, portal_logo_url: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {t("clients.brand.logoHint")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portal-color">{t("clients.brand.color")}</Label>
              <div className="flex gap-3">
                <Input
                  type="color"
                  aria-label={t("clients.brand.colorPick")}
                  className="w-16 p-1"
                  value={normalizeBranding(form).portal_primary_color}
                  onChange={(e) => setForm({ ...form, portal_primary_color: e.target.value })}
                />
                <Input
                  id="portal-color"
                  maxLength={7}
                  pattern="#[0-9a-fA-F]{6}"
                  value={form.portal_primary_color}
                  onChange={(e) => setForm({ ...form, portal_primary_color: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portal-title">{t("clients.brand.title")}</Label>
              <Input
                id="portal-title"
                maxLength={100}
                placeholder={t("clients.brand.defaultTitle")}
                value={form.portal_title}
                onChange={(e) => setForm({ ...form, portal_title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portal-message">{t("clients.brand.message")}</Label>
              <Textarea
                id="portal-message"
                maxLength={400}
                rows={3}
                value={form.portal_message}
                onChange={(e) => setForm({ ...form, portal_message: e.target.value })}
                placeholder={t("clients.brand.messagePh")}
              />
            </div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("clients.brand.preview")}
            </p>
            <ClientBrandHeader name={form.name} branding={form} />
          </section>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
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

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const child = isValidElement(children) && (children as React.ReactElement).type !== Select
    ? cloneElement(children as React.ReactElement<{ id?: string }>, { id: (children as React.ReactElement<{ id?: string }>).props.id ?? id })
    : children;
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {child}
    </div>
  );
}
