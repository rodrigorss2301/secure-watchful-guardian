import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "./app-shell";
import { useI18n } from "@/lib/i18n";

export function StubPage({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
}) {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card className="flex flex-col items-center justify-center gap-4 border-dashed bg-card/50 p-16 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-7 w-7" />
        </div>
        <p className="max-w-md text-sm text-muted-foreground">{t("stub.coming")}</p>
      </Card>
    </>
  );
}