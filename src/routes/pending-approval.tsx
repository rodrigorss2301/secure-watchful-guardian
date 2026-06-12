import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/brand/logo";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/pending-approval")({
  head: () => ({ meta: [{ title: "Awaiting approval — Autotechs RMM" }] }),
  component: PendingApprovalPage,
});

function PendingApprovalPage() {
  const { signOut, tenant } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-background p-4">
      <div className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-40" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-warning/10 blur-[120px]" />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo size={44} />
        </div>
        <Card className="border-border/60 bg-card/80 p-8 text-center shadow-elegant backdrop-blur-xl">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-warning/15 text-warning">
            <Clock className="h-7 w-7" />
          </div>
          <h1 className="mt-5 font-display text-2xl font-bold">{t("pending.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("pending.body")}</p>
          {tenant && (
            <p className="mt-4 inline-block rounded-md bg-muted px-3 py-1 text-xs font-medium">
              {tenant.name}
            </p>
          )}
          <Button variant="outline" onClick={handleSignOut} className="mt-6 w-full">
            {t("pending.signOut")}
          </Button>
        </Card>
      </div>
    </div>
  );
}