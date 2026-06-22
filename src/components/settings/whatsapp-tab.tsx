import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageCircle, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function WhatsAppTab() {
  const { tenant } = useAuth();
  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/public/whatsapp/inbound`
    : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-emerald-500" /> Portal do cliente via WhatsApp</CardTitle>
        <CardDescription>Seus clientes podem consultar e abrir tickets enviando mensagem para o seu número Twilio WhatsApp.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/30 p-4 space-y-2 text-sm">
          <p className="font-semibold">Comandos suportados:</p>
          <ul className="list-disc pl-5 text-muted-foreground space-y-1">
            <li><code>menu</code> — mostra opções</li>
            <li><code>tickets</code> — últimos 5 abertos</li>
            <li><code>TKT-00012</code> — detalhes do ticket</li>
            <li><code>novo &lt;título&gt;</code> — abre um ticket</li>
            <li><code>comentar TKT-00012 &lt;texto&gt;</code> — adiciona comentário</li>
          </ul>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Webhook do Twilio</p>
          <p className="text-xs text-muted-foreground">Cole esta URL em <em>Messaging → Sandbox/Sender → A MESSAGE COMES IN</em>, método POST:</p>
          <code className="block break-all rounded bg-muted px-3 py-2 text-xs">{webhookUrl}</code>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Vincular contatos</p>
          <p className="text-xs text-muted-foreground">
            Cada contato do cliente precisa ter o telefone em formato E.164 (+55…) e o opt-in WhatsApp marcado para receber notificações.
            Edite contatos em <em>Clientes → contato → editar</em>.
          </p>
        </div>

        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-600 dark:text-amber-400">
          Requer conexão Twilio configurada para sua empresa <Badge variant="outline" className="ml-1">{tenant?.name}</Badge>.
          {" "}Sem isso, o webhook recebe mensagens mas não consegue responder.
          <Button asChild variant="link" size="sm" className="px-1 h-auto text-xs">
            <a href="https://console.twilio.com" target="_blank" rel="noreferrer">Twilio Console <ExternalLink className="ml-1 inline h-3 w-3" /></a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}