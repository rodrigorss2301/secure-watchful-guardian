
-- 1) Server-only secrets table for agent tokens
CREATE TABLE IF NOT EXISTS public.endpoint_secrets (
  endpoint_id UUID PRIMARY KEY REFERENCES public.endpoints(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service role only — no grants to anon/authenticated
GRANT ALL ON public.endpoint_secrets TO service_role;
ALTER TABLE public.endpoint_secrets ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated/anon => fully blocked from Data API

CREATE TRIGGER trg_endpoint_secrets_updated
  BEFORE UPDATE ON public.endpoint_secrets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Backfill from existing endpoints.agent_token
INSERT INTO public.endpoint_secrets (endpoint_id, tenant_id, agent_token)
SELECT id, tenant_id, agent_token
FROM public.endpoints
WHERE agent_token IS NOT NULL
ON CONFLICT (endpoint_id) DO NOTHING;

-- 3) Drop the sensitive column from endpoints
ALTER TABLE public.endpoints DROP COLUMN IF EXISTS agent_token;

-- 4) Tighten ticket_comments author update policy: cannot flip to internal,
--    cannot edit if currently internal. Staff (admin/technician) keep full edit via separate policy.
DROP POLICY IF EXISTS "author update comments" ON public.ticket_comments;
CREATE POLICY "author update comments" ON public.ticket_comments
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND author_id = auth.uid()
    AND COALESCE(internal, false) = false
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid())
    AND author_id = auth.uid()
    AND COALESCE(internal, false) = false
  );

DROP POLICY IF EXISTS "staff update comments" ON public.ticket_comments;
CREATE POLICY "staff update comments" ON public.ticket_comments
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician'))
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician'))
  );
