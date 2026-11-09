import { cloneElement, isValidElement, useEffect, useId, useState } from "react";
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
import {
  TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES,
  type Ticket, type TicketCategory, type TicketPriority, type TicketStatus,
} from "@/lib/tickets";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ticket?: Ticket | null;
  defaultClientId?: string;
};

type FormState = {
  client_id: string;
  endpoint_id: string;
  contact_id: string;
  assignee_id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  sla_due_at: string;
  tags: string;
};

const empty: FormState = {
  client_id: "",
  endpoint_id: "none",
  contact_id: "none",
  assignee_id: "none",
  title: "",
  description: "",
  status: "open",
  priority: "medium",
  category: "incident",
  sla_due_at: "",
  tags: "",
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

export function TicketFormDialog({ open, onOpenChange, ticket, defaultClientId }: Props) {
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

  const { data: endpoints } = useQuery({
    queryKey: ["endpoints-lite", form.client_id],
    queryFn: async () => {
      if (!form.client_id) return [];
      const { data, error } = await supabase.from("endpoints").select("id, hostname")
        .eq("client_id", form.client_id).order("hostname");
      if (error) throw error;
      return data;
    },
    enabled: !!form.client_id && open,
  });

  const { data: contacts } = useQuery({
    queryKey: ["contacts-lite", form.client_id],
    queryFn: async () => {
      if (!form.client_id) return [];
      const { data, error } = await supabase.from("client_contacts").select("id, name")
        .eq("client_id", form.client_id).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!form.client_id && open,
  });

  const { data: staff } = useQuery({
    queryKey: ["staff-lite", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles")
        .select("id, full_name, email").eq("status", "active").order("full_name");
      if (error) throw error;
      return data;
    },
    enabled: !!tenant && open,
  });

  useEffect(() => {
    if (!open) return;
    if (ticket) {
      setForm({
        client_id: ticket.client_id,
        endpoint_id: ticket.endpoint_id ?? "none",
        contact_id: ticket.contact_id ?? "none",
        assignee_id: ticket.assignee_id ?? "none",
        title: ticket.title,
        description: ticket.description ?? "",
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        sla_due_at: toLocalInput(ticket.sla_due_at),
        tags: (ticket.tags ?? []).join(", "),
      });
    } else {
      setForm({ ...empty, client_id: defaultClientId ?? "" });
    }
  }, [open, ticket, defaultClientId]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!tenant) throw new Error("Tenant missing");
      if (!form.client_id) throw new Error(t("tickets.err.clientRequired"));
      const payload = {
        client_id: form.client_id,
        endpoint_id: form.endpoint_id === "none" ? null : form.endpoint_id,
        contact_id: form.contact_id === "none" ? null : form.contact_id,
        assignee_id: form.assignee_id === "none" ? null : form.assignee_id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: form.status,
        priority: form.priority,
        category: form.category,
        sla_due_at: form.sla_due_at ? new Date(form.sla_due_at).toISOString() : null,
        tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
      };
      if (ticket) {
        const { error } = await supabase.from("tickets").update(payload).eq("id", ticket.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tickets").insert({ ...payload, tenant_id: tenant.id, number: "" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(t(ticket ? "tickets.updated" : "tickets.created"));
      qc.invalidateQueries({ queryKey: ["tickets"] });
      if (ticket) qc.invalidateQueries({ queryKey: ["ticket", ticket.id] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(ticket ? "tickets.edit" : "tickets.new")}</DialogTitle>
          <DialogDescription>{t("tickets.subtitle")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (form.title.trim()) mutation.mutate(); }} className="space-y-4">
          <Field label={t("tickets.field.title")} required>
            <Input required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label={t("tickets.field.description")}>
            <Textarea rows={4} maxLength={4000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("tickets.field.client")} required>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v, endpoint_id: "none", contact_id: "none" })}>
                <SelectTrigger aria-label={t("tickets.field.client")}><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("tickets.field.assignee")}>
              <Select value={form.assignee_id} onValueChange={(v) => setForm({ ...form, assignee_id: v })}>
                <SelectTrigger aria-label={t("tickets.field.assignee")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("tickets.unassigned")}</SelectItem>
                  {staff?.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name ?? s.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("tickets.field.endpoint")}>
              <Select value={form.endpoint_id} onValueChange={(v) => setForm({ ...form, endpoint_id: v })} disabled={!form.client_id}>
                <SelectTrigger aria-label={t("tickets.field.endpoint")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {endpoints?.map((e) => <SelectItem key={e.id} value={e.id}>{e.hostname}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("tickets.field.contact")}>
              <Select value={form.contact_id} onValueChange={(v) => setForm({ ...form, contact_id: v })} disabled={!form.client_id}>
                <SelectTrigger aria-label={t("tickets.field.contact")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {contacts?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("tickets.field.category")}>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as TicketCategory })}>
                <SelectTrigger aria-label={t("tickets.field.category")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{t(`tickets.category.${c}` as TKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("tickets.field.priority")}>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as TicketPriority })}>
                <SelectTrigger aria-label={t("tickets.field.priority")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{t(`tickets.priority.${p}` as TKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("tickets.field.status")}>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TicketStatus })}>
                <SelectTrigger aria-label={t("tickets.field.status")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{t(`tickets.status.${s}` as TKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("tickets.field.sla")}>
              <Input type="datetime-local" value={form.sla_due_at} onChange={(e) => setForm({ ...form, sla_due_at: e.target.value })} />
            </Field>
            <Field label={t("tickets.field.tags")} className="md:col-span-2">
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder={t("tickets.field.tagsPh")} />
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
  const id = useId();
  const child = isValidElement(children) && (children as React.ReactElement).type !== Select
    ? cloneElement(children as React.ReactElement<{ id?: string }>, { id: (children as React.ReactElement<{ id?: string }>).props.id ?? id })
    : children;
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {child}
    </div>
  );
}