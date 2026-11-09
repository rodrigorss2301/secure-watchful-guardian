import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";

export function ApprovalsTab() {
  const { t, lang } = useI18n();
  const { hasRole, tenant } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["automation-approvals", tenant?.id],
    enabled: !!tenant,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("automation_approvals")
        .select("*, automation:automations(name, requires_approval)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("approve_automation", { _approval_id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("automations.approvals.approvedToast")); qc.invalidateQueries({ queryKey: ["automation-approvals"] }); qc.invalidateQueries({ queryKey: ["automation-runs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("reject_automation", { _approval_id: id, _reason: null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("automations.approvals.rejectedToast")); qc.invalidateQueries({ queryKey: ["automation-approvals"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const isAdmin = hasRole("admin");
  const STATUS_LABEL: Record<string, string> = {
    pending: t("automations.approvals.status.pending"),
    approved: t("automations.approvals.status.approved"),
    rejected: t("automations.approvals.status.rejected"),
  };

  return (
    <Card>
      <CardContent className="p-0">
        {q.isLoading ? (
          <div className="p-3" role="status" aria-busy="true"><Skeleton className="h-24 w-full" /></div>
        ) : q.isError ? (
          <p role="alert" className="p-10 text-center text-sm text-muted-foreground">{t("automations.approvals.loadError")}</p>
        ) : (q.data ?? []).length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">{t("automations.approvals.empty")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {(q.data ?? []).map((a: any) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                <Badge variant="outline" className={
                  a.status === "pending" ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" :
                  a.status === "approved" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" :
                  "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400"
                }>{STATUS_LABEL[a.status] ?? a.status}</Badge>
                <span className="min-w-0 flex-1 basis-40 text-sm font-medium">{a.automation?.name ?? "—"}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(a.created_at, lang)}</span>
                {a.status === "pending" && isAdmin && (
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => approve.mutate(a.id)} disabled={approve.isPending || reject.isPending} title={t("automations.approvals.approve")} aria-label={`${t("automations.approvals.approve")}: ${a.automation?.name ?? ""}`}>
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => reject.mutate(a.id)} disabled={reject.isPending || approve.isPending} title={t("automations.approvals.reject")} aria-label={`${t("automations.approvals.reject")}: ${a.automation?.name ?? ""}`}>
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}