# Plano — 3 frentes (1 completo + 3 parcial + 4 WhatsApp)

Vou entregar em **3 PRs lógicos** dentro do projeto (mesmo branch, commits separados). Estimo 1 entrega grande.

---

## Frente A — Monitoramento de endpoints (item 1 completo)

### A1. Mapa de saúde da frota (heatmap no dashboard)
- Novo card no `dashboard.tsx`: grid colorido (online=verde, warning=âmbar, critical=vermelho, offline=cinza) agrupado por cliente.
- Hover: hostname + último heartbeat. Click: abre endpoint.
- Fonte: `endpoints` (já existe).

### A2. Latência/RTT
- Agente (PowerShell `public/agent/install.ps1` + heartbeat) envia `gateway_rtt_ms` no heartbeat.
- Coluna nova em `endpoint_metric_samples`: `gateway_rtt_ms numeric`.
- Edge route `api/public/agent/heartbeat.ts` aceita o campo.
- Gráfico no `history-tab.tsx` (linha extra sobreposta ao uptime).

### A3. Top N quedas / downtime (widget)
- Query agregada em `endpoint_outages` últimos 7d → componente no dashboard com top 10 por nº de quedas e por minutos offline.

### A4. Detecção de anomalia simples
- Função SQL `detect_metric_anomalies()`: média móvel 24h + 2σ em cpu/ram/disk por endpoint, gera `alerts` com severity=warning.
- Agendar via `run_scheduled_automations` ou novo cron (executar a cada 15 min — via pg_cron se disponível, senão botão "Run now" em settings).

### A5. Histórico de software instalado (frota)
- Nova página `_authenticated/inventory.software.tsx` listando `endpoint_inventory_history` onde `category='software'` com filtros: cliente, ação (added/removed), período. Já existe a tabela; só falta UI.

### A6. Patch status
- Campo `os_last_update_at timestamptz` e `pending_updates jsonb` em `endpoints`.
- Heartbeat passa a aceitar. UI: badge no detalhe do endpoint + coluna opcional na lista.

---

## Frente B — Alertas & automações (item 3, partes pedidas)

### B1. Canais de notificação
- Nova tabela `notification_channels`: `{id, tenant_id, kind, name, config jsonb, enabled}` onde `kind ∈ ('email','webhook','slack','teams','whatsapp')`.
- UI em `settings.tsx` aba "Canais": CRUD + teste.
- `alert_rules` ganha `channel_ids uuid[]`.
- Edge function `alert-dispatch` consome novos alertas (trigger AFTER INSERT em `alerts`) e envia pelos canais (e-mail via Resend já-conectado se existir; webhook genérico; Slack/Teams via webhook URL; WhatsApp via Twilio gateway).

### B2. Biblioteca de automações prontas
- Seed migration insere ~8 automações de exemplo (script, marcadas `is_template=true`, sem `scope` ativo):
  - Limpar `%TEMP%` (Windows)
  - Reiniciar serviço (param)
  - `Get-WindowsUpdate -Install` (PSWindowsUpdate)
  - Coletar últimas 200 linhas de Event Viewer (System/Application)
  - Flush DNS
  - Reiniciar Spooler
  - Limpar lixeira de todos os usuários
  - Forçar `gpupdate /force`
- Coluna nova `automations.is_template boolean default false`.
- Botão "Da biblioteca" no `automations.tsx`: lista templates e cria cópia editável no tenant.

### B3. Aprovação humana para destrutivas
- Coluna `automations.requires_approval boolean default false`.
- Nova tabela `automation_approvals {id, tenant_id, automation_id, requested_by, approved_by, status('pending'|'approved'|'rejected'), reason, created_at, decided_at}`.
- Quando `requires_approval=true`, `run_automation()` em vez de executar, cria `automation_approvals` pending e marca run como `queued` esperando aprovação.
- UI: aba "Aprovações" em automations; admin aprova → dispara execução real.

---

## Frente C — Portal do cliente via WhatsApp (item 4)

Fluxo: cliente envia mensagem no WhatsApp → bot responde com status dos tickets dele e aceita comandos simples.

### C1. Vincular telefone ao contato
- `client_contacts` já tem `phone`. Adicionar `whatsapp_opt_in boolean default false` e índice em `phone`.

### C2. Inbound do WhatsApp
- Endpoint público `src/routes/api/public/whatsapp/inbound.ts` recebe webhook do Twilio WhatsApp.
- Verifica assinatura `X-Twilio-Signature`.
- Resolve `From` (E.164) → `client_contacts.phone` → `client_id`.
- Comandos suportados (texto livre + parsing simples):
  - `oi`, `menu` → menu
  - `tickets` → lista últimos 5 abertos com número + título + status
  - `ticket TKT-00012` ou só `TKT-00012` → detalhes + últimos 2 comentários públicos
  - `novo <título>` → cria ticket com priority=medium, category=null, description="Aberto via WhatsApp"
  - `comentar TKT-00012 <texto>` → adiciona comentário público
  - qualquer outra coisa → fallback menu
- Resposta via Twilio (gateway connector) ao `From`.

### C3. Outbound (notificações)
- Quando ticket muda de status ou recebe comentário público (trigger), enfileira mensagem WhatsApp se o contato principal do client tem `whatsapp_opt_in=true`.
- Tabela `whatsapp_messages {id, tenant_id, direction, from, to, body, ticket_id?, status, created_at}` (log + para reprocessar).
- Worker simples: edge function chamada por trigger ou por novo registro `direction=outbound, status=pending`.

### C4. Configuração
- Pede conectar Twilio (connector já documentado) — se não conectado, mostra aviso em settings.
- Em `settings.tsx` aba "WhatsApp": número Twilio (`from`), toggle "Notificações para clientes", botão de teste.

---

## Detalhes técnicos consolidados

**Migrations (uma só, transacional):**
1. `endpoint_metric_samples.gateway_rtt_ms numeric`
2. `endpoints.os_last_update_at`, `endpoints.pending_updates`
3. `notification_channels` + grants + RLS por tenant
4. `alert_rules.channel_ids uuid[]`
5. `automations.is_template`, `automations.requires_approval`
6. `automation_approvals` + grants + RLS
7. `client_contacts.whatsapp_opt_in`
8. `whatsapp_messages` + grants + RLS (apenas admin/technician leem)
9. Seed templates de automação
10. Função `detect_metric_anomalies()`

**Edge / server fns:**
- `api/public/agent/heartbeat.ts` — aceitar novos campos
- `api/public/whatsapp/inbound.ts` — webhook
- `lib/notifications.functions.ts` — `dispatchAlert`, `sendWhatsApp`
- `lib/approvals.functions.ts` — `approveAutomation`, `rejectAutomation`

**UI nova:**
- `components/dashboard/fleet-heatmap.tsx`
- `components/dashboard/top-outages.tsx`
- `routes/_authenticated/inventory.software.tsx`
- `components/settings/channels-tab.tsx`
- `components/settings/whatsapp-tab.tsx`
- `components/automations/library-dialog.tsx`
- `components/automations/approvals-tab.tsx`

**Conector externo necessário:** Twilio (para WhatsApp). Eu peço o conector no momento certo.

**O que NÃO entra agora** (para não inchar):
- Slack/Teams já como integrações nativas (vai como webhook genérico)
- App mobile do cliente
- Pagamento via WhatsApp
- Voz/IVR

Confirma que posso seguir nesse escopo? Se quiser que eu corte alguma sub-tarefa (ex: deixar Patch status A6 para depois), me diga antes de eu começar.
