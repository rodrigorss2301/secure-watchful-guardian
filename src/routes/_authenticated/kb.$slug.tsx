import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Edit2, Eye, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { KbArticleDialog, type KbArticle } from "@/components/kb/kb-article-dialog";

export const Route = createFileRoute("/_authenticated/kb/$slug")({
  head: () => ({ meta: [{ title: "Artigo — Autotechs RMM" }] }),
  component: ArticleView,
  notFoundComponent: NotFound,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
});

function NotFound() {
  const { t } = useI18n();
  return <p className="text-sm text-muted-foreground">{t("common.notFound")}</p>;
}

function ArticleView() {
  const { slug } = Route.useParams();
  const { t, lang } = useI18n();
  const { hasAnyRole } = useAuth();
  const router = useRouter();
  const canEdit = hasAnyRole(["admin", "technician"]);
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["kb-article", slug],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("kb_articles").select("*").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return (data ?? null) as KbArticle | null;
    },
  });

  useEffect(() => {
    if (q.data?.id) {
      (supabase as any).from("kb_articles").update({ views: (q.data.views ?? 0) + 1 }).eq("id", q.data.id).then(() => {});
    }
  }, [q.data?.id]);

  const a = q.data;

  if (q.isLoading) return <p className="text-sm text-muted-foreground" role="status">{t("common.loading")}</p>;
  if (q.isError) return <p className="text-sm text-destructive" role="alert">{t("common.error")}</p>;
  if (!a) return <p className="text-sm text-muted-foreground">{t("common.notFound")}</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/kb"><ArrowLeft className="mr-2 h-4 w-4" /> {t("kb.backToList")}</Link>
        </Button>
        {canEdit && (
          <Button size="sm" onClick={() => setOpen(true)}><Edit2 className="mr-2 h-4 w-4" /> {t("kb.action.edit")}</Button>
        )}
      </div>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <BookOpen aria-hidden="true" className="h-5 w-5 text-primary" />
          <Badge variant="outline" className="text-[10px] uppercase">{t(`kb.status.${a.status}` as TKey)}</Badge>
          <Badge variant="outline" className="text-[10px] uppercase">{t(`kb.visibility.${a.visibility}` as TKey)}</Badge>
          {a.category && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{a.category}</span>}
        </div>
        <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{a.title}</h1>
        {a.excerpt && <p className="text-base text-muted-foreground">{a.excerpt}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{t("kb.updated")}: {formatDateTime(a.updated_at, lang)}</span>
          <span className="flex items-center gap-1"><Eye aria-hidden="true" className="h-3 w-3" /> {a.views ?? 0} {t("kb.views")}</span>
        </div>
      </header>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{a.body}</pre>
        </CardContent>
      </Card>

      {a.tags && a.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {a.tags.map((tag: string) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
        </div>
      )}

      <KbArticleDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) router.invalidate(); }} article={a} />
    </div>
  );
}