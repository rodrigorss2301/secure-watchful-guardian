import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, Search } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/inventory/software")({
  head: () => ({ meta: [{ title: "Histórico de software — Autotechs RMM" }] }),
  component: SoftwareInventoryPage,
});

function SoftwareInventoryPage() {
  const { tenant } = useAuth();
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<"all" | "added" | "removed">("all");
  const [days, setDays] = useState("30");

  const q = useQuery({
    queryKey: ["sw-history", tenant?.id, days, action],
    enabled: !!tenant,
    queryFn: async () => {
      const since = new Date(Date.now() - parseInt(days) * 86_400_000).toISOString();
      let qb = supabase
        .from("endpoint_inventory_history")
        .select("id, endpoint_id, field, change_type, old_value, new_value, created_at, endpoints(hostname)")
        .eq("category", "software")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (action !== "all") qb = qb.eq("change_type", action);
      const { data, error } = await qb;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return q.data ?? [];
    return (q.data ?? []).filter((r: any) =>
      (r.field ?? "").toLowerCase().includes(s) ||
      (r.endpoints?.hostname ?? "").toLowerCase().includes(s));
  }, [q.data, search]);

  return (
    <>
      <PageHeader title="Histórico de software" description="Instalações e remoções detectadas em toda a frota." />
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar por software ou hostname…" className="pl-9" />
            </div>
            <Select value={action} onValueChange={(v) => setAction(v as never)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ações</SelectItem>
                <SelectItem value="added">Instalados</SelectItem>
                <SelectItem value="removed">Removidos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="14">14 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Software</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading ? (
                  <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground"><Package className="mx-auto h-5 w-5 animate-pulse" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">Sem registros no período.</TableCell></TableRow>
                ) : filtered.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-sm font-mono">{r.endpoints?.hostname ?? "—"}</TableCell>
                    <TableCell className="text-sm">{r.field}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.new_value ?? r.old_value ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={r.change_type === "added"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                        : "border-rose-500/40 bg-rose-500/10 text-rose-500"}>
                        {r.change_type === "added" ? "instalado" : "removido"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}