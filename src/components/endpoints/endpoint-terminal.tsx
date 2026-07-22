import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Terminal, Send } from "lucide-react";

export function EndpointTerminal({ endpointId }: { endpointId: string }) {
  const [logs, setLogs] = useState<string[]>(["Conectado ao terminal silencioso do endpoint..."]);
  const [command, setCommand] = useState("");
  const endOfTerminalRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para o final do terminal
  useEffect(() => {
    endOfTerminalRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleExecute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;

    // Adiciona o comando na tela
    setLogs((prev) => [...prev, `PS C:\\Windows\\System32> ${command}`]);
    
    // TODO: Aqui entra a chamada para o Supabase (ex: supabase.channel('endpoint-id').send({ type: 'broadcast', event: 'cmd', payload: { command } }))
    
    // Simulando resposta do agente
    setTimeout(() => {
      setLogs((prev) => [...prev, `Comando '${command}' executado com sucesso.`]);
    }, 1000);

    setCommand("");
  };

  return (
    <div className="flex flex-col h-[500px] rounded-xl border border-border/50 bg-black overflow-hidden shadow-sm">
      <div className="flex items-center px-4 py-2 bg-muted/80 border-b border-border/50 text-muted-foreground text-xs font-mono">
        <Terminal className="w-4 h-4 mr-2" />
        Sessão PowerShell em Background
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 font-mono text-sm text-green-400 bg-black">
        {logs.map((log, index) => (
          <div key={index} className="mb-1">{log}</div>
        ))}
        <div ref={endOfTerminalRef} />
      </div>

      <form onSubmit={handleExecute} className="flex items-center p-2 bg-muted/20 border-t border-border/50">
        <span className="text-green-500 font-mono text-sm ml-2 mr-2">PS&gt;</span>
        <Input 
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Digite um comando..." 
          className="flex-1 bg-transparent border-none text-green-400 font-mono focus-visible:ring-0 placeholder:text-green-800"
          autoComplete="off"
        />
        <Button type="submit" size="icon" variant="ghost" className="text-green-500 hover:text-green-400 hover:bg-green-950">
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}