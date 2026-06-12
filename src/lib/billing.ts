import type { Database } from "@/integrations/supabase/types";

export type Service = Database["public"]["Tables"]["service_catalog"]["Row"];
export type Contract = Database["public"]["Tables"]["contracts"]["Row"];
export type ContractItem = Database["public"]["Tables"]["contract_items"]["Row"];
export type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
export type InvoiceItem = Database["public"]["Tables"]["invoice_items"]["Row"];

export type ContractStatus = Contract["status"];
export type InvoiceStatus = Invoice["status"];
export type BillingCycle = Contract["billing_cycle"];
export type ServiceUnit = Service["unit"];

export function formatCurrency(value: number | string | null | undefined, currency = "BRL") {
  const n = typeof value === "string" ? parseFloat(value) : value ?? 0;
  try {
    return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "en-US", {
      style: "currency",
      currency,
    }).format(Number.isFinite(n) ? (n as number) : 0);
  } catch {
    return `${currency} ${(n ?? 0).toFixed(2)}`;
  }
}

export const CONTRACT_STATUS_TONE: Record<ContractStatus, string> = {
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  suspended: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  ended: "border-border bg-muted text-muted-foreground",
  cancelled: "border-destructive/40 bg-destructive/10 text-destructive",
};

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, string> = {
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  sent: "border-sky-500/40 bg-sky-500/10 text-sky-500",
  paid: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  overdue: "border-destructive/40 bg-destructive/10 text-destructive",
  void: "border-border bg-muted text-muted-foreground line-through",
};

export function isOverdue(inv: Pick<Invoice, "status" | "due_date">) {
  if (inv.status === "paid" || inv.status === "void" || inv.status === "draft") return false;
  return new Date(inv.due_date).getTime() < Date.now();
}