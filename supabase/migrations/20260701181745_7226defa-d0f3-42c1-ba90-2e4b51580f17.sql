
-- 1) Move command_signing_key out of tenants into a secrets-only table
CREATE TABLE IF NOT EXISTS public.tenant_secrets (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  command_signing_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No grants to anon/authenticated: only service_role and SECURITY DEFINER functions may touch this.
GRANT ALL ON public.tenant_secrets TO service_role;
ALTER TABLE public.tenant_secrets ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: default-deny for anon/authenticated. service_role bypasses RLS.

-- Backfill existing keys, if the column exists on tenants
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tenants' AND column_name='command_signing_key'
  ) THEN
    INSERT INTO public.tenant_secrets (tenant_id, command_signing_key)
    SELECT id, command_signing_key FROM public.tenants
    WHERE command_signing_key IS NOT NULL
    ON CONFLICT (tenant_id) DO UPDATE SET command_signing_key = EXCLUDED.command_signing_key;

    ALTER TABLE public.tenants DROP COLUMN command_signing_key;
  END IF;
END $$;

-- Update sign_endpoint_command trigger function to pull the key from tenant_secrets
CREATE OR REPLACE FUNCTION public.sign_endpoint_command()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE _key TEXT;
BEGIN
  IF NEW.signature IS NOT NULL THEN RETURN NEW; END IF;
  SELECT command_signing_key INTO _key FROM public.tenant_secrets WHERE tenant_id = NEW.tenant_id;
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
END $function$;

-- 2) Restrict automation_templates read access to authenticated users only
DROP POLICY IF EXISTS "templates public read" ON public.automation_templates;
CREATE POLICY "templates authenticated read"
  ON public.automation_templates
  FOR SELECT
  TO authenticated
  USING (true);

-- 3) Revoke EXECUTE from anon/public on every SECURITY DEFINER function in public
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon;', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role;', r.proname, r.args);
  END LOOP;
END $$;

-- Public intake RPCs must remain callable without a session (used by anon submit form)
GRANT EXECUTE ON FUNCTION public.get_public_intake(text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_public_ticket(text, text, text, text, text, text, text) TO anon;
