
CREATE TYPE public.endpoint_command_type AS ENUM ('shutdown','restart','sleep','hibernate','wake_on_lan','logoff');
CREATE TYPE public.endpoint_command_status AS ENUM ('pending','sent','succeeded','failed','cancelled');

CREATE TABLE public.endpoint_commands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint_id UUID NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
  command public.endpoint_command_type NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.endpoint_command_status NOT NULL DEFAULT 'pending',
  output TEXT,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_endpoint_commands_endpoint ON public.endpoint_commands(endpoint_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.endpoint_commands TO authenticated;
GRANT ALL ON public.endpoint_commands TO service_role;

ALTER TABLE public.endpoint_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read commands" ON public.endpoint_commands
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "admin/tech create commands" ON public.endpoint_commands
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician'))
  );

CREATE POLICY "admin/tech update commands" ON public.endpoint_commands
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician'))
  );

CREATE POLICY "admin/tech delete commands" ON public.endpoint_commands
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician'))
  );

CREATE TRIGGER trg_endpoint_commands_updated
  BEFORE UPDATE ON public.endpoint_commands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
