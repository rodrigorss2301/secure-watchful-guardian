## Item 6 — Agente (instalação & operação) — completo

Vou entregar as 5 sub-tarefas pedidas em 3 frentes (banco → backend → agente PowerShell → UI).

---

### 6.1 Auto-update com canais `stable` / `beta`

**Banco**
- `agent_releases (id, channel enum stable|beta, version, script_url, sha256, released_at, notes)` — tabela global, leitura aberta (SELECT TO anon) só do release mais recente por canal.
- `endpoints.update_channel` (`stable` default) + `endpoints.agent_last_update_at`.
- Função `get_latest_agent_release(_channel)` SECURITY DEFINER.

**Backend (heartbeat)**
- Resposta passa a incluir `latest_agent: { version, channel, script_url, sha256 }` do canal do endpoint.

**Agente (`install.ps1`)**
- Ao receber heartbeat, se `latest_agent.version > $AgentVersion`: baixa o novo script, valida SHA-256, escreve em `agent.ps1`, log "self-update ok", próxima execução já roda a nova versão (tarefa agendada relê o arquivo).
- Fallback: se SHA não bate, mantém versão atual.

**UI**
- Aba `Endpoints → detalhe` mostra canal (badge) e botão "Mudar para beta/stable".
- `settings.tsx` nova seção "Agente" lista releases atuais por canal e permite admin publicar novo release (apenas metadados — script segue em `/public/agent/install.ps1` por enquanto, mas suporta `script_url` externo).

---

### 6.2 Comandos remotos com log assinado e timeout

**Banco**
- `endpoint_commands` ganha: `timeout_seconds INT DEFAULT 300`, `signature TEXT` (HMAC do payload), `signed_at TIMESTAMPTZ`, `expires_at TIMESTAMPTZ`, `attempted_at`, `failed_reason`.
- Trigger `BEFORE INSERT`: assina (`HMAC-SHA256(tenant_secret, id||command||params||timeout)`) usando uma chave por tenant (`tenants.command_signing_key` — gerada no signup).
- `endpoint_command_logs (id, command_id, level, message, created_at)` para log estruturado de execução.

**Backend**
- Heartbeat retorna `signature` + `expires_at` junto de cada comando pendente.
- Novo endpoint `POST /api/public/agent/command-log` aceita lotes de linhas de log + verifica `agent_token`.
- `command-result.ts` rejeita resultados depois de `expires_at`.

**Agente**
- Verifica HMAC antes de executar (calcula localmente com a chave gravada em `config.json` no enroll — backend passa a devolver `command_signing_key`).
- Wrappa execução em `Start-Job` com `Wait-Job -Timeout $timeout_seconds`; mata o job se estourar e devolve `status=timeout`.
- Captura `stdout`/`stderr` linha a linha e envia para `command-log`.

**UI**
- `endpoints.$id.tsx` → aba "Comandos" mostra histórico com timeline de logs (expand), status (succeeded/failed/timeout/expired) e timeout configurável no formulário "Enviar comando".

---

### 6.3 Coleta de eventos críticos (Event Viewer / journald)

**Banco**
- `endpoint_events (id, tenant_id, endpoint_id, source, level enum info|warning|error|critical, event_id, provider, message, occurred_at, raw JSONB)` — RLS por tenant.
- Retenção 30 dias via `cleanup_endpoint_history()` existente.

**Backend**
- Heartbeat aceita `events: [{source, level, event_id, provider, message, occurred_at}]` (máx 50 por POST). Insere em lote.

**Agente**
- Após heartbeat, lê `Get-WinEvent -FilterHashtable @{LogName='System','Application'; Level=1,2; StartTime=$lastEventTs}` (Level 1=Critical, 2=Error), limita 50 por ciclo, guarda `lastEventTs` em `config.json`.

**UI**
- Nova aba `endpoints.$id.tsx → "Eventos"` com filtro por level, busca por provider/mensagem, paginação.
- Card no dashboard "Eventos críticos (24h)" com Top 10.

---

### 6.4 Modo offline (buffer + reenvio)

**Agente** (só agente — sem mudança de schema)
- Se heartbeat falha (timeout/HTTP erro), serializa o payload em `C:\ProgramData\AutotechsRMM\queue\<timestamp>.json` (limite 500 arquivos / 50 MB; descarta os mais antigos).
- A cada ciclo, antes do heartbeat novo, tenta reenviar a fila em ordem (máx 20 por ciclo). Sucesso → apaga arquivo. Falha → para e segue.
- Métricas e eventos enfileirados preservam `sampled_at` / `occurred_at` originais.

**Backend (heartbeat)**
- Já aceita `sampled_at` opcional em `endpoint_metric_samples`? — adiciono coluna `sampled_at` no insert atual + campo opcional `metrics_batch: [{sampled_at, cpu, ram, disk, rtt}]` no body do heartbeat para drenar buffer em lote.

---

### 6.5 Health-check do próprio agente

**Banco**
- `endpoints` ganha: `agent_cpu_pct NUMERIC`, `agent_ram_mb INT`, `agent_last_error TEXT`, `agent_last_error_at TIMESTAMPTZ`, `agent_heartbeat_duration_ms INT`, `agent_queue_size INT`.

**Backend**
- Heartbeat aceita os 6 campos acima (opcionais) e grava na linha do endpoint.

**Agente**
- Mede tempo da chamada de heartbeat, lê o próprio processo (`Get-Process -Id $PID`) → CPU%/RAM MB, conta arquivos em `queue/`, registra `agent_last_error` quando algo falha (trecho do `Write-Log` do último ciclo).

**UI**
- `endpoints.$id.tsx → "Visão geral"`: card "Agente" com versão, canal, último erro, CPU/RAM do agente, latência média do heartbeat, tamanho da fila offline. Badge vermelho se erro nas últimas 2h ou fila > 50.

---

### Arquivos a criar/alterar (resumo)

- **Migrations (1 grande)**: `agent_releases`, `endpoints` (8 colunas novas), `endpoint_commands` (5 colunas), `endpoint_command_logs`, `endpoint_events`, `tenants.command_signing_key`, função `get_latest_agent_release`, trigger de assinatura, ajuste em `cleanup_endpoint_history()`.
- **Rotas**: edita `heartbeat.ts`, `command-result.ts`, cria `command-log.ts`, edita `enroll.ts` (devolver `command_signing_key` + canal).
- **Agente**: `public/agent/install.ps1` (++300 linhas: self-update, HMAC, timeout/jobs, eventos, fila offline, self-health). `LATEST_AGENT_VERSION` vira `1.6.0` em `src/lib/agent-version.ts`.
- **UI**: `endpoints.$id.tsx` (+ tabs Eventos, Comandos com timeline, card Agente), `settings.tsx` (seção Agente / releases), `dashboard.tsx` (card Eventos críticos), `components/endpoints/agent-health-card.tsx` (novo), `components/endpoints/events-tab.tsx` (novo), `components/endpoints/commands-timeline.tsx` (novo), `components/settings/agent-releases-section.tsx` (novo).

### Fora do escopo (caso queira cortar)
- Editor de releases por canal com upload do `.ps1` (mantenho apenas metadados; o script vivo continua em `/public/agent/install.ps1`).
- Eventos Linux (`journald`) — agente Linux ainda não existe; deixo schema pronto, implementação só quando houver agente.
- Replay de comando assinado entre instâncias de agente (proteção replay via `expires_at` já cobre janela curta).

Confirma que posso seguir com tudo isso, ou quer cortar algum item?