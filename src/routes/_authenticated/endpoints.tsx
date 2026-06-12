import { createFileRoute } from "@tanstack/react-router";
import { Server } from "lucide-react";
import { StubPage } from "@/components/app/stub-page";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/endpoints")({
  head: () => ({ meta: [{ title: "Endpoints — Autotechs RMM" }] }),
  component: EndpointsPage,
});

function EndpointsPage() {
  const { t } = useI18n();
  return <StubPage title={t("nav.endpoints")} icon={Server} />;
}