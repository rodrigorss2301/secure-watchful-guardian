import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Check, X } from "lucide-react";
import { toast } from "sonner";

// Exemplo de solicitação vinda do agente
interface RequestItem {
  id: string;
  endpointName: string;
  softwareName: string;
  requestedAt: string;
}

export function ApprovalRequests() {
  const [requests, setRequests] = useState<RequestItem[]>([
    { id: "1", endpointName: "DESKTOP-I15I8KK", softwareName: "AnyDesk_Installer.exe", requestedAt: "Agora mesmo" }
  ]);

  const handleDecision = (id: string, software: string, approved: boolean) => {
    if (approved) {
      toast.success(`Instalação de "${software}" autorizada com sucesso!`);
    } else {
      toast.error(`Instalação de "${software}" bloqueada pelo administrador.`);
    }
    // Remove da lista local (em produção, atualiza o status no Supabase)
    setRequests(requests.filter(r => r.id !== id));
  };

  if (requests.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 w-96 animate-in slide-in-from-bottom-5">
      {requests.map((req) => (
        <Card key={req.id} className="border-border bg-card shadow-lg border-l-4 border-l-amber-500">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-500 animate-pulse" />
                <CardTitle className="text-sm font-semibold">Tentativa de Instalação</CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px]">{req.requestedAt}</Badge>
            </div>
            <CardDescription className="text-xs mt-1">
              O endpoint <span className="font-mono font-medium text-foreground">{req.endpointName}</span> tentou executar:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-2 bg-muted/50 rounded-lg font-mono text-xs text-foreground font-medium">
              {req.softwareName}
            </div>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant="outline" 
                className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => handleDecision(req.id, req.softwareName, false)}
              >
                <X className="w-4 h-4 mr-1" /> Bloquear
              </Button>
              <Button 
                size="sm" 
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => handleDecision(req.id, req.softwareName, true)}
              >
                <Check className="w-4 h-4 mr-1" /> Autorizar
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}