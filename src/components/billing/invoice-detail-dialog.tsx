import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Send, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";
import { formatCurrency, INVOICE_STATUS_TONE, type Invoice, type InvoiceItem } from "@/lib/billing";

export function InvoiceDetailDialog({
  invoice, onOpenChange,
}: { invoice: (Invoice & { client?: { name: string } | null }) | null; onOpenChange: (v: boolean) => void }) {
  const { t } = useI18n();
  const { hasAnyRole } = useAuth();
  const qc = useQueryClient();
  const canEdit = hasAnyRole(["admin", "technician"]);

  const { data: items } = useQuery({
    queryKey: ["invoice-items", invoice?.id],
    queryFn: async (): Promise<InvoiceItem[]> => {
      if (!invoice) return [];
      const { data, error } = await supabase.from("invoice_items").select("*").eq("invoice_id", invoice.id).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!invoice,
  });

  const markPaid = useMutation({
    mutationFn: async () => {
      if (!invoice) return;
      const { error } = await supabase.rpc("mark_invoice_paid", { _invoice_id: invoice.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("billing.invoice.markedPaid"));
      qc.invalidateQueries({ queryKey: ["invoices"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (status: Invoice["status"]) => {
      if (!invoice) return;
      const { error } = await supabase.from("invoices").update({ status }).eq("id", invoice.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("billing.invoice.updated"));
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!invoice) return null;

  return (
    <Dialog open={!!invoice} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono">{invoice.number}</span>
            <Badge variant="outline" className={INVOICE_STATUS_TONE[invoice.status]}>
              {t(`billing.invoice.status.${invoice.status}` as TKey)}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {invoice.client?.name ?? ""} · {t("billing.invoice.col.due")}: {invoice.due_date}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div><span className="text-muted-foreground">{t("billing.invoice.field.issueDate")}: </span>{invoice.issue_date}</div>
            <div><span className="text-muted-foreground">{t("billing.invoice.field.periodStart")}: </span>{invoice.period_start ?? "—"}</div>
            <div><span className="text-muted-foreground">{t("billing.invoice.field.periodEnd")}: </span>{invoice.period_end ?? "—"}</div>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("billing.contract.items.description")}</TableHead>
                  <TableHead className="w-[80px] text-right">{t("billing.contract.items.qty")}</TableHead>
                  <TableHead className="w-[110px] text-right">{t("billing.contract.items.price")}</TableHead>
                  <TableHead className="w-[120px] text-right">{t("billing.contract.items.total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(items ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-sm text-muted-foreground">—</TableCell></TableRow>
                ) : (items ?? []).map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="text-sm">{it.description}</TableCell>
                    <TableCell className="text-right text-sm">{Number(it.quantity)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(it.unit_price, invoice.currency)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(it.total, invoice.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col items-end gap-1 text-sm">
            <div><span className="text-muted-foreground">{t("billing.invoice.field.subtotal")}: </span><span className="font-mono">{formatCurrency(invoice.subtotal, invoice.currency)}</span></div>
            <div><span className="text-muted-foreground">{t("billing.invoice.field.tax")}: </span><span className="font-mono">{formatCurrency(invoice.tax, invoice.currency)}</span></div>
            <div className="text-base"><span className="text-muted-foreground">{t("billing.invoice.field.total")}: </span><span className="font-mono font-bold">{formatCurrency(invoice.total, invoice.currency)}</span></div>
          </div>

          {invoice.notes && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{invoice.notes}</div>
          )}
        </div>

        {canEdit && (
          <DialogFooter className="gap-2">
            {invoice.status === "draft" && (
              <Button variant="outline" onClick={() => setStatus.mutate("sent")} disabled={setStatus.isPending}>
                <Send className="mr-2 h-4 w-4" /> {t("billing.invoice.send")}
              </Button>
            )}
            {invoice.status !== "paid" && invoice.status !== "void" && (
              <Button variant="outline" className="text-destructive" onClick={() => setStatus.mutate("void")} disabled={setStatus.isPending}>
                <XCircle className="mr-2 h-4 w-4" /> {t("billing.invoice.void")}
              </Button>
            )}
            {invoice.status !== "paid" && invoice.status !== "void" && (
              <Button onClick={() => markPaid.mutate()} disabled={markPaid.isPending} className="shadow-glow">
                <CheckCircle2 className="mr-2 h-4 w-4" /> {t("billing.invoice.markPaid")}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}