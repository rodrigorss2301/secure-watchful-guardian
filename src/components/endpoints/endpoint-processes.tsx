import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skull, RefreshCw } from "lucide-react";
import { toast } from "sonner";

// Dados simulados vindos do agente
const initialProcesses = [
  { pid: 1452, name: "chrome.exe", cpu: "12%", ram: "450 MB" },
  { pid: 8932, name: "spoolsv.exe", cpu: "0%", ram: "12 MB" },
  { pid: 1024, name: "explorer.exe", cpu: "1%", ram: "120 MB" },
];

export function EndpointProcesses({ endpointId }: { endpointId: string }) {
  const [processes, setProcesses] = useState(initialProcesses);

  const killProcess = (pid: number, name: string) => {
    // TODO: Disparar evento para o agente no Supabase matar o PID
    toast.success(`Sinal enviado para encerrar o processo ${name} (PID: ${pid})`);
    
    // Atualização otimista na tela
    setProcesses(processes.filter(p => p.pid !== pid));
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card">
      <div className="flex justify-between items-center p-4 border-b border-border/50">
        <h3 className="font-semibold text-lg">Processos Ativos</h3>
        <Button variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>PID</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>CPU</TableHead>
            <TableHead>RAM</TableHead>
            <TableHead className="text-right">Ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {processes.map((proc) => (
            <TableRow key={proc.pid}>
              <TableCell className="font-mono text-muted-foreground">{proc.pid}</TableCell>
              <TableCell className="font-medium">{proc.name}</TableCell>
              <TableCell>{proc.cpu}</TableCell>
              <TableCell>{proc.ram}</TableCell>
              <TableCell className="text-right">
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={() => killProcess(proc.pid, proc.name)}
                  className="h-8 text-xs"
                >
                  <Skull className="w-3 h-3 mr-1" /> Matar
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}