
CREATE TABLE public.endpoint_maintenance_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint_id UUID NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind TEXT NOT NULL DEFAULT 'maintenance', -- 'maintenance' | 'cleaning' | 'both'
  notes TEXT,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX endpoint_maintenance_logs_endpoint_idx ON public.endpoint_maintenance_logs(endpoint_id, performed_at DESC);
CREATE INDEX endpoint_maintenance_logs_tenant_idx ON public.endpoint_maintenance_logs(tenant_id, performed_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.endpoint_maintenance_logs TO authenticated;
GRANT ALL ON public.endpoint_maintenance_logs TO service_role;

ALTER TABLE public.endpoint_maintenance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_read_maintenance" ON public.endpoint_maintenance_logs
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician') OR public.has_role(auth.uid(),'viewer')));

CREATE POLICY "tenant_write_maintenance" ON public.endpoint_maintenance_logs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));

CREATE POLICY "tenant_update_maintenance" ON public.endpoint_maintenance_logs
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));

CREATE POLICY "tenant_delete_maintenance" ON public.endpoint_maintenance_logs
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));

-- Denormalized "last" fields on endpoints for quick display / sorting
ALTER TABLE public.endpoints
  ADD COLUMN IF NOT EXISTS last_maintenance_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_maintenance_kind TEXT,
  ADD COLUMN IF NOT EXISTS last_maintenance_notes TEXT;

CREATE OR REPLACE FUNCTION public.sync_endpoint_last_maintenance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _last RECORD;
BEGIN
  SELECT performed_at, kind, notes INTO _last
    FROM public.endpoint_maintenance_logs
   WHERE endpoint_id = COALESCE(NEW.endpoint_id, OLD.endpoint_id)
   ORDER BY performed_at DESC LIMIT 1;
  UPDATE public.endpoints
     SET last_maintenance_at = _last.performed_at,
         last_maintenance_kind = _last.kind,
         last_maintenance_notes = _last.notes
   WHERE id = COALESCE(NEW.endpoint_id, OLD.endpoint_id);
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER endpoint_maintenance_sync
AFTER INSERT OR UPDATE OR DELETE ON public.endpoint_maintenance_logs
FOR EACH ROW EXECUTE FUNCTION public.sync_endpoint_last_maintenance();
