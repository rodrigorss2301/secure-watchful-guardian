
-- Enums
CREATE TYPE public.alert_severity AS ENUM ('info', 'warning', 'critical');
CREATE TYPE public.alert_metric AS ENUM ('cpu', 'ram', 'disk', 'offline');
CREATE TYPE public.alert_comparator AS ENUM ('gt', 'gte', 'lt', 'lte');
CREATE TYPE public.alert_status AS ENUM ('open', 'acknowledged', 'resolved');
CREATE TYPE public.alert_scope AS ENUM ('all', 'client', 'endpoint');

-- alert_rules
CREATE TABLE public.alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  metric public.alert_metric NOT NULL,
  comparator public.alert_comparator NOT NULL DEFAULT 'gte',
  threshold NUMERIC NOT NULL DEFAULT 90,
  duration_minutes INTEGER NOT NULL DEFAULT 5,
  severity public.alert_severity NOT NULL DEFAULT 'warning',
  scope public.alert_scope NOT NULL DEFAULT 'all',
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  endpoint_id UUID REFERENCES public.endpoints(id) ON DELETE CASCADE,
  notify_email TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alert_rules_tenant ON public.alert_rules(tenant_id);
CREATE INDEX idx_alert_rules_enabled ON public.alert_rules(tenant_id, enabled);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_rules TO authenticated;
GRANT ALL ON public.alert_rules TO service_role;
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members view alert_rules" ON public.alert_rules FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "staff insert alert_rules" ON public.alert_rules FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));
CREATE POLICY "staff update alert_rules" ON public.alert_rules FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "admin delete alert_rules" ON public.alert_rules FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(),'admin'));

CREATE TRIGGER update_alert_rules_updated_at BEFORE UPDATE ON public.alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- alerts (events)
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.alert_rules(id) ON DELETE SET NULL,
  endpoint_id UUID REFERENCES public.endpoints(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  metric public.alert_metric NOT NULL,
  severity public.alert_severity NOT NULL,
  value NUMERIC,
  threshold NUMERIC,
  message TEXT NOT NULL,
  status public.alert_status NOT NULL DEFAULT 'open',
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerts_tenant_status ON public.alerts(tenant_id, status);
CREATE INDEX idx_alerts_endpoint ON public.alerts(endpoint_id);
CREATE INDEX idx_alerts_created ON public.alerts(tenant_id, created_at DESC);
CREATE UNIQUE INDEX uniq_open_alert_per_rule_endpoint
  ON public.alerts(rule_id, endpoint_id) WHERE status <> 'resolved';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members view alerts" ON public.alerts FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "staff insert alerts" ON public.alerts FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));
CREATE POLICY "staff update alerts" ON public.alerts FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "admin delete alerts" ON public.alerts FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(),'admin'));

CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Evaluation function: runs in caller's tenant via get_user_tenant; SECURITY INVOKER so RLS applies.
CREATE OR REPLACE FUNCTION public.evaluate_alert_rules()
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
  _rule RECORD;
  _ep RECORD;
  _value NUMERIC;
  _triggered BOOLEAN;
  _msg TEXT;
  _count INTEGER := 0;
BEGIN
  _tenant := public.get_user_tenant(auth.uid());
  IF _tenant IS NULL THEN RETURN 0; END IF;

  FOR _rule IN
    SELECT * FROM public.alert_rules WHERE tenant_id = _tenant AND enabled = true
  LOOP
    FOR _ep IN
      SELECT e.* FROM public.endpoints e
      WHERE e.tenant_id = _tenant
        AND (_rule.scope = 'all'
          OR (_rule.scope = 'client' AND e.client_id = _rule.client_id)
          OR (_rule.scope = 'endpoint' AND e.id = _rule.endpoint_id))
    LOOP
      _triggered := false;
      _value := NULL;

      IF _rule.metric = 'cpu' THEN _value := _ep.cpu_usage;
      ELSIF _rule.metric = 'ram' THEN _value := _ep.ram_usage;
      ELSIF _rule.metric = 'disk' THEN _value := _ep.disk_usage;
      ELSIF _rule.metric = 'offline' THEN
        IF _ep.last_heartbeat IS NULL
           OR _ep.last_heartbeat < now() - (_rule.duration_minutes || ' minutes')::interval THEN
          _triggered := true;
          _value := EXTRACT(EPOCH FROM (now() - COALESCE(_ep.last_heartbeat, _ep.created_at))) / 60;
        END IF;
      END IF;

      IF _rule.metric <> 'offline' AND _value IS NOT NULL THEN
        _triggered := CASE _rule.comparator
          WHEN 'gt' THEN _value > _rule.threshold
          WHEN 'gte' THEN _value >= _rule.threshold
          WHEN 'lt' THEN _value < _rule.threshold
          WHEN 'lte' THEN _value <= _rule.threshold
        END;
      END IF;

      IF _triggered THEN
        _msg := _ep.hostname || ' — ' || _rule.name;
        INSERT INTO public.alerts (tenant_id, rule_id, endpoint_id, client_id, metric, severity, value, threshold, message)
        VALUES (_tenant, _rule.id, _ep.id, _ep.client_id, _rule.metric, _rule.severity, _value, _rule.threshold, _msg)
        ON CONFLICT (rule_id, endpoint_id) WHERE status <> 'resolved'
          DO UPDATE SET value = EXCLUDED.value, severity = EXCLUDED.severity, updated_at = now();
        _count := _count + 1;
      ELSE
        UPDATE public.alerts
          SET status = 'resolved', resolved_at = now(), updated_at = now()
          WHERE rule_id = _rule.id AND endpoint_id = _ep.id AND status <> 'resolved';
      END IF;
    END LOOP;
  END LOOP;

  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.evaluate_alert_rules() TO authenticated;
