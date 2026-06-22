import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Library, Plus, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export function LibraryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { tenant } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["automation-templates"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("automation_templates").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const clone = useMutation({
    mutationFn: async (tpl: any) => {
      if (!tenant) throw new Error("no tenant");
      const { error } = await (supabase as any).from("automations").insert({
        tenant_id: tenant.id,
        name: tpl.name,
        description: tpl.description,
        kind: tpl.kind,
        language: tpl.language ?? "powershell",
        code: tpl.code,
        trigger: "manual",
        scope: "endpoint",
        enabled: false,
        requires_approval: tpl.destructive,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Adicionado às suas automações (desabilitado).");
      qc.invalidateQueries({ queryKey: ["automations"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Library className="h-5 w-5 text-primary" /> Biblioteca de automações</DialogTitle>
          <DialogDescription>Adicione scripts prontos à sua conta. Editáveis após adicionar.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {(q.data ?? []).map((tpl: any) => (
              <div key={tpl.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm">{tpl.name}</p>
                  {tpl.destructive && <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" title="Destrutiva — requer aprovação por padrão" />}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{tpl.description}</p>
                <div className="flex flex-wrap gap-1">
                  {(tpl.tags ?? []).map((t: string) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                </div>
                <Button size="sm" className="w-full" onClick={() => clone.mutate(tpl)} disabled={clone.isPending}>
                  <Plus className="mr-1 h-3 w-3" /> Adicionar
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}