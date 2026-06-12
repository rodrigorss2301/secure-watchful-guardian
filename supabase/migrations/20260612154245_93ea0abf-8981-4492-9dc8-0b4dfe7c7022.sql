ALTER TABLE public.endpoints
  ADD COLUMN IF NOT EXISTS agent_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS last_seen_ip text;

CREATE TABLE IF NOT EXISTS public.agent_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  default_type public.endpoint_type NOT NULL DEFAULT 'workstation',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  used_endpoint_id uuid REFERENCES public.endpoints(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_enrollments_tenant ON public.agent_enrollments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_enrollments_token ON public.agent_enrollments(token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_enrollments TO authenticated;
GRANT ALL ON public.agent_enrollments TO service_role;

ALTER TABLE public.agent_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read enrollments"
  ON public.agent_enrollments FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Tenant admins/techs manage enrollments"
  ON public.agent_enrollments FOR ALL
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'))
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'))
  );