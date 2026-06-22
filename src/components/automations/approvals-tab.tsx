import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export function ApprovalsTab() {
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
    onSuccess: () => { toast.success("Aprovado e executado."); qc.invalidateQueries({ queryKey: ["automation-approvals"] }); qc.invalidateQueries({ queryKey: ["automation-runs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("reject_automation", { _approval_id: id, _reason: null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Rejeitado."); qc.invalidateQueries({ queryKey: ["automation-approvals"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const isAdmin = hasRole("admin");

  return (
    <Card>
      <CardContent className="p-0">
        {(q.data ?? []).length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Sem pedidos.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(q.data ?? []).map((a: any) => (
              <li key={a.id} className="flex items-center gap-3 p-3">
                <Badge variant="outline" className={
                  a.status === "pending" ? "border-amber-500/40 bg-amber-500/10 text-amber-500" :
                  a.status === "approved" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" :
                  "border-rose-500/40 bg-rose-500/10 text-rose-500"
                }>{a.status}</Badge>
                <span className="flex-1 text-sm font-medium">{a.automation?.name ?? "—"}</span>
                <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                {a.status === "pending" && isAdmin && (
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => approve.mutate(a.id)} disabled={approve.isPending}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => reject.mutate(a.id)} disabled={reject.isPending}>
                      <X className="h-4 w-4" />
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