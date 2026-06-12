CREATE TYPE public.endpoint_type AS ENUM ('workstation', 'server', 'mobile', 'network');
CREATE TYPE public.endpoint_status AS ENUM ('online', 'offline', 'warning', 'critical');

CREATE TABLE public.endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,
  type public.endpoint_type NOT NULL DEFAULT 'workstation',
  status public.endpoint_status NOT NULL DEFAULT 'offline',
  os TEXT,
  os_version TEXT,
  ip_address TEXT,
  mac_address TEXT,
  agent_version TEXT,
  cpu_usage NUMERIC(5,2),
  ram_usage NUMERIC(5,2),
  disk_usage NUMERIC(5,2),
  last_heartbeat TIMESTAMPTZ,
  tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_endpoints_tenant ON public.endpoints(tenant_id);
CREATE INDEX idx_endpoints_client ON public.endpoints(client_id);
CREATE INDEX idx_endpoints_status ON public.endpoints(tenant_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.endpoints TO authenticated;
GRANT ALL ON public.endpoints TO service_role;

ALTER TABLE public.endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view endpoints"
  ON public.endpoints FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Admins and technicians insert endpoints"
  ON public.endpoints FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'))
  );

CREATE POLICY "Admins and technicians update endpoints"
  ON public.endpoints FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'))
  );

CREATE POLICY "Admins and technicians delete endpoints"
  ON public.endpoints FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'))
  );

CREATE TRIGGER update_endpoints_updated_at
  BEFORE UPDATE ON public.endpoints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();