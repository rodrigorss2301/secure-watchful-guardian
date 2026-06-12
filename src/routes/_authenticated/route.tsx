import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, profile, loading } = useAuth();
  const { t } = useI18n();

  if (loading) {
    return (
      <div className="grid min-h-screen w-full place-items-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (profile?.status === "pending") return <Navigate to="/pending-approval" replace />;
  if (profile?.status === "disabled") return <Navigate to="/auth" replace />;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}