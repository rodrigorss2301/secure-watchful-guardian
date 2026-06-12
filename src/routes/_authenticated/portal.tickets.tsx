import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LifeBuoy, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/portal/tickets")({
  head: () => ({ meta: [{ title: "Support Portal — Autotechs" }] }),
  component: PortalTicketsPage,
});

function PortalTicketsPage() {
  const { t } = useI18n();
  const { profile } = useAuth();

  const q = useQuery({
    queryKey: ["portal-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id,number,title,status,priority,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = q.data ?? [];
  const notLinked = !(profile as any)?.client_id;

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <LifeBuoy className="h-6 w-6 text-primary" /> {t("portal.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("portal.subtitle")}</p>
        </div>
        <Button asChild>
          <Link to="/portal/tickets/new"><Plus className="mr-2 h-4 w-4" /> {t("portal.new")}</Link>
        </Button>
      </header>

      {notLinked && (
        <Card><CardContent className="p-4 text-sm text-amber-500">{t("portal.notLinked")}</CardContent></Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("portal.col.number")}</TableHead>
                <TableHead>{t("portal.col.title")}</TableHead>
                <TableHead>{t("portal.col.status")}</TableHead>
                <TableHead>{t("portal.col.priority")}</TableHead>
                <TableHead>{t("portal.col.created")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">{q.isLoading ? "…" : t("portal.empty")}</TableCell></TableRow>
              ) : rows.map((r: any) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40">
                  <TableCell className="font-mono text-xs">
                    <Link to="/portal/tickets/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.number}</Link>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-sm">{r.title}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] uppercase">{r.status}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] uppercase">{r.priority}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}