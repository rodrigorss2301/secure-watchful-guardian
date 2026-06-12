import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { StubPage } from "@/components/app/stub-page";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — Autotechs RMM" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { t } = useI18n();
  return <StubPage title={t("nav.reports")} icon={BarChart3} />;
}