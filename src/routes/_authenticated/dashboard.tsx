import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard } from "lucide-react";
import { StubPage } from "@/components/app/stub-page";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Autotechs RMM" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { t } = useI18n();
  return <StubPage title={t("nav.dashboard")} icon={LayoutDashboard} />;
}