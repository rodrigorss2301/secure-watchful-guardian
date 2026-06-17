## Objetivo
Permitir criar automações que **ligam (Wake-on-LAN)**, **desligam**, **reiniciam**, **suspendem**, **hibernam** ou **encerram sessão** de computadores em horários definidos (cron).

## Como vai funcionar

Hoje as automações suportam apenas `script` e `task` (código PowerShell/Bash/Python). Vou adicionar um novo tipo **"Energia"** que dispensa código e enfileira diretamente um comando para o agente em cada endpoint do escopo selecionado, exatamente como a tela "Controle de energia" já faz hoje, só que de forma agendada.

### Mudanças no banco
1. Adicionar valor `'power'` ao enum `automation_kind`.
2. Adicionar colunas em `automations`:
   - `power_action endpoint_command_type` (shutdown / restart / sleep / hibernate / wake_on_lan / logoff)
   - `power_delay_seconds integer default 30`
   - `power_message text`
3. Atualizar `run_automation()`: quando `kind = 'power'`, inserir em `endpoint_commands` (em vez de criar run simulada) para cada endpoint do escopo. Continua gravando linha em `automation_runs` para histórico.
4. Criar função `run_scheduled_automations()` (SECURITY DEFINER) que percorre automações `enabled = true`, `trigger = 'schedule'`, e cujo `cron_expr` "casa" com o minuto atual — executa cada uma.
5. Agendar `pg_cron`: rodar `run_scheduled_automations()` a cada minuto.

### Mudanças na UI
**`automation-form-dialog.tsx`:**
- Adicionar opção "Energia" na lista de tipos (`AUTOMATION_KINDS`).
- Quando `kind = 'power'`:
  - Esconder: linguagem, código.
  - Mostrar: select de ação (Ligar / Desligar / Reiniciar / Suspender / Hibernar / Encerrar sessão), atraso (segundos) e mensagem opcional.
  - Forçar `trigger = 'schedule'` como padrão e destacar campo cron (com presets: "Todo dia às 08:00", "Todo dia às 19:00", "Segunda a sexta 08:00", custom).
- Validação: `kind = 'power'` exige `power_action`.

**Lista de automações:** mostrar ícone ⚡ + descrição da ação quando for energia.

### Detalhes técnicos
- `power_action` reusa o enum `endpoint_command_type` que já existe.
- Cron simples (5 campos). Suporte aos padrões `* * * * *`, `M H * * *`, `M H * * 1-5` etc. `run_scheduled_automations` faz match básico de minuto/hora/dia.
- WoL só faz sentido com endpoint offline → manter regra: ação `wake_on_lan` é enviada mesmo offline; demais aguardam heartbeat (lógica do agente já existe).
- `automation_runs.output` recebe resumo "Comando shutdown enfileirado em N endpoints".

### Arquivos a editar/criar
- `supabase/migrations/<novo>.sql` — alterações de enum/colunas + funções + cron.
- `src/lib/automations.ts` — adicionar `'power'` em `AUTOMATION_KINDS`, ícone e helpers.
- `src/components/automations/automation-form-dialog.tsx` — UI condicional.
- `src/integrations/supabase/types.ts` — regenerado automaticamente.
- `src/lib/i18n.tsx` — strings novas (kind.power, power.action.*, presets cron).

## Fora do escopo
- Editor visual de cron (vou usar input + presets clicáveis).
- Fuso horário por tenant (usa TZ do servidor — pode ser melhorado depois).