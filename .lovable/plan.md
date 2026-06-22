
# Melhorias sugeridas para o sistema (visão geral)

Baseado no que já existe (endpoints, tickets, alertas, automações, billing, KB, portal, agente, RLS multi-tenant), organizei por área. Você escolhe o que entra e eu transformo em planos focados.

## 1. Monitoramento de endpoints

- **Mapa de saúde da frota** no dashboard: heatmap de status (online/warning/critical/offline) por cliente e por tipo.
- **Latência/RTT** no histórico de rede (agente envia ping pro gateway/Tailscale; linha sobreposta ao gráfico de uptime).
- **Top N endpoints com mais quedas / maior downtime** no período (widget no dashboard).
- **Detecção de anomalia simples** em CPU/RAM/disco (média móvel + desvio) gerando alertas automáticos.
- **Histórico de software instalado**: ver o que foi instalado/removido nos últimos X dias em toda a frota (útil pra compliance).
- **Patch status**: última atualização do SO + lista de KBs/pacotes pendentes.

## 2. Tickets & SLA

- **SLA por contrato**: tempo de primeira resposta e resolução, com semáforo e relatório mensal.
- **Templates de resposta** + macros (fechar com motivo, pedir info, escalar).
- **Vinculação ticket ↔ endpoint ↔ alerta** (já parcial?): criar ticket automaticamente de um alerta crítico não reconhecido em N minutos.
- **Mesclar tickets duplicados** e **tickets recorrentes** (mesmo alerta repete = agrupar).
- **Satisfação (CSAT)** ao fechar ticket no portal.

## 3. Alertas & automações

- **Janelas de manutenção** (silencia alertas de um endpoint/cliente num intervalo).
- **Deduplicação e agrupamento**: 50 endpoints offline ao mesmo tempo viram 1 incidente.
- **Escalonamento**: se não reconhecido em X min, notifica próximo nível.
- **Canais**: e-mail, webhook, Slack/Teams, WhatsApp (via connector).
- **Biblioteca de automações** prontas (limpar temp, reiniciar serviço, rodar Windows Update, coletar logs).
- **Aprovação humana** opcional antes de executar automação destrutiva.

## 4. Portal do cliente

- **Visão de saúde** dos próprios endpoints (somente leitura) — gráficos simples e estado atual.
- **Aprovar/rejeitar orçamentos** e ver faturas pagas/pendentes.
- **Base de conhecimento pública** com busca e categorias.
- **Notificações por e-mail** de atualização de ticket.

## 5. Billing

- **Cobrança recorrente** automática por contrato (mensal) gerando invoice em rascunho.
- **Itens medidos**: por endpoint ativo, por ticket fora do escopo, por hora extra.
- **Integração Stripe** (já temos connector disponível) para link de pagamento na fatura.
- **Relatório de rentabilidade por cliente** (receita − horas gastas em tickets).

## 6. Agente (instalação & operação)

- **Auto-update** do agente com canal stable/beta.
- **Comandos remotos seguros** com log assinado e timeout (já existe `endpoint_commands` — expandir UI).
- **Coleta opcional de eventos do Event Viewer / journald** filtrados (erros críticos).
- **Modo offline**: bufferizar métricas e enviar quando voltar.
- **Health check do próprio agente** (versão, último erro, uso de CPU dele mesmo).

## 7. Segurança & compliance

- **2FA obrigatório** para staff/admin.
- **Sessões ativas** + revogação manual no perfil.
- **Audit log com filtros e exportação** (já existe a tabela — falta UI rica).
- **Política de retenção** configurável (métricas, histórico, logs).
- **Revisão periódica de RLS**: rodar o linter e o scanner como parte do release.
- **Secrets do endpoint** (`endpoint_secrets`) — garantir que nunca trafegam pro client; expor só via server function com role check.

## 8. UX / Produto

- **Busca global** (Cmd/Ctrl+K) por endpoint, ticket, cliente, KB.
- **Favoritos / pins** por usuário (clientes ou endpoints).
- **Salvable views** (filtros + colunas) em endpoints e tickets.
- **Modo denso / confortável** nas tabelas grandes.
- **Atalhos de teclado** nas listas (j/k navegação, e editar, etc.).
- **i18n completo**: revisar strings hardcoded em PT/EN (já temos `i18n.tsx`).
- **Acessibilidade**: foco visível, labels em ícones-only, contraste nos badges.

## 9. Performance & infra

- **Paginação real** em listas grandes (tickets, endpoints, audit) — hoje muitas usam `.limit(500)`.
- **Realtime seletivo** (assinar só o que está visível, não a tabela inteira).
- **Índices** em colunas usadas em `ORDER BY`/`WHERE` recorrentes (`endpoint_id, created_at`, etc.) — vale uma passagem.
- **Cache de queries** com `staleTime` adequado por tipo de dado (configs raramente mudam, métricas mudam toda hora).
- **Job de housekeeping** (pg_cron): comprimir métricas antigas, fechar outages órfãs, expirar enrollments.

## 10. Observabilidade interna do SaaS

- **Página de status** interna: filas, último heartbeat agregado, erros recentes de edge functions.
- **Métricas de uso** por tenant (endpoints ativos, tickets/mês) — base para planos.

---

## Sugestão de prioridade (próximas 2-3 entregas)

1. **SLA + janelas de manutenção + agrupamento de alertas** → resolve a dor diária do operador.
2. **Portal do cliente com visão de saúde + KB pública** → reduz tickets.
3. **Busca global (Cmd+K) + paginação real + salvable views** → escala a operação.

Me diga em quais áreas/itens quer focar (pode citar números, ex.: "3 todo + 1.1 + 1.2 + 8.1") e eu volto com um plano detalhado por feature.
