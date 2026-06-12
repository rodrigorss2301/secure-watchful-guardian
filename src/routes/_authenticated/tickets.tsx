import { createFileRoute } from "@tanstack/react-router";
import { TicketCheck } from "lucide-react";
import { StubPage } from "@/components/app/stub-page";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/tickets")({
  head: () => ({ meta: [{ title: "Tickets — Autotechs RMM" }] }),
  component: TicketsPage,
});

function TicketsPage() {
  const { t } = useI18n();
  return <StubPage title={t("nav.tickets")} icon={TicketCheck} />;
}