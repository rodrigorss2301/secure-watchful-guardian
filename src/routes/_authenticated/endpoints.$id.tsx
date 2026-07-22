import { createFileRoute, Link } from '@tanstack/react-router'
import { 
  ArrowLeft, Monitor, Power, RefreshCw, Edit, Trash2, ShieldCheck, 
  Cpu, HardDrive, Clock, Activity, Lock, Database, Server, Shield, 
  AppWindow, Settings, List, FileText, History, Wrench, AlertTriangle, 
  CheckCircle, Info, Play, Square
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

// Módulos funcionais externos (certifique-se de que existem em src/components/endpoints/)
import { EndpointTerminal } from '@/components/endpoints/endpoint-terminal'
import { EndpointProcesses } from '@/components/endpoints/endpoint-processes'
import { EndpointScripts } from '@/components/endpoints/endpoint-scripts'

export const Route = createFileRoute('/_authenticated/endpoints/$id')({
  component: EndpointDetails,
})

function EndpointDetails() {
  const { id } = Route.useParams()

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      
      {/* ================= HEADER & AÇÕES ================= */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <Link to="/endpoints" className="flex items-center text-sm text-muted-foreground hover:text-primary transition-colors mb-2">
            <ArrowLeft className="w-4 h-4 mr-1" /> Endpoints
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
              <Monitor className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Totem</h1>
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-none font-medium px-2.5 py-0.5 rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2 animate-pulse"></span> ONLINE
            </Badge>
            <Badge variant="secondary" className="font-normal rounded-lg bg-muted text-muted-foreground">WORKSTATION</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1 flex items-center">
            Policlínica São Francisco de Paula <span className="mx-2 text-border">•</span> 1m
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button className="rounded-xl"><Monitor className="w-4 h-4 mr-2" /> Acesso remoto</Button>
          <Button variant="outline" className="rounded-xl"><Power className="w-4 h-4 mr-2" /> Energia</Button>
          <Button variant="outline" className="rounded-xl"><RefreshCw className="w-4 h-4 mr-2" /> Atualizar</Button>
          <Button variant="outline" className="rounded-xl"><Edit className="w-4 h-4 mr-2" /> Editar</Button>
          <Button variant="ghost" size="icon" className="rounded-xl text-destructive hover:bg-destructive/10">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* ================= STATUS GERAL ================= */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card shadow-sm">
        <div className="flex gap-2">
          <Badge variant="outline" className="border-destructive/20 text-destructive bg-destructive/10 px-3 py-1 rounded-lg font-medium">CRÍTICO 0</Badge>
          <Badge variant="outline" className="border-amber-500/20 text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-1 rounded-lg font-medium">AVISO 0</Badge>
          <Badge variant="outline" className="border-blue-500/20 text-blue-600 dark:text-blue-400 bg-blue-500/10 px-3 py-1 rounded-lg font-medium">INFORMAÇÃO 0</Badge>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="text-muted-foreground bg-muted/50 rounded-lg">SISTEMA OPERACIONAL 1</Badge>
          <Badge variant="secondary" className="text-muted-foreground bg-muted/50 rounded-lg">SOFTWARE 12</Badge>
        </div>
      </div>

      {/* ================= NAVEGAÇÃO ================= */}
      <Tabs defaultValue="visao-geral" className="w-full">
        <TabsList className="mb-4 inline-flex h-auto flex-wrap items-center justify-start rounded-xl bg-card border border-border p-1 text-muted-foreground w-full lg:w-auto shadow-sm gap-1">
          <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
          <TabsTrigger value="hardware">Hardware</TabsTrigger>
          <TabsTrigger value="discos">Discos</TabsTrigger>
          <TabsTrigger value="so-seguranca">SO e Segurança</TabsTrigger>
          <TabsTrigger value="software">Software</TabsTrigger>
          <TabsTrigger value="processos">Processos</TabsTrigger>
          <TabsTrigger value="servicos">Serviços</TabsTrigger>
          <TabsTrigger value="eventos">Eventos</TabsTrigger>
          <TabsTrigger value="comandos">Comandos</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="manutencao">Manutenção</TabsTrigger>
          <TabsTrigger value="terminal" className="text-primary font-medium">Terminal Web</TabsTrigger>
          <TabsTrigger value="automacao" className="text-primary font-medium">Automação</TabsTrigger>
        </TabsList>

        {/* ================= CONTEÚDO DAS ABAS ================= */}
        
        {/* TAB 1: VISÃO GERAL */}
        <TabsContent value="visao-geral" className="space-y-6 mt-0">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Card className="xl:col-span-2 shadow-sm border-border">
              <CardContent className="p-6 md:p-8">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8 border-b border-border/60 pb-8">
                  <div>
                    <div className="flex justify-between text-sm mb-3">
                      <span className="text-muted-foreground flex items-center font-medium"><Cpu className="w-4 h-4 mr-2 text-primary"/> CPU</span>
                      <span className="font-mono font-medium text-foreground">18%</span>
                    </div>
                    <Progress value={18} className="h-2 bg-muted/50 [&>div]:bg-emerald-400" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-3">
                      <span className="text-muted-foreground flex items-center font-medium"><Database className="w-4 h-4 mr-2 text-primary"/> RAM</span>
                      <span className="font-mono font-medium text-foreground">51%</span>
                    </div>
                    <Progress value={51} className="h-2 bg-muted/50 [&>div]:bg-emerald-400" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-3">
                      <span className="text-muted-foreground flex items-center font-medium"><HardDrive className="w-4 h-4 mr-2 text-primary"/> Disco</span>
                      <span className="font-mono font-medium text-foreground">43%</span>
                    </div>
                    <Progress value={43} className="h-2 bg-muted/50 [&>div]:bg-emerald-400" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6 text-sm">
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium tracking-wide">HOSTNAME</p>
                    <p className="font-medium">DESKTOP-I15I8KK</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium tracking-wide">DOMÍNIO</p>
                    <p className="font-medium">WORKGROUP</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium tracking-wide flex items-center"><Clock className="w-3 h-3 mr-1"/> UPTIME</p>
                    <p className="font-medium">3h 4m</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium tracking-wide">SISTEMA OPERACIONAL</p>
                    <p className="font-medium leading-tight">Microsoft Windows 11 Pro<br/><span className="text-muted-foreground text-xs font-normal">10.0.26200</span></p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium tracking-wide">IP PRIVADO</p>
                    <p className="font-mono font-medium">10.4.1.132</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium tracking-wide">IP PÚBLICO</p>
                    <p className="font-mono font-medium">168.228.43.238</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-6">
              <Card className="shadow-sm border-border">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-base flex items-center font-semibold">
                      <ShieldCheck className="w-5 h-5 mr-2 text-emerald-500" /> Saúde do agente
                    </CardTitle>
                    <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground font-normal rounded-lg">canal stable</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-y-5 gap-x-4 text-sm">
                    <div className="space-y-1"><p className="text-muted-foreground text-[11px] font-medium tracking-wider">VERSÃO</p><p className="font-medium">1.5.2</p></div>
                    <div className="space-y-1"><p className="text-muted-foreground text-[11px] font-medium tracking-wider">LATÊNCIA</p><p className="font-medium text-emerald-500">12ms</p></div>
                    <div className="space-y-1"><p className="text-muted-foreground text-[11px] font-medium tracking-wider flex items-center"><Activity className="w-3 h-3 mr-1"/> CPU DO AGENTE</p><p className="font-medium text-muted-foreground">—</p></div>
                    <div className="space-y-1"><p className="text-muted-foreground text-[11px] font-medium tracking-wider flex items-center"><Database className="w-3 h-3 mr-1"/> RAM DO AGENTE</p><p className="font-medium text-muted-foreground">—</p></div>
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-border/50 mt-4 pt-4">
                    <Button size="sm" className="rounded-lg w-full">Stable</Button>
                    <Button size="sm" variant="outline" className="rounded-lg w-full">Beta</Button>
                  </div>
                </CardContent>
              </Card>

              {/* Card 2: Métricas Gráfico */}
              <Card className="shadow-sm border-border">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-base font-semibold">Métricas</CardTitle>
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Últimas 24H</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 text-xs font-medium mb-4">
                    <span className="flex items-center text-foreground"><div className="w-2 h-2 rounded-full bg-primary mr-1.5"></div> CPU 23%</span>
                    <span className="flex items-center text-muted-foreground"><div className="w-2 h-2 rounded-full bg-secondary-foreground mr-1.5"></div> RAM 52%</span>
                  </div>
                  <div className="w-full h-[140px] relative">
                    <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                      <line x1="0" y1="25" x2="100" y2="25" stroke="currentColor" strokeWidth="0.1" className="text-border" />
                      <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="0.1" className="text-border" />
                      <line x1="0" y1="75" x2="100" y2="75" stroke="currentColor" strokeWidth="0.1" className="text-border" />
                      <path d="M0,48 L20,49 L40,47 L60,48 L80,49 L100,48" fill="none" stroke="hsl(var(--secondary-foreground))" strokeWidth="1" opacity="0.3"/>
                      <path d="M0,100 L0,70 L5,80 L10,60 L15,90 L20,50 L25,85 L30,40 L35,75 L40,65 L45,30 L50,80 L55,45 L60,85 L65,55 L70,90 L75,20 L80,80 L85,60 L90,85 L95,40 L100,75 L100,100 Z" fill="hsl(var(--primary) / 0.1)"/>
                      <path d="M0,70 L5,80 L10,60 L15,90 L20,50 L25,85 L30,40 L35,75 L40,65 L45,30 L50,80 L55,45 L60,85 L65,55 L70,90 L75,20 L80,80 L85,60 L90,85 L95,40 L100,75" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5"/>
                    </svg>
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-2 font-mono">
                    <span>08:32</span>
                    <span>14:29</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: HARDWARE */}
        <TabsContent value="hardware" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="shadow-sm border-border">
              <CardHeader><CardTitle className="text-lg flex items-center"><Server className="w-5 h-5 mr-2 text-primary" /> Placa Mãe e BIOS</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex justify-between border-b border-border/50 pb-2"><span className="text-muted-foreground">Fabricante</span><span className="font-medium">ASUSTeK COMPUTER INC.</span></div>
                <div className="flex justify-between border-b border-border/50 pb-2"><span className="text-muted-foreground">Modelo</span><span className="font-medium">PRIME H410M-E</span></div>
                <div className="flex justify-between border-b border-border/50 pb-2"><span className="text-muted-foreground">Versão da BIOS</span><span className="font-medium">1605 (04/27/2021)</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Número de Série</span><span className="font-mono font-medium">M123456789</span></div>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-border">
              <CardHeader><CardTitle className="text-lg flex items-center"><Cpu className="w-5 h-5 mr-2 text-primary" /> Processador (CPU)</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex justify-between border-b border-border/50 pb-2"><span className="text-muted-foreground">Nome</span><span className="font-medium">Intel Core i5-10400F</span></div>
                <div className="flex justify-between border-b border-border/50 pb-2"><span className="text-muted-foreground">Cores / Threads</span><span className="font-medium">6 Cores / 12 Threads</span></div>
                <div className="flex justify-between border-b border-border/50 pb-2"><span className="text-muted-foreground">Clock Base</span><span className="font-medium">2.90 GHz</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Arquitetura</span><span className="font-medium">x64</span></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 3: DISCOS */}
        <TabsContent value="discos" className="mt-0">
          <Card className="shadow-sm border-border">
            <CardHeader><CardTitle className="text-lg flex items-center"><HardDrive className="w-5 h-5 mr-2 text-primary" /> Armazenamento</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 border border-border rounded-xl bg-muted/10">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-3">
                    <HardDrive className="w-8 h-8 text-muted-foreground" />
                    <div>
                      <h4 className="font-semibold">Disco Local (C:)</h4>
                      <p className="text-xs text-muted-foreground">KINGSTON SA400S37240G (SSD)</p>
                    </div>
                  </div>
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-none">Saudável</Badge>
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-2 font-medium">
                    <span>142 GB Usados</span>
                    <span className="text-muted-foreground">223 GB Total</span>
                  </div>
                  <Progress value={63} className="h-3" />
                  <p className="text-xs text-muted-foreground mt-2">81 GB Livres (37%)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: SO E SEGURANÇA */}
        <TabsContent value="so-seguranca" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="shadow-sm border-border">
              <CardContent className="p-6 flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2">
                  <ShieldCheck className="w-6 h-6 text-emerald-500" />
                </div>
                <h3 className="font-semibold text-lg">Antivírus</h3>
                <p className="text-sm text-muted-foreground">Windows Defender está ativo e atualizado.</p>
                <Badge variant="outline" className="mt-2 text-emerald-600 bg-emerald-500/10 border-none">Ativo</Badge>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-border">
              <CardContent className="p-6 flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2">
                  <Shield className="w-6 h-6 text-emerald-500" />
                </div>
                <h3 className="font-semibold text-lg">Firewall</h3>
                <p className="text-sm text-muted-foreground">Firewall do Windows ativado para redes públicas.</p>
                <Badge variant="outline" className="mt-2 text-emerald-600 bg-emerald-500/10 border-none">Ativado</Badge>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-border">
              <CardContent className="p-6 flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-2">
                  <Lock className="w-6 h-6 text-amber-500" />
                </div>
                <h3 className="font-semibold text-lg">Criptografia (BitLocker)</h3>
                <p className="text-sm text-muted-foreground">Criptografia de unidade não habilitada no volume C:.</p>
                <Badge variant="outline" className="mt-2 text-amber-600 bg-amber-500/10 border-none">Desativado</Badge>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 5: SOFTWARE (COM BUSCA E AÇÃO FUNCIONAL) */}
        <TabsContent value="software" className="mt-0">
          <Card className="shadow-sm border-border overflow-hidden">
            <div className="p-4 border-b border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-muted/20">
              <CardTitle className="text-lg flex items-center">
                <AppWindow className="w-5 h-5 mr-2 text-primary" /> Softwares Instalados
                <Badge variant="secondary" className="ml-3 bg-muted text-muted-foreground">12 itens</Badge>
              </CardTitle>
              <div className="relative w-full sm:w-72">
                <input 
                  type="text" 
                  placeholder="Buscar software..." 
                  className="w-full bg-background border border-border rounded-lg pl-3 pr-10 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 transition-shadow"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-medium border-b border-border">
                  <tr>
                    <th className="px-6 py-3">Nome do Aplicativo</th>
                    <th className="px-6 py-3">Fabricante</th>
                    <th className="px-6 py-3">Versão</th>
                    <th className="px-6 py-3">Data de Instalação</th>
                    <th className="px-6 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[
                    { name: "Google Chrome", vendor: "Google LLC", ver: "126.0.6478.127", date: "10/06/2026" },
                    { name: "Microsoft Office 365", vendor: "Microsoft Corporation", ver: "16.0.14326.20404", date: "12/01/2026" },
                    { name: "AnyDesk", vendor: "AnyDesk Software GmbH", ver: "8.0.8", date: "15/05/2026" },
                    { name: "7-Zip", vendor: "Igor Pavlov", ver: "23.01", date: "12/01/2026" },
                    { name: "Adobe Acrobat Reader DC", vendor: "Adobe Systems Inc.", ver: "24.002.20759", date: "12/01/2026" },
                    { name: "Visual Studio Code", vendor: "Microsoft Corporation", ver: "1.90.2", date: "20/06/2026" },
                    { name: "Node.js", vendor: "OpenJS Foundation", ver: "20.14.0", date: "20/06/2026" },
                    { name: "ESET Endpoint Security", vendor: "ESET, spol. s r.o.", ver: "11.0.2032.0", date: "12/01/2026" },
                    { name: "Docker Desktop", vendor: "Docker Inc.", ver: "4.31.1", date: "21/06/2026" },
                    { name: "VLC media player", vendor: "VideoLAN", ver: "3.0.21", date: "05/03/2026" },
                    { name: "Mozilla Firefox", vendor: "Mozilla Corporation", ver: "127.0.2", date: "02/07/2026" },
                    { name: "Notepad++", vendor: "Don Ho", ver: "8.6.8", date: "10/06/2026" }
                  ].map((app, idx) => (
                    <tr key={idx} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{app.name}</td>
                      <td className="px-6 py-4 text-muted-foreground">{app.vendor}</td>
                      <td className="px-6 py-4 text-muted-foreground">{app.ver}</td>
                      <td className="px-6 py-4 text-muted-foreground">{app.date}</td>
                      <td className="px-6 py-4 text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => {
                            // Dispara um alerta visual estilo Sonner informando o envio do comando
                            if (window.confirm(`Deseja enviar comando de desinstalação para o aplicativo: ${app.name}?`)) {
                              console.log(`Desinstalando ${app.name}...`);
                            }
                          }}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 px-2 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4 mr-1.5"/> Desinstalar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 6: SERVIÇOS */}
        <TabsContent value="servicos" className="mt-0">
          <Card className="shadow-sm border-border overflow-hidden">
             <div className="p-4 border-b border-border flex justify-between items-center bg-muted/20">
              <CardTitle className="text-lg flex items-center"><Settings className="w-5 h-5 mr-2 text-primary" /> Serviços do Windows</CardTitle>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-medium border-b border-border">
                  <tr>
                    <th className="px-6 py-3">Nome</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Inicialização</th>
                    <th className="px-6 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr className="hover:bg-muted/30">
                    <td className="px-6 py-4 font-medium">Spooler de Impressão (Spooler)</td>
                    <td className="px-6 py-4"><Badge className="bg-emerald-500/10 text-emerald-600 border-none">Em Execução</Badge></td>
                    <td className="px-6 py-4 text-muted-foreground">Automático</td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="outline" size="sm" className="h-8"><Square className="w-3 h-3 mr-2"/> Parar</Button>
                    </td>
                  </tr>
                  <tr className="hover:bg-muted/30">
                    <td className="px-6 py-4 font-medium">Windows Update (wuauserv)</td>
                    <td className="px-6 py-4"><Badge variant="secondary" className="bg-muted text-muted-foreground border-none">Parado</Badge></td>
                    <td className="px-6 py-4 text-muted-foreground">Manual</td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="outline" size="sm" className="h-8"><Play className="w-3 h-3 mr-2"/> Iniciar</Button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 7: EVENTOS */}
        <TabsContent value="eventos" className="mt-0">
          <Card className="shadow-sm border-border">
            <CardHeader><CardTitle className="text-lg flex items-center"><List className="w-5 h-5 mr-2 text-primary" /> Visualizador de Eventos (Últimas 24h)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-4 p-4 rounded-lg border border-l-4 border-l-destructive bg-muted/10">
                <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
                <div>
                  <h4 className="font-semibold text-sm">Erro Crítico - Event ID 41 (Kernel-Power)</h4>
                  <p className="text-xs text-muted-foreground mt-1">O sistema foi reiniciado sem um desligamento limpo primeiro. 22/07/2026 05:25:30</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-4 rounded-lg border border-l-4 border-l-amber-500 bg-muted/10">
                <Info className="w-5 h-5 text-amber-500 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-sm">Aviso - Event ID 10016 (DistributedCOM)</h4>
                  <p className="text-xs text-muted-foreground mt-1">As configurações de permissão não concedem permissão Local para o aplicativo COM. 22/07/2026 08:15:00</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-4 rounded-lg border border-l-4 border-l-blue-500 bg-muted/10">
                <CheckCircle className="w-5 h-5 text-blue-500 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-sm">Informação - Event ID 7036 (Service Control Manager)</h4>
                  <p className="text-xs text-muted-foreground mt-1">O serviço Windows Update entrou no estado interrompido. 22/07/2026 09:30:12</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 8: COMANDOS */}
        <TabsContent value="comandos" className="mt-0">
          <Card className="shadow-sm border-border overflow-hidden">
             <div className="p-4 border-b border-border bg-muted/20">
              <CardTitle className="text-lg flex items-center"><FileText className="w-5 h-5 mr-2 text-primary" /> Log de Comandos RMM</CardTitle>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-medium border-b border-border">
                  <tr>
                    <th className="px-6 py-3">Data/Hora</th>
                    <th className="px-6 py-3">Comando Executado</th>
                    <th className="px-6 py-3">Operador</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr className="hover:bg-muted/30">
                    <td className="px-6 py-4 text-muted-foreground">22/07/2026 10:15</td>
                    <td className="px-6 py-4 font-mono text-xs">ipconfig /flushdns</td>
                    <td className="px-6 py-4 font-medium">rodrigo.sabadim</td>
                    <td className="px-6 py-4"><Badge className="bg-emerald-500/10 text-emerald-600 border-none shadow-none">Sucesso</Badge></td>
                  </tr>
                  <tr className="hover:bg-muted/30">
                    <td className="px-6 py-4 text-muted-foreground">21/07/2026 16:40</td>
                    <td className="px-6 py-4 font-mono text-xs">Restart-Service -Name Spooler</td>
                    <td className="px-6 py-4 font-medium">rodrigo.sabadim</td>
                    <td className="px-6 py-4"><Badge className="bg-emerald-500/10 text-emerald-600 border-none shadow-none">Sucesso</Badge></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 9: HISTÓRICO */}
        <TabsContent value="historico" className="mt-0">
          <Card className="shadow-sm border-border">
            <CardHeader><CardTitle className="text-lg flex items-center"><History className="w-5 h-5 mr-2 text-primary" /> Auditoria do Endpoint</CardTitle></CardHeader>
            <CardContent>
               <div className="relative border-l border-border ml-3 space-y-6">
                <div className="pl-6 relative">
                  <div className="w-3 h-3 bg-primary rounded-full absolute -left-[6.5px] top-1.5 ring-4 ring-background"></div>
                  <p className="text-sm font-semibold">Agente Atualizado</p>
                  <p className="text-xs text-muted-foreground mt-1">O agente Autotechs foi atualizado da versão 1.5.1 para 1.5.2 via OTA.</p>
                  <p className="text-[10px] text-muted-foreground mt-2 font-mono">19/07/2026 02:00</p>
                </div>
                <div className="pl-6 relative">
                  <div className="w-3 h-3 bg-border rounded-full absolute -left-[6.5px] top-1.5 ring-4 ring-background"></div>
                  <p className="text-sm font-semibold">Alerta Resolvido: CPU Alta</p>
                  <p className="text-xs text-muted-foreground mt-1">O uso de CPU normalizou (abaixo de 90%) após 15 minutos.</p>
                  <p className="text-[10px] text-muted-foreground mt-2 font-mono">18/07/2026 14:45</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 10: MANUTENÇÃO */}
        <TabsContent value="manutencao" className="mt-0">
          <Card className="shadow-sm border-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center"><Wrench className="w-5 h-5 mr-2 text-primary" /> Modo de Manutenção</CardTitle>
              <CardDescription>Suspende a geração de alertas para este endpoint enquanto trabalhos técnicos são realizados.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 border border-border rounded-xl bg-muted/10">
                <div>
                  <h4 className="font-semibold text-sm">Habilitar Modo de Manutenção</h4>
                  <p className="text-xs text-muted-foreground mt-1">Alertas serão silenciados até que a manutenção seja desativada.</p>
                </div>
                <Button variant="outline" className="rounded-xl">Ativar Manutenção</Button>
              </div>
              <div className="flex items-center justify-between p-4 border border-border rounded-xl bg-muted/10">
                <div>
                  <h4 className="font-semibold text-sm">Agendar Reinicialização</h4>
                  <p className="text-xs text-muted-foreground mt-1">Força o reinício do sistema operacional em um horário específico.</p>
                </div>
                <Button variant="outline" className="rounded-xl">Configurar Horário</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 11: PROCESSOS */}
        <TabsContent value="processos" className="mt-0">
          <EndpointProcesses endpointId={id} />
        </TabsContent>

        {/* TAB 12: TERMINAL */}
        <TabsContent value="terminal" className="mt-0">
          <EndpointTerminal endpointId={id} />
        </TabsContent>

        {/* TAB 13: AUTOMAÇÃO */}
        <TabsContent value="automacao" className="mt-0">
          <EndpointScripts endpointId={id} />
        </TabsContent>

      </Tabs>
    </div>
  )
}