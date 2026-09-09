# Preparação comercial do Autotechs RMM

Diagnóstico inicial do código em 09/09/2026. Não equivale a uma auditoria completa nem a validação em produção.

## Base existente

O repositório contém painel de equipamentos, inventário, alertas, automações, chamados, portal, clientes, contratos, cobrança, relatórios, auditoria e um agente Windows em PowerShell. A presença desses módulos não comprova seu funcionamento ponta a ponta.

Hipótese de público, a confirmar: prestadores de TI que gerenciam vários clientes. A proposta inicial pode ser centralizar monitoramento, atendimento e comprovação do serviço em português.

## Primeira melhoria implementada

- Heartbeats concorrentes só recebem comandos efetivamente alterados de `pending` para `sent` pelo próprio pedido.
- Cancelamentos e resultados finais não são sobrescritos por resultados tardios ou conflitantes.
- Reenvio de resultado idêntico retorna sucesso sem alterar a data de conclusão, inclusive depois da expiração.
- Falhas de banco interrompem a entrega ou a confirmação de comandos.
- Testes locais: `node --test tests/agent-commands.test.mjs` (Node 22.18+ ou 24). Usam banco simulado; a concorrência real no PostgreSQL ainda precisa de validação em homologação.

Limitação: se a resposta HTTP se perder depois da marcação como `sent`, o comando pode não chegar ao agente. A próxima evolução deve usar confirmação de recebimento, prazo de reserva e deduplicação persistente no agente; reenviar comandos cegamente pode duplicar operações.

## Prioridades antes do piloto pago

| Prioridade | Entrega | Critério de aceite |
| --- | --- | --- |
| P0 | Cadastro de agente transacional | Duas requisições com o mesmo token criam no máximo uma inscrição; falha no armazenamento do segredo desfaz a operação. Hoje `enroll.ts` consulta e consome o token em operações separadas. |
| P0 | Isolamento e permissões | Testes com dois tenants e usuários admin, técnico, visualizador, portal e desativado comprovam bloqueio de leituras e operações indevidas, inclusive chamadas diretas ao banco/API. |
| P0 | Credenciais e assinatura | Revisar distribuição da chave HMAC por tenant e da chave Tailscale global no cadastro; definir revogação, rotação e credenciais por instalação/cliente. Validar assinatura ponta a ponta. |
| P0 | Entrega confiável | Simular perda de rede, reinício, cancelamento e repetição; nenhum comando é executado duas vezes e o painel explica comandos sem confirmação. |
| P0 | Recuperação | Restaurar um backup em ambiente separado e registrar tempos e procedimento. |
| P1 | Primeiros passos | Fluxo guiado: cadastrar cliente, instalar agente, receber primeiro heartbeat e gerar primeiro alerta, com erros acionáveis. |
| P1 | Demonstração | Ambiente separado com dados fictícios identificados e roteiro de monitoramento → alerta → chamado → resolução → relatório. |
| P1 | Gestão da assinatura | Definir se a venda é licença por instalação ou SaaS. Se SaaS, separar assinatura do prestador da cobrança dos serviços aos clientes; implementar limites e ciclo da assinatura. |
| P1 | Relatório de valor | Relatório por cliente/período com disponibilidade, incidentes e cumprimento dos prazos, conciliado com dados reais. |
| P2 | Expansão | Atualizações do agente, políticas de manutenção e personalização visual depois de validar o piloto. |

## Portão de liberação

Executar build e validação TypeScript, testes de isolamento em banco de homologação e instalação numa VM Windows autorizada. Validar atualização, desinstalação e recuperação de falhas. Só declarar recursos como disponíveis comercialmente após demonstração ponta a ponta. Definir público, modelo de hospedagem e suporte antes de estabelecer planos e prometer prazos de atendimento.
