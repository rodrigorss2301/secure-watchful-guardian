import { createFileRoute } from "@tanstack/react-router";
import { Workflow } from "lucide-react";
import { StubPage } from "@/components/app/stub-page";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/automations")({
  head: () => ({ meta: [{ title: "Automations — Autotechs RMM" }] }),
  component: AutomationsPage,
});

function AutomationsPage() {
  const { t } = useI18n();
  return <StubPage title={t("nav.automations")} icon={Workflow} />;
}