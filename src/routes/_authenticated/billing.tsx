import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Search, Receipt, FileText, Package,
  Wallet, AlertTriangle, FilePlus2, Eye,
} from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import {
  CONTRACT_STATUS_TONE, INVOICE_STATUS_TONE, formatCurrency, isOverdue,
  type Contract, type Invoice, type Service,
} from "@/lib/billing";
import { ContractFormDialog } from "@/components/billing/contract-form-dialog";
import { ServiceFormDialog } from "@/components/billing/service-form-dialog";
import { InvoiceDetailDialog } from "@/components/billing/invoice-detail-dialog";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Contratos e faturamento — Autotechs RMM" }] }),
  component: BillingPage,
});

type ContractRow = Contract & { client?: { name: string } | null };
type InvoiceRow = Invoice & { client?: { name: string } | null; contract?: { name: string } | null };

function StateRow({ cols, loading, error, children }: { cols: number; loading: boolean; error: boolean; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <TableRow>
      <TableCell colSpan={cols} role={error ? "alert" : loading ? "status" : undefined} className="py-10 text-center text-muted-foreground">
        {error ? t("common.error") : loading ? t("common.loading") : children}
      </TableCell>
    </TableRow>
  );
}

function BillingPage() {
  const { t, lang } = useI18n();
  const { tenant, hasAnyRole } = useAuth();
  const canEdit = hasAnyRole(["admin", "technician"]);
  const isAdmin = hasAnyRole(["admin"]);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [contractOpen, setContractOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [invoiceDetail, setInvoiceDetail] = useState<InvoiceRow | null>(null);
  const [pendingDelContract, setPendingDelContract] = useState<Contract | null>(null);
  const [pendingDelService, setPendingDelService] = useState<Service | null>(null);
  const [pendingDelInvoice, setPendingDelInvoice] = useState<Invoice | null>(null);

  const { data: contracts, isLoading: loadingContracts, isError: errContracts } = useQuery({
    queryKey: ["contracts", tenant?.id],
    queryFn: async (): Promise<ContractRow[]> => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*, client:clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as never;
    },
    enabled: !!tenant,
  });

  const { data: invoices, isLoading: loadingInvoices, isError: errInvoices } = useQuery({
    queryKey: ["invoices", tenant?.id],
    queryFn: async (): Promise<InvoiceRow[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, client:clients(name), contract:contracts(name)")
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as never;
    },
    enabled: !!tenant,
  });

  const { data: services, isLoading: loadingServices, isError: errServices } = useQuery({
    queryKey: ["services", tenant?.id],
    queryFn: async (): Promise<Service[]> => {
      const { data, error } = await supabase.from("service_catalog").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenant,
  });

  const kpis = useMemo(() => {
    const active = (contracts ?? []).filter((c) => c.status === "active");
    const mrr = active.reduce((s, c) => s + Number(c.monthly_value ?? 0), 0);
    const pending = (invoices ?? []).filter((i) => i.status === "sent" || i.status === "overdue").length;
    const overdue = (invoices ?? []).filter((i) => isOverdue(i) || i.status === "overdue").length;
    return { mrr, active: active.length, pending, overdue };
  }, [contracts, invoices]);

  const generateInvoice = useMutation({
    mutationFn: async (contractId: string) => {
      const { data, error } = await supabase.rpc("generate_invoice_from_contract", { _contract_id: contractId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success(t("billing.contract.invoiceGenerated"));
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteContract = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("billing.contract.deleted"));
      qc.invalidateQueries({ queryKey: ["contracts"] });
      setPendingDelContract(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteService = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_catalog").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("billing.service.deleted"));
      qc.invalidateQueries({ queryKey: ["services"] });
      setPendingDelService(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteInvoice = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("billing.invoice.deleted"));
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setPendingDelInvoice(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = search.trim().toLowerCase();
  const filteredContracts = (contracts ?? []).filter((c) =>
    !s || c.name.toLowerCase().includes(s) || (c.client?.name ?? "").toLowerCase().includes(s));
  const filteredInvoices = (invoices ?? []).filter((i) =>
    !s || i.number.toLowerCase().includes(s) || (i.client?.name ?? "").toLowerCase().includes(s));
  const filteredServices = (services ?? []).filter((sv) =>
    !s || sv.name.toLowerCase().includes(s));

  return (
    <>
      <PageHeader title={t("billing.title")} description={t("billing.subtitle")} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={Wallet} label={t("billing.kpi.mrr")} value={formatCurrency(kpis.mrr)} tone="text-emerald-500" />
        <Kpi icon={FileText} label={t("billing.kpi.activeContracts")} value={String(kpis.active)} />
        <Kpi icon={Receipt} label={t("billing.kpi.pending")} value={String(kpis.pending)} tone="text-sky-500" />
        <Kpi icon={AlertTriangle} label={t("billing.kpi.overdue")} value={String(kpis.overdue)} tone="text-destructive" />
      </div>

      <Tabs defaultValue="contracts" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="contracts">{t("billing.tab.contracts")}</TabsTrigger>
            <TabsTrigger value="invoices">{t("billing.tab.invoices")}</TabsTrigger>
            <TabsTrigger value="services">{t("billing.tab.services")}</TabsTrigger>
          </TabsList>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input type="search" aria-label={t("billing.search")} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("billing.search")} className="pl-9" />
          </div>
        </div>

        {/* CONTRACTS */}
        <TabsContent value="contracts" className="space-y-3">
          {canEdit && (
            <div className="flex justify-end">
              <Button onClick={() => { setEditingContract(null); setContractOpen(true); }} className="shadow-glow">
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> {t("billing.contract.new")}
              </Button>
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("billing.contract.col.name")}</TableHead>
                  <TableHead>{t("billing.contract.col.client")}</TableHead>
                  <TableHead>{t("billing.contract.col.cycle")}</TableHead>
                  <TableHead>{t("billing.contract.col.status")}</TableHead>
                  <TableHead className="text-right">{t("billing.contract.col.mrr")}</TableHead>
                  <TableHead>{t("billing.contract.col.start")}</TableHead>
                  <TableHead>{t("billing.contract.col.end")}</TableHead>
                  <TableHead className="text-right">{t("billing.contract.col.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingContracts || errContracts || filteredContracts.length === 0 ? (
                  <StateRow cols={8} loading={loadingContracts} error={errContracts}>{t("billing.empty")}</StateRow>
                ) : filteredContracts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{c.name}</span>
                        {c.description && <span className="text-xs text-muted-foreground line-clamp-1">{c.description}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{c.client?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{t(`billing.cycle.${c.billing_cycle}` as TKey)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={CONTRACT_STATUS_TONE[c.status]}>
                        {t(`billing.status.${c.status}` as TKey)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(c.monthly_value, c.currency)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(c.start_date, lang)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(c.end_date, lang)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <Button size="sm" variant="ghost" disabled={generateInvoice.isPending}
                            onClick={() => generateInvoice.mutate(c.id)} title={t("billing.contract.generateInvoice")} aria-label={`${t("billing.contract.generateInvoice")}: ${c.name}`}>
                            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                        {canEdit && (
                          <Button size="sm" variant="ghost" onClick={() => { setEditingContract(c); setContractOpen(true); }} title={t("billing.contract.edit")} aria-label={`${t("billing.contract.edit")}: ${c.name}`}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setPendingDelContract(c)} title={t("common.delete")} aria-label={`${t("common.delete")}: ${c.name}`}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* INVOICES */}
        <TabsContent value="invoices" className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("billing.invoice.col.number")}</TableHead>
                  <TableHead>{t("billing.invoice.col.client")}</TableHead>
                  <TableHead>{t("billing.invoice.col.contract")}</TableHead>
                  <TableHead>{t("billing.invoice.col.status")}</TableHead>
                  <TableHead>{t("billing.invoice.col.issue")}</TableHead>
                  <TableHead>{t("billing.invoice.col.due")}</TableHead>
                  <TableHead className="text-right">{t("billing.invoice.col.total")}</TableHead>
                  <TableHead className="text-right">{t("billing.invoice.col.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingInvoices || errInvoices || filteredInvoices.length === 0 ? (
                  <StateRow cols={8} loading={loadingInvoices} error={errInvoices}>{t("billing.empty")}</StateRow>
                ) : filteredInvoices.map((i) => {
                  // Status exibido: fatura enviada e vencida aparece como "vencida" (cor e texto da mesma fonte).
                  const shownStatus = isOverdue(i) ? "overdue" : i.status;
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-mono text-sm">{i.number}</TableCell>
                      <TableCell className="text-sm">{i.client?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{i.contract?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={INVOICE_STATUS_TONE[shownStatus]}>
                          {t(`billing.invoice.status.${shownStatus}` as TKey)}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(i.issue_date, lang)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(i.due_date, lang)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(i.total, i.currency)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setInvoiceDetail(i)} title={t("billing.invoice.view")} aria-label={`${t("billing.invoice.view")}: ${i.number}`}>
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          {isAdmin && (
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setPendingDelInvoice(i)} title={t("common.delete")} aria-label={`${t("common.delete")}: ${i.number}`}>
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* SERVICES */}
        <TabsContent value="services" className="space-y-3">
          {canEdit && (
            <div className="flex justify-end">
              <Button onClick={() => { setEditingService(null); setServiceOpen(true); }} className="shadow-glow">
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> {t("billing.service.new")}
              </Button>
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("billing.service.col.name")}</TableHead>
                  <TableHead>{t("billing.service.col.unit")}</TableHead>
                  <TableHead className="text-right">{t("billing.service.col.price")}</TableHead>
                  <TableHead>{t("billing.service.col.active")}</TableHead>
                  <TableHead className="text-right">{t("billing.contract.col.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingServices || errServices || filteredServices.length === 0 ? (
                  <StateRow cols={5} loading={loadingServices} error={errServices}>{t("billing.empty")}</StateRow>
                ) : filteredServices.map((sv) => (
                  <TableRow key={sv.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <div className="flex flex-col">
                          <span className="font-medium">{sv.name}</span>
                          {sv.description && <span className="text-xs text-muted-foreground line-clamp-1">{sv.description}</span>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{t(`billing.unit.${sv.unit}` as TKey)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(sv.unit_price, sv.currency)}</TableCell>
                    <TableCell>
                      {sv.active
                        ? <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">{t("billing.service.col.active")}</Badge>
                        : <Badge variant="outline" className="border-border bg-muted text-muted-foreground">—</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <Button size="sm" variant="ghost" onClick={() => { setEditingService(sv); setServiceOpen(true); }} title={t("billing.service.edit")} aria-label={`${t("billing.service.edit")}: ${sv.name}`}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setPendingDelService(sv)} title={t("common.delete")} aria-label={`${t("common.delete")}: ${sv.name}`}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <ContractFormDialog open={contractOpen} onOpenChange={setContractOpen} contract={editingContract} />
      <ServiceFormDialog open={serviceOpen} onOpenChange={setServiceOpen} service={editingService} />
      <InvoiceDetailDialog invoice={invoiceDetail} onOpenChange={(o) => !o && setInvoiceDetail(null)} />

      <AlertDialog open={!!pendingDelContract} onOpenChange={(o) => !o && setPendingDelContract(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingDelContract?.name}</AlertDialogTitle>
            <AlertDialogDescription>{t("billing.contract.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingDelContract && deleteContract.mutate(pendingDelContract.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingDelService} onOpenChange={(o) => !o && setPendingDelService(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingDelService?.name}</AlertDialogTitle>
            <AlertDialogDescription>{t("billing.service.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingDelService && deleteService.mutate(pendingDelService.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingDelInvoice} onOpenChange={(o) => !o && setPendingDelInvoice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingDelInvoice?.number}</AlertDialogTitle>
            <AlertDialogDescription>{t("billing.invoice.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingDelInvoice && deleteInvoice.mutate(pendingDelInvoice.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Wallet; label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${tone ?? "text-muted-foreground"}`} aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${tone ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}