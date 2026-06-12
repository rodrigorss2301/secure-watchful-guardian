import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Pencil, Plus, Trash2, Globe, Mail, Phone, MapPin, Calendar,
  FileText, Star, Building2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type TKey } from "@/lib/i18n";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { ContactFormDialog } from "@/components/clients/contact-form-dialog";
import { SLA_TONE, STATUS_TONE, type Client, type ClientContact } from "@/lib/clients";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  head: () => ({ meta: [{ title: "Cliente — Autotechs RMM" }] }),
  component: ClientDetailPage,
});

function ClientDetailPage() {
  const { id } = Route.useParams();
  const { t } = useI18n();
  const { hasAnyRole } = useAuth();
  const canWrite = hasAnyRole(["admin", "technician"]);
  const qc = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [contactDialog, setContactDialog] = useState<{ open: boolean; contact: ClientContact | null }>({ open: false, contact: null });
  const [deletingContact, setDeletingContact] = useState<ClientContact | null>(null);

  const { data: client, isLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Client | null;
    },
  });

  const { data: contacts } = useQuery({
    queryKey: ["contacts", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_contacts").select("*").eq("client_id", id)
        .order("is_primary", { ascending: false }).order("name");
      if (error) throw error;
      return data as ClientContact[];
    },
  });

  const deleteContact = useMutation({
    mutationFn: async (cid: string) => {
      const { error } = await supabase.from("client_contacts").delete().eq("id", cid);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts", id] });
      toast.success(t("clients.deleted"));
      setDeletingContact(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-64" /></div>;
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <Building2 className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-muted-foreground">404</p>
        <Button asChild variant="outline"><Link to="/clients">{t("common.back")}</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 h-8 text-muted-foreground">
            <Link to="/clients"><ArrowLeft className="mr-1.5 h-4 w-4" /> {t("clients.title")}</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-bold tracking-tight">{client.name}</h1>
            <Badge variant="outline" className={`uppercase text-[10px] ${STATUS_TONE[client.status]}`}>
              {t(`clients.status.${client.status}` as TKey)}
            </Badge>
            <Badge variant="outline" className={`uppercase text-[10px] ${SLA_TONE[client.sla_tier]}`}>
              SLA {t(`clients.sla.${client.sla_tier}` as TKey)}
            </Badge>
          </div>
          {client.industry && <p className="mt-1 text-sm text-muted-foreground">{client.industry}</p>}
        </div>
        {canWrite && (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" /> {t("clients.edit")}
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-border/60 p-5 lg:col-span-2">
          <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("clients.detail.info")}
          </h2>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Info icon={Mail} label={t("clients.field.email")} value={client.email} link={client.email ? `mailto:${client.email}` : undefined} />
            <Info icon={Phone} label={t("clients.field.phone")} value={client.phone} link={client.phone ? `tel:${client.phone}` : undefined} />
            <Info icon={Globe} label={t("clients.field.website")} value={client.website} link={client.website ?? undefined} />
            <Info
              icon={MapPin}
              label={t("clients.field.address")}
              value={[client.address_line, client.city, client.state, client.country, client.postal_code].filter(Boolean).join(", ") || null}
            />
          </dl>
          {client.notes && (
            <>
              <Separator className="my-5" />
              <div className="flex gap-3">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{client.notes}</p>
              </div>
            </>
          )}
        </Card>

        <Card className="border-border/60 p-5">
          <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("clients.detail.contract")}
          </h2>
          <dl className="space-y-4">
            <Info icon={Calendar} label={t("clients.field.contractStart")} value={fmtDate(client.contract_start)} />
            <Info icon={Calendar} label={t("clients.field.contractEnd")} value={fmtDate(client.contract_end)} />
          </dl>
        </Card>
      </div>

      <Card className="border-border/60">
        <div className="flex items-center justify-between border-b border-border/60 p-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("clients.detail.contacts")} {contacts && `(${contacts.length})`}
          </h2>
          {canWrite && (
            <Button size="sm" onClick={() => setContactDialog({ open: true, contact: null })}>
              <Plus className="mr-1.5 h-4 w-4" /> {t("clients.contact.new")}
            </Button>
          )}
        </div>
        {!contacts || contacts.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-muted-foreground">{t("clients.contact.empty")}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    {c.is_primary && <Star className="h-3.5 w-3.5 fill-primary text-primary" />}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    {c.role && <span>{c.role}</span>}
                    {c.email && <a href={`mailto:${c.email}`} className="hover:text-primary">{c.email}</a>}
                    {c.phone && <a href={`tel:${c.phone}`} className="hover:text-primary">{c.phone}</a>}
                  </div>
                </div>
                {canWrite && (
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setContactDialog({ open: true, contact: c })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeletingContact(c)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ClientFormDialog open={editOpen} onOpenChange={setEditOpen} client={client} />
      <ContactFormDialog
        open={contactDialog.open}
        onOpenChange={(o) => setContactDialog((s) => ({ ...s, open: o }))}
        clientId={id}
        contact={contactDialog.contact}
      />

      <AlertDialog open={!!deletingContact} onOpenChange={(o) => !o && setDeletingContact(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deletingContact?.name}</AlertDialogTitle>
            <AlertDialogDescription>{t("clients.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingContact && deleteContact.mutate(deletingContact.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("clients.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Info({
  icon: Icon, label, value, link,
}: { icon: typeof Mail; label: string; value: string | null | undefined; link?: string }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
        <dd className="truncate text-sm">
          {value
            ? link
              ? <a href={link} target="_blank" rel="noreferrer" className="hover:text-primary">{value}</a>
              : value
            : <span className="text-muted-foreground/60">—</span>}
        </dd>
      </div>
    </div>
  );
}

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString();
}