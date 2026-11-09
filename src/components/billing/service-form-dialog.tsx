import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";
import type { Service, ServiceUnit } from "@/lib/billing";

const UNITS: ServiceUnit[] = ["hour", "month", "endpoint", "user", "license", "fixed"];

export function ServiceFormDialog({
  open, onOpenChange, service,
}: { open: boolean; onOpenChange: (v: boolean) => void; service: Service | null }) {
  const { t } = useI18n();
  const { tenant } = useAuth();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState<ServiceUnit>("month");
  const [unitPrice, setUnitPrice] = useState("0");
  const [currency, setCurrency] = useState("BRL");
  const [taxRate, setTaxRate] = useState("0");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (open) {
      setName(service?.name ?? "");
      setDescription(service?.description ?? "");
      setUnit(service?.unit ?? "month");
      setUnitPrice(String(service?.unit_price ?? "0"));
      setCurrency(service?.currency ?? "BRL");
      setTaxRate(String(service?.tax_rate ?? "0"));
      setActive(service?.active ?? true);
    }
  }, [open, service]);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenant) throw new Error("no tenant");
      const payload = {
        tenant_id: tenant.id,
        name: name.trim(),
        description: description.trim() || null,
        unit,
        unit_price: Number(unitPrice) || 0,
        currency,
        tax_rate: Number(taxRate) || 0,
        active,
      };
      if (service) {
        const { error } = await supabase.from("service_catalog").update(payload).eq("id", service.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("service_catalog").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(service ? t("billing.service.updated") : t("billing.service.created"));
      qc.invalidateQueries({ queryKey: ["services"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{service ? t("billing.service.edit") : t("billing.service.new")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="svc-1">{t("billing.service.field.name")}</Label>
            <Input id="svc-1" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="svc-2">{t("billing.service.field.description")}</Label>
            <Textarea id="svc-2" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="svc-3">{t("billing.service.field.unit")}</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as ServiceUnit)}>
                <SelectTrigger id="svc-3"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{t(`billing.unit.${u}` as TKey)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="svc-4">{t("billing.service.field.unitPrice")}</Label>
              <Input id="svc-4" type="number" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="svc-5">{t("billing.service.field.currency")}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="svc-5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">BRL</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="svc-6">{t("billing.service.field.taxRate")} (%)</Label>
              <Input id="svc-6" type="number" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <Switch id="svc-active" checked={active} onCheckedChange={setActive} />
              <Label htmlFor="svc-active">{t("billing.service.field.active")}</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}