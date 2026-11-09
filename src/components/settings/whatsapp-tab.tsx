import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageCircle, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";

export function WhatsAppTab() {
  const { t } = useI18n();
  const { tenant } = useAuth();
  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/public/whatsapp/inbound`
    : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-emerald-500" aria-hidden="true" /> {t("whatsapp.title")}</CardTitle>
        <CardDescription>{t("whatsapp.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/30 p-4 space-y-2 text-sm">
          <p className="font-semibold">{t("whatsapp.commands.title")}</p>
          <ul className="list-disc pl-5 text-muted-foreground space-y-1">
            <li><code>menu</code> — {t("whatsapp.commands.menu")}</li>
            <li><code>tickets</code> — {t("whatsapp.commands.tickets")}</li>
            <li><code>TKT-00012</code> — {t("whatsapp.commands.detail")}</li>
            <li><code>novo &lt;{t("whatsapp.commands.titlePlaceholder")}&gt;</code> — {t("whatsapp.commands.new")}</li>
            <li><code>comentar TKT-00012 &lt;{t("whatsapp.commands.textPlaceholder")}&gt;</code> — {t("whatsapp.commands.comment")}</li>
          </ul>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("whatsapp.webhook.title")}</p>
          <p className="text-xs text-muted-foreground">{t("whatsapp.webhook.hint")} <em>Messaging → Sandbox/Sender → A MESSAGE COMES IN</em>, {t("whatsapp.webhook.method")}</p>
          <code className="block select-all break-all rounded bg-muted px-3 py-2 text-xs">{webhookUrl}</code>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("whatsapp.link.title")}</p>
          <p className="text-xs text-muted-foreground">
            {t("whatsapp.link.desc")}
          </p>
        </div>

        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          {t("whatsapp.requires")} <Badge variant="outline" className="ml-1">{tenant?.name}</Badge>.
          {" "}{t("whatsapp.requiresNote")}
          <Button asChild variant="link" size="sm" className="px-1 h-auto text-xs">
            <a href="https://console.twilio.com" target="_blank" rel="noreferrer noopener">Twilio Console <ExternalLink className="ml-1 inline h-3 w-3" aria-hidden="true" /><span className="sr-only"> ({t("whatsapp.newTab")})</span></a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}