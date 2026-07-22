import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Play, Code, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const scripts = [
  { id: 1, name: "Limpar Arquivos Temporários", type: "Batch", desc: "Remove %temp% e prefetch." },
  { id: 2, name: "Reiniciar Spooler", type: "PowerShell", desc: "Resolve problemas de fila de impressão presa." },
  { id: 3, name: "Flush DNS e Renew IP", type: "Batch", desc: "Redefine conexões de rede locais." }
];

export function EndpointScripts({ endpointId }: { endpointId: string }) {
  const [runningId, setRunningId] = useState<number | null>(null);

  const executeScript = (id: number, name: string) => {
    setRunningId(id);
    toast.info(`Executando script: ${name}...`);
    
    // TODO: Inserir log na tabela de auditoria e mandar trigger via Supabase
    setTimeout(() => {
      setRunningId(null);
      toast.success(`Script "${name}" finalizado com sucesso!`);
    }, 2000);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {scripts.map((script) => (
        <Card key={script.id} className="border-border/50">
          <CardHeader className="pb-3">
            <div className="flex justify-between items-start">
              <div className="p-2 bg-primary/10 text-primary rounded-lg">
                <Code className="w-5 h-5" />
              </div>
              <span className="text-xs font-mono bg-muted px-2 py-1 rounded-md text-muted-foreground">
                {script.type}
              </span>
            </div>
            <CardTitle className="text-base mt-3">{script.name}</CardTitle>
            <CardDescription className="text-xs">{script.desc}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              className="w-full shadow-none" 
              variant={runningId === script.id ? "secondary" : "default"}
              onClick={() => executeScript(script.id, script.name)}
              disabled={runningId !== null}
            >
              {runningId === script.id ? (
                <>Processando...</>
              ) : (
                <><Play className="w-4 h-4 mr-2" /> Executar Agora</>
              )}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}