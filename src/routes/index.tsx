import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Autotechs RMM" }] }),
  component: IndexRedirect,
});

function IndexRedirect() {
  const { user, profile, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen w-full place-items-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (profile?.status === "pending") return <Navigate to="/pending-approval" replace />;
  return <Navigate to="/dashboard" replace />;
}
