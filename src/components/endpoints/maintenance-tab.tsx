import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, Loader2, Plus, Sparkles, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type MaintenanceLog = {
  id: string;
  performed_at: string;
  kind: string;
  notes: string | null;
  performed_by_name: string | null;
};

const KIND_LABEL: Record<string, string> = {
  maintenance: "Manutenção",
  cleaning: "Limpeza",
  both: "Manutenção + Limpeza",
};

const KIND_TONE: Record<string, string> = {
  maintenance: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  cleaning: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  both: "bg-violet-500/15 text-violet-400 border-violet-500/30",
};

export function MaintenanceTab({ endpointId, tenantId }: { endpointId: string; tenantId: string | null }) {
  const qc = useQueryClient();
  const { hasAnyRole, profile, user } = useAuth();
  const canWrite = hasAnyRole(["admin", "technician"]);
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["endpoint-maintenance", endpointId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endpoint_maintenance_logs" as never)
        .select("id, performed_at, kind, notes, performed_by_name")
        .eq("endpoint_id", endpointId)
        .order("performed_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as MaintenanceLog[];
    },
  });

  const rows = q.data ?? [];
  const last = rows[0];

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("endpoint_maintenance_logs" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["endpoint-maintenance", endpointId] });
      qc.invalidateQueries({ queryKey: ["endpoint", endpointId] });
      toast.success("Registro removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card className="border-border/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Última manutenção</p>
            <p className="mt-1 text-sm">
              {last ? (
                <>
                  <span className="font-medium">{new Date(last.performed_at).toLocaleString()}</span>
                  <Badge variant="outline" className={cn("ml-2 text-[10px] uppercase", KIND_TONE[last.kind] ?? "")}>
                    {KIND_LABEL[last.kind] ?? last.kind}
                  </Badge>
                </>
              ) : (
                <span className="text-muted-foreground">Nenhum registro ainda</span>
              )}
            </p>
            {last?.notes && <p className="mt-1 max-w-xl text-xs text-muted-foreground">{last.notes}</p>}
            {last?.performed_by_name && (
              <p className="mt-1 text-[11px] text-muted-foreground">por {last.performed_by_name}</p>
            )}
          </div>
          {canWrite && (
            <Button onClick={() => setOpen(true)} className="shadow-glow">
              <Plus className="mr-2 h-4 w-4" /> Registrar
            </Button>
          )}
        </div>
      </Card>

      <div>
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Wrench className="h-3.5 w-3.5" /> Histórico
          <Badge variant="secondary" className="text-[10px]">{rows.length}</Badge>
        </h3>
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 px-4 py-10 text-center text-xs text-muted-foreground">
            Sem registros de manutenção
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Data</th>
                  <th className="p-2 text-left">Tipo</th>
                  <th className="p-2 text-left">Observações</th>
                  <th className="p-2 text-left">Executado por</th>
                  {canWrite && <th className="p-2 w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border/40 align-top">
                    <td className="p-2 whitespace-nowrap text-xs font-mono">{new Date(r.performed_at).toLocaleString()}</td>
                    <td className="p-2">
                      <Badge variant="outline" className={cn("text-[10px] uppercase", KIND_TONE[r.kind] ?? "")}>
                        {KIND_LABEL[r.kind] ?? r.kind}
                      </Badge>
                    </td>
                    <td className="p-2 text-sm text-muted-foreground">{r.notes || "—"}</td>
                    <td className="p-2 text-xs text-muted-foreground">{r.performed_by_name || "—"}</td>
                    {canWrite && (
                      <td className="p-2 text-right">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => { if (confirm("Remover este registro?")) del.mutate(r.id); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MaintenanceDialog
        open={open}
        onOpenChange={setOpen}
        endpointId={endpointId}
        tenantId={tenantId}
        defaultName={profile?.full_name ?? user?.email ?? ""}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["endpoint-maintenance", endpointId] });
          qc.invalidateQueries({ queryKey: ["endpoint", endpointId] });
        }}
      />
    </div>
  );
}

function MaintenanceDialog({
  open, onOpenChange, endpointId, tenantId, defaultName, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  endpointId: string;
  tenantId: string | null;
  defaultName: string;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [date, setDate] = useState<Date>(new Date());
  const [time, setTime] = useState(() => format(new Date(), "HH:mm"));
  const [kind, setKind] = useState("maintenance");
  const [notes, setNotes] = useState("");
  const [name, setName] = useState(defaultName);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Tenant não identificado");
      const [h, m] = time.split(":").map((s) => parseInt(s, 10));
      const performed = new Date(date);
      performed.setHours(h || 0, m || 0, 0, 0);
      const { error } = await supabase.from("endpoint_maintenance_logs" as never).insert({
        tenant_id: tenantId,
        endpoint_id: endpointId,
        performed_at: performed.toISOString(),
        kind,
        notes: notes.trim() || null,
        performed_by: user?.id ?? null,
        performed_by_name: name.trim() || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Manutenção registrada");
      onSaved();
      onOpenChange(false);
      setNotes("");
      setKind("maintenance");
      setDate(new Date());
      setTime(format(new Date(), "HH:mm"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Registrar manutenção
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Data</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "dd/MM/yyyy") : "Escolher"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Hora</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Tipo</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="maintenance">Manutenção</SelectItem>
                <SelectItem value="cleaning">Limpeza</SelectItem>
                <SelectItem value="both">Manutenção + Limpeza</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Executado por</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do técnico" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Observações</Label>
            <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: limpeza interna, troca de pasta térmica, remoção de arquivos temporários…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="shadow-glow">
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}