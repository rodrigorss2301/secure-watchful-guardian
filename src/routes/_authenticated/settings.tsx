import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { StubPage } from "@/components/app/stub-page";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Autotechs RMM" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useI18n();
  const { hasRole, loading } = useAuth();
  if (loading) return null;
  if (!hasRole("admin")) return <Navigate to="/dashboard" replace />;
  return <StubPage title={t("nav.settings")} icon={Settings} />;
}