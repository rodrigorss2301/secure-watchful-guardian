import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, Search, Edit2, Trash2, Eye, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/app/app-shell";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { KbArticleDialog, type KbArticle } from "@/components/kb/kb-article-dialog";

export const Route = createFileRoute("/_authenticated/kb")({
  head: () => ({ meta: [{ title: "Base de Conhecimento — Autotechs RMM" }] }),
  component: KbPage,
});

function KbPage() {
  const { t, lang } = useI18n();
  const { hasAnyRole } = useAuth();
  const canEdit = hasAnyRole(["admin", "technician"]);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [visibility, setVisibility] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [editing, setEditing] = useState<KbArticle | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<KbArticle | null>(null);

  const query = useQuery({
    queryKey: ["kb-articles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("kb_articles")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as KbArticle[];
    },
  });

  const articles = query.data ?? [];
  const categories = useMemo(() => Array.from(new Set(articles.map((a) => a.category).filter(Boolean) as string[])), [articles]);

  const filtered = articles.filter((a) => {
    if (status !== "all" && a.status !== status) return false;
    if (visibility !== "all" && a.visibility !== visibility) return false;
    if (category !== "all" && a.category !== category) return false;
    if (search && !`${a.title} ${a.excerpt ?? ""} ${(a.tags ?? []).join(" ")}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const published = articles.filter((a) => a.status === "published").length;
  const drafts = articles.filter((a) => a.status === "draft").length;
  const totalViews = articles.reduce((acc, a) => acc + (a.views ?? 0), 0);

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("kb_articles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("kb.toast.deleted"));
      qc.invalidateQueries({ queryKey: ["kb-articles"] });
      setDeleting(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleEdit = (a: KbArticle) => { setEditing(a); setOpen(true); };
  const handleNew = () => { setEditing(null); setOpen(true); };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("kb.title")}
        description={t("kb.subtitle")}
        actions={canEdit && (
          <Button onClick={handleNew} className="shadow-glow"><Plus className="mr-2 h-4 w-4" /> {t("kb.new")}</Button>
        )}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={FileText} label={t("kb.kpi.total")} value={articles.length} />
        <Kpi icon={FileText} label={t("kb.kpi.published")} value={published} />
        <Kpi icon={FileText} label={t("kb.kpi.drafts")} value={drafts} />
        <Kpi icon={Eye} label={t("kb.kpi.views")} value={totalViews} />
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1 basis-full sm:min-w-[240px] sm:basis-auto">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="search" aria-label={t("kb.search")} className="pl-9" placeholder={t("kb.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <FilterSelect label={t("kb.filter.status")} value={status} onChange={setStatus}
              options={[{ value: "all", label: t("kb.filter.all") }, ...(["draft", "published", "archived"] as const).map((s) => ({ value: s, label: t(`kb.status.${s}` as TKey) }))]} />
            <FilterSelect label={t("kb.filter.visibility")} value={visibility} onChange={setVisibility}
              options={[{ value: "all", label: t("kb.filter.all") }, { value: "internal", label: t("kb.visibility.internal") }, { value: "public", label: t("kb.visibility.public") }]} />
            {categories.length > 0 && (
              <FilterSelect label={t("kb.filter.category")} value={category} onChange={setCategory}
                options={[{ value: "all", label: t("kb.filter.all") }, ...categories.map((c) => ({ value: c, label: c }))]} />
            )}
          </div>

          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground" role="status">{query.isLoading ? t("common.loading") : query.isError ? t("common.error") : t("kb.empty")}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((a) => (
                <article key={a.id} className="group flex flex-col rounded-lg border bg-card p-4 transition hover:border-primary/50">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={a.status} label={t(`kb.status.${a.status}` as TKey)} />
                    <VisibilityBadge v={a.visibility} label={t(`kb.visibility.${a.visibility}` as TKey)} />
                    {a.category && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{a.category}</span>}
                  </div>
                  <h3 className="line-clamp-2 text-base font-semibold leading-tight">{a.title}</h3>
                  {a.excerpt && <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{a.excerpt}</p>}
                  {a.tags && a.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {a.tags.slice(0, 4).map((tag: string) => <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>)}
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-4 text-xs text-muted-foreground">
                    <span>{formatDate(a.updated_at, lang)} · {a.views ?? 0} {t("kb.views")}</span>
                    <div className="flex gap-1">
                      <Button asChild size="sm" variant="ghost" className="h-9 min-w-9 px-2">
                        <Link to="/kb/$slug" params={{ slug: a.slug }} aria-label={`${t("kb.action.view")}: ${a.title}`}><Eye className="h-3.5 w-3.5" /></Link>
                      </Button>
                      {canEdit && (
                        <>
                          <Button size="sm" variant="ghost" className="h-9 min-w-9 px-2" aria-label={`${t("kb.action.edit")}: ${a.title}`} onClick={() => handleEdit(a)}><Edit2 className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-9 min-w-9 px-2 text-destructive hover:text-destructive" aria-label={`${t("kb.action.delete")}: ${a.title}`}
                            onClick={() => setDeleting(a)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <KbArticleDialog open={open} onOpenChange={setOpen} article={editing} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleting?.title}</AlertDialogTitle>
            <AlertDialogDescription>{t("kb.confirm.delete")} {t("common.irreversible")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("kb.action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: number }) {
  return (
    <Card><CardContent className="flex items-center justify-between p-4">
      <div><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>
      <Icon aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
    </CardContent></Card>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function StatusBadge({ status, label }: { status: KbArticle["status"]; label: string }) {
  const map: Record<KbArticle["status"], string> = {
    draft: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    published: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    archived: "border-muted-foreground/40 bg-muted text-muted-foreground",
  };
  return <Badge variant="outline" className={`text-[10px] uppercase ${map[status]}`}>{label}</Badge>;
}

function VisibilityBadge({ v, label }: { v: KbArticle["visibility"]; label: string }) {
  const cls = v === "public" ? "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400" : "border-muted-foreground/40 bg-muted text-muted-foreground";
  return <Badge variant="outline" className={`text-[10px] uppercase ${cls}`}>{label}</Badge>;
}