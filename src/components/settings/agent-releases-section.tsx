import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Package, Rocket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LATEST_AGENT_VERSION } from "@/lib/agent-version";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function AgentReleasesSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["agent-releases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_releases")
        .select("id, channel, version, script_url, sha256, notes, released_at")
        .order("released_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const { data: fleet } = useQuery({
    queryKey: ["fleet-agent-versions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endpoints")
        .select("agent_version, update_channel");
      if (error) throw error;
      const byVersion = new Map<string, number>();
      const byChannel = { stable: 0, beta: 0 } as Record<string, number>;
      for (const e of data ?? []) {
        const v = e.agent_version ?? "—";
        byVersion.set(v, (byVersion.get(v) ?? 0) + 1);
        const c = (e.update_channel ?? "stable") as "stable" | "beta";
        byChannel[c] = (byChannel[c] ?? 0) + 1;
      }
      return {
        total: data?.length ?? 0,
        upToDate: byVersion.get(LATEST_AGENT_VERSION) ?? 0,
        versions: Array.from(byVersion.entries()).sort((a, b) => b[1] - a[1]),
        byChannel,
      };
    },
  });

  const [channel, setChannel] = useState<"stable" | "beta">("beta");
  const [version, setVersion] = useState("");
  const [scriptUrl, setScriptUrl] = useState("/agent/install.ps1");
  const [sha, setSha] = useState("");
  const [notes, setNotes] = useState("");

  const publish = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("agent_releases").insert({
        channel, version: version.trim(), script_url: scriptUrl.trim(),
        sha256: sha.trim() || null, notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Release ${version} publicada em ${channel}`);
      setVersion(""); setSha(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["agent-releases"] });
      qc.invalidateQueries({ queryKey: ["fleet-agent-versions"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao publicar"),
  });

  const quickPush = useMutation({
    mutationFn: async (targetChannel: "stable" | "beta") => {
      const { error } = await supabase
        .from("agent_releases")
        .upsert(
          {
            channel: targetChannel,
            version: LATEST_AGENT_VERSION,
            script_url: "/agent/install.ps1",
            sha256: null,
            notes: `Push do servidor — ${new Date().toLocaleString()}`,
            released_at: new Date().toISOString(),
          },
          { onConflict: "channel,version" },
        );
      if (error) throw error;
    },
    onSuccess: (_d, ch) => {
      toast.success(`v${LATEST_AGENT_VERSION} publicada em ${ch} — agentes vão atualizar no próximo heartbeat (~60s)`);
      qc.invalidateQueries({ queryKey: ["agent-releases"] });
      qc.invalidateQueries({ queryKey: ["fleet-agent-versions"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao publicar"),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Rocket className="h-4 w-4" /> Atualizar frota agora</CardTitle>
          <CardDescription>
            Publica a versão atual do servidor (<code className="font-mono">v{LATEST_AGENT_VERSION}</code>) como release.
            Cada agente baixa e aplica sozinho no próximo heartbeat — sem acesso à máquina.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Endpoints" value={String(fleet?.total ?? 0)} />
            <Stat label={`Em v${LATEST_AGENT_VERSION}`} value={`${fleet?.upToDate ?? 0}/${fleet?.total ?? 0}`} />
            <Stat label="Canal stable" value={String(fleet?.byChannel.stable ?? 0)} />
            <Stat label="Canal beta" value={String(fleet?.byChannel.beta ?? 0)} />
          </div>

          {fleet && fleet.versions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {fleet.versions.map(([v, n]) => (
                <Badge key={v} variant={v === LATEST_AGENT_VERSION ? "default" : "outline"} className="font-mono text-xs">
                  v{v} · {n}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={quickPush.isPending} onClick={() => quickPush.mutate("stable")}>
              {quickPush.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Publicar v{LATEST_AGENT_VERSION} em stable
            </Button>
            <Button size="sm" variant="outline" disabled={quickPush.isPending} onClick={() => quickPush.mutate("beta")}>
              Publicar em beta
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Dica: teste primeiro em <strong>beta</strong> (mude o canal de alguns endpoints na aba do agente) e depois promova para <strong>stable</strong>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Package className="h-4 w-4" /> Releases do agente</CardTitle>
          <CardDescription>Endpoints aplicam auto-update conforme o canal configurado (stable/beta).</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma release publicada.</p>
          ) : (
            <div className="space-y-2">
              {data!.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant={r.channel === "beta" ? "secondary" : "outline"}>{r.channel}</Badge>
                    <span className="font-mono font-semibold">{r.version}</span>
                    <span className="font-mono text-xs text-muted-foreground">{r.script_url}</span>
                  </div>
                  <time className="text-xs text-muted-foreground">{new Date(r.released_at).toLocaleString()}</time>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Publicar nova versão</CardTitle>
          <CardDescription>Aponte para o script vigente em <code>/agent/install.ps1</code> ou um URL externo.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Canal</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as "stable" | "beta")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="beta">beta</SelectItem>
                <SelectItem value="stable">stable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Versão (ex: 1.6.1)</Label>
            <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.6.1" />
          </div>
          <div className="sm:col-span-2">
            <Label>URL do script</Label>
            <Input value={scriptUrl} onChange={(e) => setScriptUrl(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>SHA-256 (opcional, recomendado)</Label>
            <Input value={sha} onChange={(e) => setSha(e.target.value)} placeholder="hex sha256" />
          </div>
          <div className="sm:col-span-2">
            <Label>Notas</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Button disabled={!version.trim() || publish.isPending} onClick={() => publish.mutate()}>
              {publish.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Publicar release
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}