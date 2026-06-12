import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import type { ClientContact } from "@/lib/clients";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  contact?: ClientContact | null;
};

export function ContactFormDialog({ open, onOpenChange, clientId, contact }: Props) {
  const { t } = useI18n();
  const { tenant } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(contact?.name ?? "");
    setRole(contact?.role ?? "");
    setEmail(contact?.email ?? "");
    setPhone(contact?.phone ?? "");
    setIsPrimary(contact?.is_primary ?? false);
  }, [open, contact]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!tenant) throw new Error("Tenant missing");
      const payload = {
        name: name.trim(),
        role: role.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        is_primary: isPrimary,
      };
      if (contact) {
        const { error } = await supabase.from("client_contacts").update(payload).eq("id", contact.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("client_contacts")
          .insert({ ...payload, client_id: clientId, tenant_id: tenant.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts", clientId] });
      toast.success("OK");
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(contact ? "clients.contact.edit" : "clients.contact.new")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) mutation.mutate(); }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label>{t("clients.contact.name")} *</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("clients.contact.role")}</Label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} maxLength={80} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("clients.contact.email")}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("clients.contact.phone")}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
            <Label htmlFor="primary" className="text-sm">{t("clients.contact.primary")}</Label>
            <Switch id="primary" checked={isPrimary} onCheckedChange={setIsPrimary} />
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