import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { LifeBuoy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/portal/tickets/new")({
  head: () => ({ meta: [{ title: "New Ticket — Autotechs Portal" }] }),
  component: NewPortalTicket,
});

function NewPortalTicket() {
  const { t } = useI18n();
  const { profile, tenant } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [category, setCategory] = useState("");

  const clientId = (profile as any)?.client_id ?? null;

  const create = useMutation({
    mutationFn: async () => {
      if (!tenant || !profile) throw new Error("no session");
      if (!clientId) throw new Error(t("portal.notLinked"));
      const { data, error } = await (supabase as any)
        .from("tickets")
        .insert({
          tenant_id: tenant.id,
          client_id: clientId,
          title: title.trim(),
          description: description.trim() || null,
          priority: priority as any,
          category: (category.trim() || undefined) as any,
          status: "open" as any,
          created_by: profile.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      toast.success(t("portal.created"));
      navigate({ to: "/portal/tickets/$id", params: { id: d!.id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <LifeBuoy className="h-6 w-6 text-primary" /> {t("portal.new")}
      </h1>
      {!clientId && <Card><CardContent className="p-4 text-sm text-amber-500">{t("portal.notLinked")}</CardContent></Card>}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div><Label>{t("portal.field.title")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>{t("portal.field.description")}</Label><Textarea rows={6} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t("portal.field.priority")}</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("portal.field.category")}</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="hardware, network, software…" /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => navigate({ to: "/portal/tickets" })}>{t("portal.cancel")}</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !title.trim() || !clientId}>{t("portal.create")}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}