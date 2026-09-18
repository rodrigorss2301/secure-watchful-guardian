-- Integridade da assinatura de comandos.
--
-- Corrige tres defeitos que deixavam a verificacao HMAC inutil na pratica:
--   1. O banco assinava jsonb::text ("{"port": 3389}", com espacos) e o agente
--      calculava o hash de ConvertTo-Json -Compress ("{"port":3389}"). Nunca
--      batia quando o comando tinha parametros. Agora o texto exato assinado
--      viaja junto, em signed_payload, e o agente assina o que recebeu.
--   2. Tenants criados depois de 2026-07-01 nao ganhavam linha em
--      tenant_secrets, entao a assinatura era pulada (fail-open).
--   3. Comandos entregues e nunca respondidos ficavam presos em 'sent' para
--      sempre.

-- ---------------------------------------------------------------------------
-- 1) Toda tenant precisa de chave de assinatura.
-- ---------------------------------------------------------------------------
INSERT INTO public.tenant_secrets (tenant_id, command_signing_key)
SELECT t.id, encode(extensions.gen_random_bytes(32), 'hex')
  FROM public.tenants t
  LEFT JOIN public.tenant_secrets s ON s.tenant_id = t.id
 WHERE s.tenant_id IS NULL
ON CONFLICT (tenant_id) DO NOTHING;

UPDATE public.tenant_secrets
   SET command_signing_key = encode(extensions.gen_random_bytes(32), 'hex')
 WHERE command_signing_key IS NULL;

CREATE OR REPLACE FUNCTION public.ensure_tenant_secret()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tenant_secrets (tenant_id, command_signing_key)
  VALUES (NEW.id, encode(extensions.gen_random_bytes(32), 'hex'))
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tenants_ensure_secret ON public.tenants;
CREATE TRIGGER trg_tenants_ensure_secret
AFTER INSERT ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.ensure_tenant_secret();

-- ---------------------------------------------------------------------------
-- 2) Assina um payload que o agente consegue reproduzir byte a byte.
-- ---------------------------------------------------------------------------
ALTER TABLE public.endpoint_commands
  ADD COLUMN IF NOT EXISTS signed_payload TEXT;

ALTER TABLE public.endpoint_commands
  ALTER COLUMN timeout_seconds SET DEFAULT 300;

CREATE OR REPLACE FUNCTION public.sign_endpoint_command()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key TEXT;
  _payload TEXT;
BEGIN
  IF NEW.signature IS NOT NULL AND NEW.signed_payload IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT command_signing_key INTO _key
    FROM public.tenant_secrets WHERE tenant_id = NEW.tenant_id;

  -- Fail-closed: sem chave nao existe comando. Antes o comando era gravado sem
  -- assinatura e o agente executava sem verificar.
  IF _key IS NULL THEN
    RAISE EXCEPTION 'tenant % has no command signing key', NEW.tenant_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A chave e gerada com encode(gen_random_bytes(32),'hex'), e o agente faz
  -- Convert::ToByte(...,16) para transformar esse hex em 32 bytes. O
  -- extensions.hmac(text, text, ...) usava os 64 caracteres do hex como chave
  -- literal, entao os dois lados assinavam com chaves diferentes e a
  -- verificacao falhava mesmo com o payload identico. decode(_key,'hex')
  -- alinha o banco ao agente.
  IF _key !~ '^[0-9a-f]+$' OR length(_key) % 2 <> 0 THEN
    RAISE EXCEPTION 'signing key for tenant % is not hex', NEW.tenant_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  _payload := NEW.id::text
           || '|' || NEW.command::text
           || '|' || COALESCE(NEW.params::text, '{}')
           || '|' || COALESCE(NEW.timeout_seconds, 300)::text;

  NEW.signed_payload := _payload;
  NEW.signature := encode(
    extensions.hmac(convert_to(_payload, 'UTF8'), decode(_key, 'hex'), 'sha256'),
    'hex');
  NEW.signed_at := now();

  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := now()
      + (GREATEST(COALESCE(NEW.timeout_seconds, 300) * 2, 600) || ' seconds')::interval;
  END IF;

  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Um comando so pode apontar para endpoint do proprio tenant.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin/tech create commands" ON public.endpoint_commands;
CREATE POLICY "admin/tech create commands" ON public.endpoint_commands
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'))
    AND EXISTS (
      SELECT 1 FROM public.endpoints e
       WHERE e.id = endpoint_id
         AND e.tenant_id = public.get_user_tenant(auth.uid())
    )
  );

DROP POLICY IF EXISTS "admin/tech update commands" ON public.endpoint_commands;
CREATE POLICY "admin/tech update commands" ON public.endpoint_commands
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'))
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'))
  );

-- ---------------------------------------------------------------------------
-- 4) Comandos entregues e sem resposta nao ficam presos em 'sent'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_stale_commands()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n integer;
BEGIN
  WITH expired AS (
    UPDATE public.endpoint_commands
       SET status = 'expired',
           failed_reason = CASE WHEN status = 'sent'
                                THEN 'no_result_before_expiration'
                                ELSE 'expired_before_pickup' END,
           completed_at = now()
     WHERE status IN ('pending', 'sent')
       AND COALESCE(
             expires_at,
             COALESCE(sent_at, created_at)
               + (GREATEST(COALESCE(timeout_seconds, 300) * 2, 600) || ' seconds')::interval
           ) < now()
    RETURNING 1
  )
  SELECT count(*) INTO _n FROM expired;
  RETURN _n;
END $$;

REVOKE ALL ON FUNCTION public.expire_stale_commands() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_commands() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-stale-commands') THEN
    PERFORM cron.unschedule('expire-stale-commands');
  END IF;
  PERFORM cron.schedule(
    'expire-stale-commands',
    '* * * * *',
    $cron$SELECT public.expire_stale_commands();$cron$
  );
END $$;
