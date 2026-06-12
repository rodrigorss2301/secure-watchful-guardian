
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  actor_id UUID,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID,
  summary TEXT,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_tenant_created ON public.audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_table, entity_id);

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read tenant audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
  _entity UUID;
  _summary TEXT;
  _actor_email TEXT;
  _old JSONB;
  _new JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _tenant := (to_jsonb(OLD)->>'tenant_id')::UUID;
    _entity := (to_jsonb(OLD)->>'id')::UUID;
    _old := to_jsonb(OLD);
    _new := NULL;
    _summary := COALESCE(to_jsonb(OLD)->>'name', to_jsonb(OLD)->>'hostname', to_jsonb(OLD)->>'title', _entity::text);
  ELSE
    _tenant := (to_jsonb(NEW)->>'tenant_id')::UUID;
    _entity := (to_jsonb(NEW)->>'id')::UUID;
    _new := to_jsonb(NEW);
    _old := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
    _summary := COALESCE(to_jsonb(NEW)->>'name', to_jsonb(NEW)->>'hostname', to_jsonb(NEW)->>'title', _entity::text);
  END IF;

  IF _tenant IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT email INTO _actor_email FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.audit_logs(tenant_id, actor_id, actor_email, action, entity_table, entity_id, summary, old_values, new_values)
  VALUES (_tenant, auth.uid(), _actor_email, lower(TG_OP), TG_TABLE_NAME, _entity, _summary, _old, _new);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_clients AFTER INSERT OR UPDATE OR DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER audit_endpoints AFTER INSERT OR UPDATE OR DELETE ON public.endpoints
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER audit_automations AFTER INSERT OR UPDATE OR DELETE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER audit_alert_rules AFTER INSERT OR UPDATE OR DELETE ON public.alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER audit_tickets AFTER INSERT OR DELETE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
