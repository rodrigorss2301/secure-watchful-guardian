import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type KbArticle = {
  id: string;
  tenant_id: string;
  client_id: string | null;
  author_id: string | null;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string;
  category: string | null;
  tags: string[];
  visibility: "internal" | "public";
  status: "draft" | "published" | "archived";
  views: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export function KbArticleDialog({ open, onOpenChange, article }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  article: KbArticle | null;
}) {
  const { t } = useI18n();
  const { profile, tenant } = useAuth();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<KbArticle["visibility"]>("internal");
  const [status, setStatus] = useState<KbArticle["status"]>("draft");
  const [clientId, setClientId] = useState<string>("none");

  const clients = useQuery({
    queryKey: ["kb-clients-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id,name").order("name").limit(500);
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    if (article) {
      setTitle(article.title); setSlug(article.slug); setExcerpt(article.excerpt ?? "");
      setBody(article.body); setCategory(article.category ?? "");
      setTags((article.tags ?? []).join(", "));
      setVisibility(article.visibility); setStatus(article.status);
      setClientId(article.client_id ?? "none");
    } else {
      setTitle(""); setSlug(""); setExcerpt(""); setBody(""); setCategory("");
      setTags(""); setVisibility("internal"); setStatus("draft"); setClientId("none");
    }
  }, [open, article]);

  useEffect(() => {
    if (!article && title && !slug) setSlug(slugify(title));
  }, [title, slug, article]);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenant || !profile) throw new Error("no session");
      const payload: any = {
        tenant_id: tenant.id,
        author_id: profile.id,
        title: title.trim(),
        slug: slug.trim() || slugify(title),
        excerpt: excerpt.trim() || null,
        body,
        category: category.trim() || null,
        tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
        visibility,
        status,
        client_id: clientId === "none" ? null : clientId,
        published_at: status === "published" ? (article?.published_at ?? new Date().toISOString()) : null,
      };
      if (article) {
        const { error } = await (supabase as any).from("kb_articles").update(payload).eq("id", article.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("kb_articles").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(t("kb.toast.saved"));
      qc.invalidateQueries({ queryKey: ["kb-articles"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{article ? t("kb.edit") : t("kb.new")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="kb-f-1">{t("kb.field.title")}</Label>
            <Input id="kb-f-1" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="kb-f-2">{t("kb.field.slug")}</Label>
            <Input id="kb-f-2" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="kb-f-3">{t("kb.field.excerpt")}</Label>
            <Textarea id="kb-f-3" rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="kb-f-4">{t("kb.field.body")}</Label>
            <Textarea id="kb-f-4" rows={10} className="font-mono text-xs" value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kb-f-5">{t("kb.field.category")}</Label>
            <Input id="kb-f-5" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kb-f-6">{t("kb.field.tags")}</Label>
            <Input id="kb-f-6" value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("kb.field.tagsPh")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kb-f-7">{t("kb.field.visibility")}</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as KbArticle["visibility"])}>
              <SelectTrigger id="kb-f-7"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">{t("kb.visibility.internal")}</SelectItem>
                <SelectItem value="public">{t("kb.visibility.public")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kb-f-8">{t("kb.field.status")}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as KbArticle["status"])}>
              <SelectTrigger id="kb-f-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{t("kb.status.draft")}</SelectItem>
                <SelectItem value="published">{t("kb.status.published")}</SelectItem>
                <SelectItem value="archived">{t("kb.status.archived")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="kb-f-9">{t("kb.field.client")}</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger id="kb-f-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {(clients.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("kb.action.cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !title.trim()}>{t("kb.action.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}