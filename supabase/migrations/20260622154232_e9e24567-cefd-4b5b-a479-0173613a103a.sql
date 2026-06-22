
-- =========================================================
-- Item 6 — Agente: auto-update, comandos assinados, eventos, health-check
-- =========================================================

-- 1) tenants: chave secreta para assinar comandos
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS command_signing_key TEXT;

UPDATE public.tenants
  SET command_signing_key = encode(extensions.gen_random_bytes(32), 'hex')
  WHERE command_signing_key IS NULL;

ALTER TABLE public.tenants ALTER COLUMN command_signing_key SET NOT NULL;
ALTER TABLE public.tenants
  ALTER COLUMN command_signing_key SET DEFAULT encode(extensions.gen_random_bytes(32), 'hex');

-- 2) endpoints: canal de atualização + health do agente
ALTER TABLE public.endpoints
  ADD COLUMN IF NOT EXISTS update_channel TEXT NOT NULL DEFAULT 'stable',
  ADD COLUMN IF NOT EXISTS agent_last_update_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agent_cpu_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS agent_ram_mb INTEGER,
  ADD COLUMN IF NOT EXISTS agent_last_error TEXT,
  ADD COLUMN IF NOT EXISTS agent_last_error_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agent_heartbeat_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS agent_queue_size INTEGER;

ALTER TABLE public.endpoints
  DROP CONSTRAINT IF EXISTS endpoints_update_channel_check;
ALTER TABLE public.endpoints
  ADD CONSTRAINT endpoints_update_channel_check CHECK (update_channel IN ('stable','beta'));

-- 3) endpoint_commands: novos status, timeout, assinatura, expiração
ALTER TYPE public.endpoint_command_status ADD VALUE IF NOT EXISTS 'timeout';
ALTER TYPE public.endpoint_command_status ADD VALUE IF NOT EXISTS 'expired';

ALTER TABLE public.endpoint_commands
  ADD COLUMN IF NOT EXISTS timeout_seconds INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS signature TEXT,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_reason TEXT;

-- Trigger para assinar comandos na inserção
CREATE OR REPLACE FUNCTION public.sign_endpoint_command()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _key TEXT;
BEGIN
  IF NEW.signature IS NOT NULL THEN RETURN NEW; END IF;
  SELECT command_signing_key INTO _key FROM public.tenants WHERE id = NEW.tenant_id;
  IF _key IS NULL THEN RETURN NEW; END IF;
  NEW.signature := encode(
    extensions.hmac(
      NEW.id::text || '|' || NEW.command::text || '|' || COALESCE(NEW.params::text, '{}') || '|' || NEW.timeout_seconds::text,
      _key, 'sha256'
    ), 'hex');
  NEW.signed_at := now();
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := now() + (GREATEST(NEW.timeout_seconds * 2, 600) || ' seconds')::interval;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_endpoint_commands_sign ON public.endpoint_commands;
CREATE TRIGGER trg_endpoint_commands_sign
  BEFORE INSERT ON public.endpoint_commands
  FOR EACH ROW EXECUTE FUNCTION public.sign_endpoint_command();

-- 4) endpoint_command_logs
CREATE TABLE IF NOT EXISTS public.endpoint_command_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  command_id UUID NOT NULL REFERENCES public.endpoint_commands(id) ON DELETE CASCADE,
  endpoint_id UUID NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','warn','error')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.endpoint_command_logs TO authenticated;
GRANT ALL ON public.endpoint_command_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.endpoint_command_logs_id_seq TO authenticated, service_role;

ALTER TABLE public.endpoint_command_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read command logs" ON public.endpoint_command_logs
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_command_logs_command ON public.endpoint_command_logs(command_id, created_at);

-- 5) endpoint_events
DO $$ BEGIN
  CREATE TYPE public.endpoint_event_level AS ENUM ('info','warning','error','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.endpoint_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint_id UUID NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'windows',
  level public.endpoint_event_level NOT NULL DEFAULT 'error',
  event_id INTEGER,
  provider TEXT,
  message TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.endpoint_events TO authenticated;
GRANT ALL ON public.endpoint_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.endpoint_events_id_seq TO authenticated, service_role;

ALTER TABLE public.endpoint_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read endpoint events" ON public.endpoint_events
  FOR SELECT TO authenticated USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (NOT public.has_role(auth.uid(), 'portal'::app_role)
         OR EXISTS (SELECT 1 FROM public.endpoints e
                    WHERE e.id = endpoint_events.endpoint_id
                      AND e.client_id = public.get_user_client(auth.uid())))
  );

CREATE INDEX IF NOT EXISTS idx_endpoint_events_lookup
  ON public.endpoint_events(endpoint_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_endpoint_events_tenant_time
  ON public.endpoint_events(tenant_id, occurred_at DESC);

-- 6) agent_releases (global; leitura pública do mais recente)
CREATE TABLE IF NOT EXISTS public.agent_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL CHECK (channel IN ('stable','beta')),
  version TEXT NOT NULL,
  script_url TEXT NOT NULL,
  sha256 TEXT,
  notes TEXT,
  released_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel, version)
);

GRANT SELECT ON public.agent_releases TO anon, authenticated;
GRANT ALL ON public.agent_releases TO service_role;

ALTER TABLE public.agent_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads agent releases" ON public.agent_releases
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "admins manage agent releases" ON public.agent_releases
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.agent_releases (channel, version, script_url, notes) VALUES
  ('stable', '1.6.0', '/agent/install.ps1', 'Auto-update, comandos assinados, eventos e self-health'),
  ('beta',   '1.6.0', '/agent/install.ps1', 'Auto-update, comandos assinados, eventos e self-health')
ON CONFLICT (channel, version) DO NOTHING;

-- 7) função pública para o último release por canal
CREATE OR REPLACE FUNCTION public.get_latest_agent_release(_channel TEXT)
RETURNS TABLE(channel TEXT, version TEXT, script_url TEXT, sha256 TEXT, released_at TIMESTAMPTZ)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT channel, version, script_url, sha256, released_at
    FROM public.agent_releases
   WHERE channel = COALESCE(_channel, 'stable')
   ORDER BY released_at DESC
   LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_agent_release(TEXT) TO anon, authenticated, service_role;

-- 8) cleanup ampliado para eventos e command logs
CREATE OR REPLACE FUNCTION public.cleanup_endpoint_history()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.endpoint_inventory_history WHERE created_at < now() - interval '30 days';
  DELETE FROM public.endpoint_metric_samples    WHERE sampled_at < now() - interval '30 days';
  DELETE FROM public.endpoint_outages           WHERE COALESCE(ended_at, started_at) < now() - interval '30 days';
  DELETE FROM public.endpoint_events            WHERE occurred_at < now() - interval '30 days';
  DELETE FROM public.endpoint_command_logs      WHERE created_at < now() - interval '14 days';
$$;
