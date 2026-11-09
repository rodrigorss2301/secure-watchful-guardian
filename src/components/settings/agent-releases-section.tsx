import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Package, Rocket, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LATEST_AGENT_VERSION } from "@/lib/agent-version";
import { useI18n, type TKey } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

// A publicação passa por /api/admin/agent-release: só o tenant dono da
// plataforma pode publicar, e o servidor calcula o SHA-256 do script servido.
// A versão vem do próprio install.ps1, por isso não há campo para digitá-la.
async function publishRelease(channel: "stable" | "beta", notes: string, t: (k: TKey) => string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error(t("releases.error.session"));

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
        ? t("releases.error.forbidden")
        : t("releases.error.failed").replace("{code}", code),
    );
  }
  return payload as { version: string; sha256: string };
}

export function AgentReleasesSection() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
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
  // Publicar em stable atinge a frota inteira: pede confirmação antes.
  const [confirmStable, setConfirmStable] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["agent-releases"] });
    qc.invalidateQueries({ queryKey: ["fleet-agent-versions"] });
  };

  const publish = useMutation({
    mutationFn: ({ target, text }: { target: "stable" | "beta"; text: string }) =>
      publishRelease(target, text, t),
    onSuccess: (result, vars) => {
      toast.success(
        t("releases.published").replace("{version}", result.version).replace("{channel}", vars.target),
      );
      setNotes("");
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : t("releases.error.generic")),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Rocket className="h-4 w-4" aria-hidden="true" /> {t("releases.fleet.title")}</CardTitle>
          <CardDescription>
            {t("releases.fleet.desc1")} (<code className="font-mono">v{LATEST_AGENT_VERSION}</code>) {t("releases.fleet.desc2")}
            {" "}{t("releases.fleet.desc3")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t("releases.stat.endpoints")} value={String(fleet?.total ?? 0)} />
            <Stat label={t("releases.stat.onVersion").replace("{version}", LATEST_AGENT_VERSION)} value={`${fleet?.upToDate ?? 0}/${fleet?.total ?? 0}`} />
            <Stat label={t("releases.stat.stable")} value={String(fleet?.byChannel.stable ?? 0)} />
            <Stat label={t("releases.stat.beta")} value={String(fleet?.byChannel.beta ?? 0)} />
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
              onClick={() => setConfirmStable(true)}
            >
              {publish.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t("releases.publishStable")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={publish.isPending}
              onClick={() => publish.mutate({ target: "beta", text: notes })}
            >
              {t("releases.publishBeta")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("releases.tip")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Package className="h-4 w-4" aria-hidden="true" /> {t("releases.list.title")}</CardTitle>
          <CardDescription>
            {t("releases.list.desc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p role="status" className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : isError ? (
            <p role="alert" className="text-sm text-muted-foreground">{t("releases.list.loadError")}</p>
          ) : (data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">{t("releases.list.empty")}</p>
          ) : (
            <div className="space-y-2">
              {data!.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border p-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant={r.channel === "beta" ? "secondary" : "outline"}>{r.channel}</Badge>
                    <span className="font-mono font-semibold">{r.version}</span>
                    {r.sha256 ? (
                      <span
                        className="flex items-center gap-1 truncate font-mono text-xs text-emerald-600 dark:text-emerald-400"
                        title={r.sha256}
                      >
                        <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
                        {r.sha256.slice(0, 12)}…
                      </span>
                    ) : (
                      <Badge variant="destructive" className="text-xs">{t("releases.noHash")}</Badge>
                    )}
                  </div>
                  <time dateTime={r.released_at} className="shrink-0 text-xs text-muted-foreground">{formatDateTime(r.released_at, lang)}</time>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("releases.notes.title")}</CardTitle>
          <CardDescription>
            {t("releases.notes.desc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="rel-channel">{t("releases.notes.channel")}</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as "stable" | "beta")}>
              <SelectTrigger id="rel-channel"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="beta">beta</SelectItem>
                <SelectItem value="stable">stable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="rel-notes">{t("releases.notes.label")}</Label>
            <Input id="rel-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("releases.notes.placeholder")} />
          </div>
          <div className="sm:col-span-2">
            <Button
              variant="secondary"
              disabled={publish.isPending}
              onClick={() => (channel === "stable" ? setConfirmStable(true) : publish.mutate({ target: channel, text: notes }))}
            >
              {publish.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t("releases.publishVersion").replace("{version}", LATEST_AGENT_VERSION).replace("{channel}", channel)}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmStable} onOpenChange={setConfirmStable}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("releases.confirm.title").replace("{version}", LATEST_AGENT_VERSION)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("releases.confirm.desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => publish.mutate({ target: "stable", text: notes })}>
              {t("releases.publishStable")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
