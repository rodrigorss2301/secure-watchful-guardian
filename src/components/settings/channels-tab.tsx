import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";

const KINDS = ["email", "webhook", "slack", "teams", "whatsapp"] as const;
type Kind = typeof KINDS[number];

export function ChannelsTab() {
  const { t } = useI18n();
  const { tenant } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [toRemove, setToRemove] = useState<{ id: string; name: string } | null>(null);

  const q = useQuery({
    queryKey: ["notification-channels", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("notification_channels").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("notification_channels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("channels.removed")); qc.invalidateQueries({ queryKey: ["notification-channels"] }); },
    onError: (e: Error) => toast.error(t("channels.removeError").replace("{error}", e.message)),
  });

  const toggle = useMutation({
    mutationFn: async (c: any) => {
      const { error } = await (supabase as any).from("notification_channels").update({ enabled: !c.enabled }).eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-channels"] }),
    onError: (e: Error) => toast.error(t("channels.toggleError").replace("{error}", e.message)),
  });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0">
        <div>
          <CardTitle>{t("channels.title")}</CardTitle>
          <CardDescription>{t("channels.desc")}</CardDescription>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" aria-hidden="true" /> {t("channels.new")}</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading && <p role="status" className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {q.isError && <p role="alert" className="text-sm text-muted-foreground">{t("channels.loadError")}</p>}
        {!q.isLoading && !q.isError && (q.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">{t("channels.empty")}</p>
        )}
        {(q.data ?? []).map((c: any) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
            <Badge variant="outline" className="text-xs uppercase">{c.kind}</Badge>
            <span className="font-medium">{c.name}</span>
            <span className="min-w-0 flex-1 basis-40 truncate text-xs text-muted-foreground" title={c.config?.to ?? c.config?.url ?? c.config?.webhook_url}>
              {c.kind === "email" && c.config?.to}
              {c.kind === "webhook" && c.config?.url}
              {c.kind === "slack" && c.config?.webhook_url}
              {c.kind === "teams" && c.config?.webhook_url}
              {c.kind === "whatsapp" && c.config?.to}
            </span>
            <Switch checked={c.enabled} onCheckedChange={() => toggle.mutate(c)} disabled={toggle.isPending} aria-label={t(c.enabled ? "channels.disableAria" : "channels.enableAria").replace("{name}", c.name)} />
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setToRemove({ id: c.id, name: c.name })} disabled={remove.isPending} title={t("channels.removeTitle")} aria-label={t("channels.removeAria").replace("{name}", c.name)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
      </CardContent>
      <AlertDialog open={toRemove !== null} onOpenChange={(o) => !o && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("channels.removeConfirmTitle").replace("{name}", toRemove?.name ?? "")}</AlertDialogTitle>
            <AlertDialogDescription>{t("channels.removeConfirmDesc")} {t("common.irreversible")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (toRemove) remove.mutate(toRemove.id); setToRemove(null); }}
            >
              {t("common.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ChannelDialog open={open} onOpenChange={setOpen} onCreated={() => qc.invalidateQueries({ queryKey: ["notification-channels"] })} />
    </Card>
  );
}

function ChannelDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const { t } = useI18n();
  const { tenant } = useAuth();
  const [kind, setKind] = useState<Kind>("email");
  const [name, setName] = useState("");
  const [field1, setField1] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!tenant) throw new Error("no tenant");
      const config: Record<string, string> = {};
      if (kind === "email") config.to = field1;
      else if (kind === "webhook") config.url = field1;
      else if (kind === "slack" || kind === "teams") config.webhook_url = field1;
      else if (kind === "whatsapp") config.to = field1;
      const { error } = await (supabase as any).from("notification_channels").insert({
        tenant_id: tenant.id, kind, name: name.trim() || kind, config, enabled: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("channels.created")); onCreated(); onOpenChange(false);
      setName(""); setField1("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const label = t(`channels.target.${kind}` as TKey);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("channels.new")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="ch-kind">{t("channels.field.kind")}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger id="ch-kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label htmlFor="ch-name">{t("channels.field.name")}</Label><Input id="ch-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("channels.field.namePlaceholder")} /></div>
          <div><Label htmlFor="ch-target">{label}</Label><Input id="ch-target" type={kind === "email" ? "email" : kind === "webhook" || kind === "slack" || kind === "teams" ? "url" : "tel"} value={field1} onChange={(e) => setField1(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !field1.trim()}>
            {create.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="mr-1 h-4 w-4" aria-hidden="true" />} {t("channels.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}