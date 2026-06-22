import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao publicar"),
  });

  return (
    <div className="space-y-6">
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