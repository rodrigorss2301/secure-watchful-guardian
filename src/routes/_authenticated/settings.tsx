import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole, type ProfileStatus } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Autotechs RMM" }] }),
  component: SettingsPage,
});

const ROLES: AppRole[] = ["admin", "technician", "viewer"];

function initials(name: string | null, email: string): string {
  const src = (name?.trim() || email).split(/\s+/);
  return (src[0]?.[0] ?? "?").concat(src[1]?.[0] ?? "").toUpperCase();
}

function SettingsPage() {
  const { t } = useI18n();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.subtitle")} />
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">{t("settings.tab.profile")}</TabsTrigger>
          {isAdmin && <TabsTrigger value="team">{t("settings.tab.team")}</TabsTrigger>}
          {isAdmin && <TabsTrigger value="company">{t("settings.tab.company")}</TabsTrigger>}
        </TabsList>
        <TabsContent value="profile"><ProfileTab /></TabsContent>
        {isAdmin && <TabsContent value="team"><TeamTab /></TabsContent>}
        {isAdmin && <TabsContent value="company"><CompanyTab /></TabsContent>}
      </Tabs>
    </>
  );
}

function ProfileTab() {
  const { t } = useI18n();
  const { profile, refresh } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? "");

  const save = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("no profile");
      const { error } = await supabase.from("profiles")
        .update({ full_name: fullName.trim() || null, avatar_url: avatarUrl.trim() || null })
        .eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: async () => { toast.success(t("settings.profile.saved")); await refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.profile.title")}</CardTitle>
        <CardDescription>{t("settings.profile.sub")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-xl">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={avatarUrl || undefined} alt={fullName} />
            <AvatarFallback>{initials(fullName, profile?.email ?? "?")}</AvatarFallback>
          </Avatar>
          <div className="text-sm text-muted-foreground">{profile?.email}</div>
        </div>
        <div className="grid gap-2">
          <Label>{t("settings.profile.fullName")}</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>{t("settings.profile.avatar")}</Label>
          <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("common.save")}
        </Button>
      </CardContent>
    </Card>
  );
}

function CompanyTab() {
  const { t } = useI18n();
  const { tenant, refresh } = useAuth();
  const [name, setName] = useState(tenant?.name ?? "");

  const save = useMutation({
    mutationFn: async () => {
      if (!tenant) throw new Error("no tenant");
      const { error } = await supabase.from("tenants").update({ name: name.trim() }).eq("id", tenant.id);
      if (error) throw error;
    },
    onSuccess: async () => { toast.success(t("settings.company.saved")); await refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.company.title")}</CardTitle>
        <CardDescription>{t("settings.company.sub")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-xl">
        <div className="grid gap-2">
          <Label>{t("settings.company.name")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>{t("settings.company.slug")}</Label>
          <Input value={tenant?.slug ?? ""} disabled />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("common.save")}
        </Button>
      </CardContent>
    </Card>
  );
}

type MemberRow = {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  status: ProfileStatus;
  role: AppRole | null;
};

function TeamTab() {
  const { t } = useI18n();
  const { tenant, user: me } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProfileStatus>("all");

  const { data: members, isLoading } = useQuery({
    queryKey: ["team-members", tenant?.id],
    queryFn: async (): Promise<MemberRow[]> => {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, avatar_url, status").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role as AppRole]));
      return (profiles ?? []).map((p) => ({ ...p, role: roleMap.get(p.id) ?? null })) as MemberRow[];
    },
    enabled: !!tenant,
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (members ?? []).filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (!s) return true;
      return (m.full_name ?? "").toLowerCase().includes(s) || m.email.toLowerCase().includes(s);
    });
  }, [members, q, statusFilter]);

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ProfileStatus }) => {
      const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("settings.team.statusUpdated")); qc.invalidateQueries({ queryKey: ["team-members"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role, current }: { userId: string; role: AppRole; current: AppRole | null }) => {
      if (!tenant) throw new Error("no tenant");
      if (current) {
        const { error } = await supabase.from("user_roles")
          .update({ role }).eq("user_id", userId).eq("tenant_id", tenant.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles")
          .insert({ user_id: userId, tenant_id: tenant.id, role });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(t("settings.team.roleUpdated")); qc.invalidateQueries({ queryKey: ["team-members"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: async (m: MemberRow) => {
      if (!tenant) throw new Error("no tenant");
      const { error: pErr } = await supabase.from("profiles").update({ status: "active" }).eq("id", m.id);
      if (pErr) throw pErr;
      if (!m.role) {
        const { error: rErr } = await supabase.from("user_roles")
          .insert({ user_id: m.id, tenant_id: tenant.id, role: "technician" });
        if (rErr) throw rErr;
      }
    },
    onSuccess: () => { toast.success(t("settings.team.approved")); qc.invalidateQueries({ queryKey: ["team-members"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.team.title")}</CardTitle>
        <CardDescription>{t("settings.team.sub")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("settings.team.search")} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("settings.team.filter.all")}</SelectItem>
              <SelectItem value="pending">{t("settings.team.pending")}</SelectItem>
              <SelectItem value="active">{t("settings.team.active")}</SelectItem>
              <SelectItem value="disabled">{t("settings.team.disabled")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settings.team.col.user")}</TableHead>
                <TableHead>{t("settings.team.col.status")}</TableHead>
                <TableHead>{t("settings.team.col.role")}</TableHead>
                <TableHead className="text-right">{t("settings.team.col.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">{t("common.loading")}</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">{t("settings.team.empty")}</TableCell></TableRow>
              ) : filtered.map((m) => {
                const isSelf = me?.id === m.id;
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={m.avatar_url || undefined} alt={m.full_name ?? m.email} />
                          <AvatarFallback>{initials(m.full_name, m.email)}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-medium">{m.full_name ?? m.email}{isSelf && " (you)"}</span>
                          <span className="text-xs text-muted-foreground">{m.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={m.status} />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={m.role ?? ""}
                        onValueChange={(v) => setRole.mutate({ userId: m.id, role: v as AppRole, current: m.role })}
                        disabled={isSelf || setRole.isPending}
                      >
                        <SelectTrigger className="w-[160px]"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => <SelectItem key={r} value={r}>{t(`role.${r}` as TKey)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {m.status === "pending" && (
                          <Button size="sm" onClick={() => approve.mutate(m)} disabled={approve.isPending}>
                            <UserCheck className="mr-1 h-3.5 w-3.5" /> {t("settings.team.approve")}
                          </Button>
                        )}
                        {m.status === "active" && !isSelf && (
                          <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: m.id, status: "disabled" })} disabled={setStatus.isPending}>
                            <UserX className="mr-1 h-3.5 w-3.5" /> {t("settings.team.disable")}
                          </Button>
                        )}
                        {m.status === "disabled" && (
                          <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: m.id, status: "active" })} disabled={setStatus.isPending}>
                            <ShieldCheck className="mr-1 h-3.5 w-3.5" /> {t("settings.team.reactivate")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: ProfileStatus }) {
  const { t } = useI18n();
  const cls = status === "active"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
    : status === "pending"
    ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
    : "border-rose-500/40 bg-rose-500/10 text-rose-500";
  const key: TKey = status === "active" ? "settings.team.active" : status === "pending" ? "settings.team.pending" : "settings.team.disabled";
  return <Badge variant="outline" className={cls}>{t(key)}</Badge>;
}