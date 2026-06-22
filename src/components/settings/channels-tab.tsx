import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const KINDS = ["email", "webhook", "slack", "teams", "whatsapp"] as const;
type Kind = typeof KINDS[number];

export function ChannelsTab() {
  const { tenant } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

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
    onSuccess: () => { toast.success("Canal removido"); qc.invalidateQueries({ queryKey: ["notification-channels"] }); },
  });

  const toggle = useMutation({
    mutationFn: async (c: any) => {
      const { error } = await (supabase as any).from("notification_channels").update({ enabled: !c.enabled }).eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-channels"] }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Canais de notificação</CardTitle>
          <CardDescription>Para onde enviar alertas: e-mail, webhook, Slack, Teams ou WhatsApp.</CardDescription>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> Novo canal</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading && <p className="text-sm text-muted-foreground">…</p>}
        {!q.isLoading && (q.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum canal configurado.</p>
        )}
        {(q.data ?? []).map((c: any) => (
          <div key={c.id} className="flex items-center gap-3 rounded-md border p-3">
            <Badge variant="outline" className="uppercase text-[10px]">{c.kind}</Badge>
            <span className="font-medium">{c.name}</span>
            <span className="text-xs text-muted-foreground truncate flex-1">
              {c.kind === "email" && c.config?.to}
              {c.kind === "webhook" && c.config?.url}
              {c.kind === "slack" && c.config?.webhook_url}
              {c.kind === "teams" && c.config?.webhook_url}
              {c.kind === "whatsapp" && c.config?.to}
            </span>
            <Switch checked={c.enabled} onCheckedChange={() => toggle.mutate(c)} />
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove.mutate(c.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </CardContent>
      <ChannelDialog open={open} onOpenChange={setOpen} onCreated={() => qc.invalidateQueries({ queryKey: ["notification-channels"] })} />
    </Card>
  );
}

function ChannelDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
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
      toast.success("Canal criado"); onCreated(); onOpenChange(false);
      setName(""); setField1("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const label = kind === "email" ? "E-mail destino" :
    kind === "webhook" ? "URL do webhook" :
    kind === "slack" ? "Slack incoming webhook URL" :
    kind === "teams" ? "Teams incoming webhook URL" :
    "Número WhatsApp (E.164, ex: +5511999999999)";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo canal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tipo</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Equipe NOC" /></div>
          <div><Label>{label}</Label><Input value={field1} onChange={(e) => setField1(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !field1.trim()}>
            <Send className="mr-1 h-4 w-4" /> Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}