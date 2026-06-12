import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";
import {
  formatCurrency,
  type BillingCycle,
  type Contract,
  type ContractItem,
  type ContractStatus,
  type Service,
} from "@/lib/billing";

const CYCLES: BillingCycle[] = ["one_time", "monthly", "quarterly", "yearly"];
const STATUSES: ContractStatus[] = ["draft", "active", "suspended", "ended", "cancelled"];

type DraftItem = {
  id?: string;
  service_id: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  discount_pct: string;
};

function emptyItem(): DraftItem {
  return { service_id: null, description: "", quantity: "1", unit_price: "0", discount_pct: "0" };
}

export function ContractFormDialog({
  open, onOpenChange, contract,
}: { open: boolean; onOpenChange: (v: boolean) => void; contract: Contract | null }) {
  const { t } = useI18n();
  const { tenant } = useAuth();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [status, setStatus] = useState<ContractStatus>("draft");
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [currency, setCurrency] = useState("BRL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [autoRenew, setAutoRenew] = useState(true);
  const [monthlyValue, setMonthlyValue] = useState("0");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);

  const { data: clients } = useQuery({
    queryKey: ["clients-min", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenant && open,
  });

  const { data: services } = useQuery({
    queryKey: ["services-active", tenant?.id],
    queryFn: async (): Promise<Service[]> => {
      const { data, error } = await supabase.from("service_catalog").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenant && open,
  });

  useEffect(() => {
    if (!open) return;
    setName(contract?.name ?? "");
    setDescription(contract?.description ?? "");
    setClientId(contract?.client_id ?? "");
    setStatus(contract?.status ?? "draft");
    setCycle(contract?.billing_cycle ?? "monthly");
    setCurrency(contract?.currency ?? "BRL");
    setStartDate(contract?.start_date ?? new Date().toISOString().slice(0, 10));
    setEndDate(contract?.end_date ?? "");
    setAutoRenew(contract?.auto_renew ?? true);
    setMonthlyValue(String(contract?.monthly_value ?? "0"));
    setNotes(contract?.notes ?? "");
    if (contract) {
      void supabase
        .from("contract_items")
        .select("*")
        .eq("contract_id", contract.id)
        .order("created_at")
        .then(({ data }) => {
          setItems(
            (data ?? []).map((i: ContractItem) => ({
              id: i.id,
              service_id: i.service_id,
              description: i.description,
              quantity: String(i.quantity),
              unit_price: String(i.unit_price),
              discount_pct: String(i.discount_pct),
            })),
          );
        });
    } else {
      setItems([]);
    }
  }, [open, contract]);

  function applyService(idx: number, svcId: string) {
    const svc = services?.find((s) => s.id === svcId);
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx
          ? {
              ...it,
              service_id: svcId === "__custom__" ? null : svcId,
              description: svc ? svc.name : it.description,
              unit_price: svc ? String(svc.unit_price) : it.unit_price,
            }
          : it,
      ),
    );
  }

  function lineTotal(it: DraftItem) {
    const q = Number(it.quantity) || 0;
    const p = Number(it.unit_price) || 0;
    const d = Number(it.discount_pct) || 0;
    return q * p * (1 - d / 100);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!tenant) throw new Error("no tenant");
      if (!clientId) throw new Error("Selecione um cliente");
      const payload = {
        tenant_id: tenant.id,
        client_id: clientId,
        name: name.trim(),
        description: description.trim() || null,
        status,
        billing_cycle: cycle,
        currency,
        start_date: startDate,
        end_date: endDate || null,
        auto_renew: autoRenew,
        monthly_value: Number(monthlyValue) || 0,
        notes: notes.trim() || null,
      };
      let contractId = contract?.id;
      if (contract) {
        const { error } = await supabase.from("contracts").update(payload).eq("id", contract.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("contracts").insert(payload).select("id").single();
        if (error) throw error;
        contractId = data.id;
      }
      if (!contractId) throw new Error("missing contract id");

      // Replace items: simple strategy — delete all then insert
      await supabase.from("contract_items").delete().eq("contract_id", contractId);
      if (items.length > 0) {
        const rows = items.map((it) => ({
          tenant_id: tenant.id,
          contract_id: contractId!,
          service_id: it.service_id,
          description: it.description.trim() || "Item",
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
          discount_pct: Number(it.discount_pct) || 0,
        }));
        const { error } = await supabase.from("contract_items").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(contract ? t("billing.contract.updated") : t("billing.contract.created"));
      qc.invalidateQueries({ queryKey: ["contracts"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalItems = items.reduce((s, it) => s + lineTotal(it), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contract ? t("billing.contract.edit") : t("billing.contract.new")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>{t("billing.contract.field.name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>{t("billing.contract.field.client")}</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {(clients ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>{t("billing.contract.field.description")}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <Label>{t("billing.contract.field.status")}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ContractStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`billing.status.${s}` as TKey)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("billing.contract.field.cycle")}</Label>
              <Select value={cycle} onValueChange={(v) => setCycle(v as BillingCycle)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CYCLES.map((c) => <SelectItem key={c} value={c}>{t(`billing.cycle.${c}` as TKey)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("billing.contract.field.currency")}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">BRL</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("billing.contract.field.monthlyValue")}</Label>
              <Input type="number" step="0.01" value={monthlyValue} onChange={(e) => setMonthlyValue(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>{t("billing.contract.field.start")}</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>{t("billing.contract.field.end")}</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <Switch id="auto-renew" checked={autoRenew} onCheckedChange={setAutoRenew} />
              <Label htmlFor="auto-renew">{t("billing.contract.field.autoRenew")}</Label>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>{t("billing.contract.items")}</Label>
              <Button size="sm" variant="outline" onClick={() => setItems((p) => [...p, emptyItem()])}>
                <Plus className="mr-1 h-3.5 w-3.5" /> {t("billing.contract.items.add")}
              </Button>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">{t("billing.contract.items.service")}</TableHead>
                    <TableHead>{t("billing.contract.items.description")}</TableHead>
                    <TableHead className="w-[80px]">{t("billing.contract.items.qty")}</TableHead>
                    <TableHead className="w-[110px]">{t("billing.contract.items.price")}</TableHead>
                    <TableHead className="w-[90px]">{t("billing.contract.items.discount")}</TableHead>
                    <TableHead className="w-[110px] text-right">{t("billing.contract.items.total")}</TableHead>
                    <TableHead className="w-[40px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">{t("billing.contract.items.empty")}</TableCell></TableRow>
                  ) : items.map((it, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Select value={it.service_id ?? "__custom__"} onValueChange={(v) => applyService(idx, v)}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__custom__">{t("billing.contract.items.custom")}</SelectItem>
                            {(services ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input className="h-8" value={it.description} onChange={(e) => setItems((p) => p.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} />
                      </TableCell>
                      <TableCell>
                        <Input className="h-8" type="number" step="0.01" value={it.quantity} onChange={(e) => setItems((p) => p.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} />
                      </TableCell>
                      <TableCell>
                        <Input className="h-8" type="number" step="0.01" value={it.unit_price} onChange={(e) => setItems((p) => p.map((x, i) => i === idx ? { ...x, unit_price: e.target.value } : x))} />
                      </TableCell>
                      <TableCell>
                        <Input className="h-8" type="number" step="0.01" value={it.discount_pct} onChange={(e) => setItems((p) => p.map((x, i) => i === idx ? { ...x, discount_pct: e.target.value } : x))} />
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono">{formatCurrency(lineTotal(it), currency)}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {items.length > 0 && (
              <div className="mt-2 text-right text-sm">
                <span className="text-muted-foreground">{t("billing.contract.items.total")}: </span>
                <span className="font-mono font-semibold">{formatCurrency(totalItems, currency)}</span>
              </div>
            )}
          </div>

          <div>
            <Label>{t("billing.contract.field.notes")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || !clientId || save.isPending}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}