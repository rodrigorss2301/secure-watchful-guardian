-- Endurecimento de controle de acesso.
--
-- Corrige duas falhas criticas:
--   1. Usuarios com perfil 'pending' enxergavam quase todos os dados do tenant,
--      porque get_user_tenant() nao olhava o status e o bloqueio existia so na UI.
--   2. agent_releases e uma tabela global gravavel por qualquer admin de qualquer
--      tenant. Como o agente baixa e executa o script da release como SYSTEM,
--      qualquer pessoa que se cadastrasse conseguia executar codigo na frota toda.

-- ---------------------------------------------------------------------------
-- 1) Somente perfis ativos resolvem tenant/cliente.
--    Todas as policies de RLS passam por estas duas funcoes, entao gatear aqui
--    fecha o acesso de uma vez em todas as tabelas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_tenant(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles
   WHERE id = _user_id AND status = 'active'::public.user_status
$$;

CREATE OR REPLACE FUNCTION public.get_user_client(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id FROM public.profiles
   WHERE id = _user_id AND status = 'active'::public.user_status
$$;

-- ---------------------------------------------------------------------------
-- 2) Releases do agente: so o tenant dono da plataforma publica.
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS is_platform_owner BOOLEAN NOT NULL DEFAULT false;

-- O tenant mais antigo e o operador da plataforma. Se alguem ja foi marcado,
-- respeita a marcacao existente.
UPDATE public.tenants SET is_platform_owner = true
 WHERE id = (SELECT id FROM public.tenants ORDER BY created_at, id LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM public.tenants WHERE is_platform_owner);

-- is_platform_owner nao entra no GRANT de colunas de tenants, logo continua
-- invisivel para authenticated (ver migracao 20260623135835).

CREATE OR REPLACE FUNCTION public.is_platform_owner(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN public.tenants t  ON t.id = p.tenant_id
      JOIN public.user_roles ur
        ON ur.user_id = p.id AND ur.tenant_id = p.tenant_id AND ur.role = 'admin'::public.app_role
     WHERE p.id = _user_id
       AND p.status = 'active'::public.user_status
       AND t.is_platform_owner
  )
$$;

REVOKE ALL ON FUNCTION public.is_platform_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_owner(uuid) TO authenticated, service_role;

-- Nenhum papel da aplicacao escreve releases: a publicacao passa pela rota
-- /api/admin/agent-release, que roda com service_role, confere is_platform_owner
-- e calcula o SHA-256 do script realmente servido.
DROP POLICY IF EXISTS "admins manage agent releases" ON public.agent_releases;
REVOKE ALL ON public.agent_releases FROM anon, authenticated;
GRANT SELECT ON public.agent_releases TO authenticated;
GRANT ALL ON public.agent_releases TO service_role;

ALTER TABLE public.agent_releases
  ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- script_url so pode ser caminho interno ou HTTPS absoluto, nunca '//host'
-- (protocol-relative) nem travessia de diretorio.
ALTER TABLE public.agent_releases DROP CONSTRAINT IF EXISTS agent_releases_script_url_safe;
ALTER TABLE public.agent_releases ADD CONSTRAINT agent_releases_script_url_safe CHECK (
  (script_url LIKE '/%' OR script_url LIKE 'https://%')
  AND script_url NOT LIKE '//%'
  AND script_url NOT LIKE '%..%'
);

ALTER TABLE public.agent_releases DROP CONSTRAINT IF EXISTS agent_releases_sha256_hex;
ALTER TABLE public.agent_releases ADD CONSTRAINT agent_releases_sha256_hex CHECK (
  sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'
);

-- Enforcement de verdade: o agente nunca recebe uma release sem hash, entao
-- as 4 linhas historicas com sha256 nulo simplesmente param de ser oferecidas
-- (auto-update pausa ate republicar) em vez de serem apagadas.
CREATE OR REPLACE FUNCTION public.get_latest_agent_release(_channel TEXT)
RETURNS TABLE(channel TEXT, version TEXT, script_url TEXT, sha256 TEXT, released_at TIMESTAMPTZ)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT channel, version, script_url, sha256, released_at
    FROM public.agent_releases
   WHERE channel = COALESCE(_channel, 'stable')
     AND sha256 IS NOT NULL
   ORDER BY released_at DESC
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_latest_agent_release(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_latest_agent_release(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Defesa em profundidade nos GRANTs de tabela.
--    Hoje anon/authenticated tem INSERT/UPDATE/DELETE/TRUNCATE em praticamente
--    tudo e so o RLS segura. anon nao precisa de acesso a nenhuma tabela: os
--    fluxos publicos (intake, agente) passam por rotas de servidor com
--    service_role.
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
-- Tabelas criadas daqui pra frente tambem nascem fechadas para anon.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', r.relname);
  END LOOP;
END $$;

-- Tabelas de segredo: RLS sem policy ja nega tudo, mas sem GRANT tambem.
REVOKE ALL ON public.tenant_secrets   FROM anon, authenticated;
REVOKE ALL ON public.endpoint_secrets FROM anon, authenticated;
GRANT ALL ON public.tenant_secrets   TO service_role;
GRANT ALL ON public.endpoint_secrets TO service_role;
