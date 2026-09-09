# Portal com marca por empresa

Em **Clientes → abrir empresa → Editar**, a seção **Marca do portal do cliente** permite configurar:

- endereço HTTPS público do logotipo;
- cor principal;
- título e mensagem de boas-vindas;
- prévia imediata antes de salvar.

Nos detalhes da empresa, ative o **Link público de chamados**, copie o endereço `/submit/<slug>` e compartilhe com esse cliente. Cada link carrega a marca e abre chamados para a empresa correspondente. A configuração da marca não ativa o link público automaticamente.

Clientes existentes recebem a aparência padrão. Logos inválidos ou indisponíveis usam as iniciais da empresa. Sem título ou mensagem personalizados, são exibidos textos padrão. A página de confirmação mantém a marca.

## Implantação

1. Aplicar `supabase/migrations/20260909150000_client_portal_branding.sql` no banco correspondente ao ambiente.
2. Publicar o aplicativo atualizado depois da migration.
3. Configurar duas empresas distintas e conferir cada link numa janela anônima, incluindo envio de chamado em ambiente de homologação.

As colunas usam as políticas RLS já existentes de `clients`. O endpoint público retorna apenas nomes e campos de identidade visual, após conferir o slug e a ativação do link. Não há upload de arquivos nesta versão; o logo deve estar hospedado em um endereço HTTPS público.

Esta entrega personaliza o portal público de suporte. O painel interno, a tela geral de login e o endereço genérico `/portal/tickets` mantêm seu comportamento atual.
