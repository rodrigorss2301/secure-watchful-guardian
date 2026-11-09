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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useI18n, type TKey } from "@/lib/i18n";
import { formatDate, formatDateTime } from "@/lib/format";

type MaintenanceLog = {
  id: string;
  performed_at: string;
  kind: string;
  notes: string | null;
  performed_by_name: string | null;
};

const KIND_LABEL: Record<string, TKey> = {
  maintenance: "maintenance.kind.maintenance",
  cleaning: "maintenance.kind.cleaning",
  both: "maintenance.kind.both",
};

const KIND_TONE: Record<string, string> = {
  maintenance: "bg-sky-500/15 text-sky-600 dark:text-sky-500 border-sky-500/30",
  cleaning: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-500 border-emerald-500/30",
  both: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
};

export function MaintenanceTab({ endpointId, tenantId }: { endpointId: string; tenantId: string | null }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const { hasAnyRole, profile, user } = useAuth();
  const canWrite = hasAnyRole(["admin", "technician"]);
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
      toast.success(t("maintenance.removed"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card className="border-border/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("maintenance.last")}</p>
            <p className="mt-1 text-sm">
              {last ? (
                <>
                  <span className="font-medium">{formatDateTime(last.performed_at, lang)}</span>
                  <Badge variant="outline" className={cn("ml-2 text-[10px] uppercase", KIND_TONE[last.kind] ?? "")}>
                    {KIND_LABEL[last.kind] ? t(KIND_LABEL[last.kind]) : last.kind}
                  </Badge>
                </>
              ) : (
                <span className="text-muted-foreground">{t("maintenance.noneYet")}</span>
              )}
            </p>
            {last?.notes && <p className="mt-1 max-w-xl text-xs text-muted-foreground">{last.notes}</p>}
            {last?.performed_by_name && (
              <p className="mt-1 text-[11px] text-muted-foreground">{t("maintenance.by")} {last.performed_by_name}</p>
            )}
          </div>
          {canWrite && (
            <Button onClick={() => setOpen(true)} className="shadow-glow">
              <Plus aria-hidden className="mr-2 h-4 w-4" /> {t("maintenance.register")}
            </Button>
          )}
        </div>
      </Card>

      <div>
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Wrench aria-hidden className="h-3.5 w-3.5" /> {t("maintenance.history")}
          <Badge variant="secondary" className="text-[10px]">{rows.length}</Badge>
        </h3>
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 px-4 py-10 text-center text-xs text-muted-foreground">
            {t("maintenance.empty")}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">{t("maintenance.col.date")}</th>
                  <th className="p-2 text-left">{t("maintenance.col.kind")}</th>
                  <th className="p-2 text-left">{t("maintenance.col.notes")}</th>
                  <th className="p-2 text-left">{t("maintenance.col.by")}</th>
                  {canWrite && <th className="p-2 w-10"><span className="sr-only">{t("common.actions")}</span></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border/40 align-top">
                    <td className="p-2 whitespace-nowrap text-xs font-mono">{formatDateTime(r.performed_at, lang)}</td>
                    <td className="p-2">
                      <Badge variant="outline" className={cn("text-[10px] uppercase", KIND_TONE[r.kind] ?? "")}>
                        {KIND_LABEL[r.kind] ? t(KIND_LABEL[r.kind]) : r.kind}
                      </Badge>
                    </td>
                    <td className="p-2 text-sm text-muted-foreground">{r.notes || "—"}</td>
                    <td className="p-2 text-xs text-muted-foreground">{r.performed_by_name || "—"}</td>
                    {canWrite && (
                      <td className="p-2 text-right">
                        <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive hover:text-destructive"
                          aria-label={t("maintenance.removeRecord")} title={t("maintenance.removeRecord")} disabled={del.isPending}
                          onClick={() => setDeleteId(r.id)}>
                          <Trash2 aria-hidden className="h-3.5 w-3.5" />
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

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("maintenance.removeConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("common.irreversible")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) del.mutate(deleteId);
                setDeleteId(null);
              }}
            >
              {t("common.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [date, setDate] = useState<Date>(new Date());
  const [time, setTime] = useState(() => format(new Date(), "HH:mm"));
  const [kind, setKind] = useState("maintenance");
  const [notes, setNotes] = useState("");
  const [name, setName] = useState(defaultName);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error(t("maintenance.tenantMissing"));
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
      toast.success(t("maintenance.saved"));
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
            <Sparkles aria-hidden className="h-4 w-4 text-primary" /> {t("maintenance.dialogTitle")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("maintenance.col.date")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" aria-label={t("maintenance.pickDate")} className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                    <CalendarIcon aria-hidden className="mr-2 h-4 w-4" />
                    {date ? formatDate(date, lang) : t("maintenance.pick")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mnt-time" className="text-xs">{t("maintenance.time")}</Label>
              <Input id="mnt-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mnt-kind" className="text-xs">{t("maintenance.col.kind")}</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger id="mnt-kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="maintenance">{t("maintenance.kind.maintenance")}</SelectItem>
                <SelectItem value="cleaning">{t("maintenance.kind.cleaning")}</SelectItem>
                <SelectItem value="both">{t("maintenance.kind.both")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mnt-by" className="text-xs">{t("maintenance.col.by")}</Label>
            <Input id="mnt-by" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("maintenance.technicianName")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mnt-notes" className="text-xs">{t("maintenance.col.notes")}</Label>
            <Textarea id="mnt-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder={t("maintenance.notesPlaceholder")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>{t("common.cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="shadow-glow">
            {save.isPending && <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}