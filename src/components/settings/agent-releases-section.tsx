import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Package, Rocket, ShieldCheck } from "lucide-react";
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

// A publicação passa por /api/admin/agent-release: só o tenant dono da
// plataforma pode publicar, e o servidor calcula o SHA-256 do script servido.
// A versão vem do próprio install.ps1, por isso não há campo para digitá-la.
async function publishRelease(channel: "stable" | "beta", notes: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Sessão expirada — entre novamente");

  const res = await fetch("/api/admin/agent-release", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ channel, notes: notes.trim() || null }),
  });
  const payload = (await res.json().catch(() => null)) as
    | { version?: string; sha256?: string; error?: string }
    | null;
  if (!res.ok) {
    const code = payload?.error ?? `http_${res.status}`;
    throw new Error(
      code === "forbidden"
        ? "Apenas o tenant responsável pela plataforma pode publicar releases"
        : `Falha ao publicar: ${code}`,
    );
  }
  return payload as { version: string; sha256: string };
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
  const [notes, setNotes] = useState("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["agent-releases"] });
    qc.invalidateQueries({ queryKey: ["fleet-agent-versions"] });
  };

  const publish = useMutation({
    mutationFn: ({ target, text }: { target: "stable" | "beta"; text: string }) =>
      publishRelease(target, text),
    onSuccess: (result, vars) => {
      toast.success(
        `v${result.version} publicada em ${vars.target} — agentes atualizam no próximo heartbeat (~60s)`,
      );
      setNotes("");
      refresh();
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
            Cada agente baixa, confere o SHA-256 e aplica sozinho no próximo heartbeat — sem acesso à máquina.
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
            <Button
              size="sm"
              disabled={publish.isPending}
              onClick={() => publish.mutate({ target: "stable", text: notes })}
            >
              {publish.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Publicar em stable
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={publish.isPending}
              onClick={() => publish.mutate({ target: "beta", text: notes })}
            >
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
          <CardDescription>
            Endpoints aplicam auto-update conforme o canal configurado (stable/beta).
            Releases sem SHA-256 não são entregues aos agentes.
          </CardDescription>
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
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant={r.channel === "beta" ? "secondary" : "outline"}>{r.channel}</Badge>
                    <span className="font-mono font-semibold">{r.version}</span>
                    {r.sha256 ? (
                      <span
                        className="flex items-center gap-1 truncate font-mono text-xs text-emerald-600 dark:text-emerald-400"
                        title={r.sha256}
                      >
                        <ShieldCheck className="h-3 w-3 shrink-0" />
                        {r.sha256.slice(0, 12)}…
                      </span>
                    ) : (
                      <Badge variant="destructive" className="text-[10px]">sem hash — não entregue</Badge>
                    )}
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground">{new Date(r.released_at).toLocaleString()}</time>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nota da publicação</CardTitle>
          <CardDescription>
            A versão e o hash saem do <code>install.ps1</code> servido pelo próprio servidor. Só o
            tenant responsável pela plataforma pode publicar.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Canal padrão dos botões acima</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as "stable" | "beta")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="beta">beta</SelectItem>
                <SelectItem value="stable">stable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notas (opcional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="O que mudou nesta versão" />
          </div>
          <div className="sm:col-span-2">
            <Button
              variant="secondary"
              disabled={publish.isPending}
              onClick={() => publish.mutate({ target: channel, text: notes })}
            >
              {publish.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Publicar v{LATEST_AGENT_VERSION} em {channel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
