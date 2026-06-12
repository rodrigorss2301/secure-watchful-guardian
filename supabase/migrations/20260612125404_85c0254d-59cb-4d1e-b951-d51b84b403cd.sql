
-- Enums
CREATE TYPE public.automation_kind AS ENUM ('script', 'task');
CREATE TYPE public.automation_language AS ENUM ('powershell', 'bash', 'python');
CREATE TYPE public.automation_trigger AS ENUM ('manual', 'schedule', 'alert');
CREATE TYPE public.automation_scope AS ENUM ('all', 'client', 'endpoint');
CREATE TYPE public.automation_run_status AS ENUM ('queued', 'running', 'success', 'failed', 'cancelled');

-- automations
CREATE TABLE public.automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  kind public.automation_kind NOT NULL DEFAULT 'script',
  language public.automation_language NOT NULL DEFAULT 'powershell',
  code TEXT NOT NULL DEFAULT '',
  trigger public.automation_trigger NOT NULL DEFAULT 'manual',
  cron_expr TEXT,
  scope public.automation_scope NOT NULL DEFAULT 'all',
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  endpoint_id UUID REFERENCES public.endpoints(id) ON DELETE CASCADE,
  notify_email TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automations TO authenticated;
GRANT ALL ON public.automations TO service_role;

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view automations" ON public.automations
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Staff insert automations" ON public.automations
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
              AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician')));

CREATE POLICY "Staff update automations" ON public.automations
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
         AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician')))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
              AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician')));

CREATE POLICY "Admins delete automations" ON public.automations
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER automations_updated_at
  BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- automation_runs
CREATE TABLE public.automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  endpoint_id UUID REFERENCES public.endpoints(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  status public.automation_run_status NOT NULL DEFAULT 'queued',
  triggered_by UUID,
  trigger_source public.automation_trigger NOT NULL DEFAULT 'manual',
  exit_code INTEGER,
  output TEXT,
  error TEXT,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_runs TO authenticated;
GRANT ALL ON public.automation_runs TO service_role;

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view runs" ON public.automation_runs
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Staff insert runs" ON public.automation_runs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
              AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician')));

CREATE POLICY "Staff update runs" ON public.automation_runs
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
         AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician')))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
              AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician')));

CREATE INDEX automation_runs_automation_idx ON public.automation_runs (automation_id, started_at DESC);
CREATE INDEX automations_tenant_idx ON public.automations (tenant_id);

-- Helper function: simulate execution of an automation (manual run).
-- In a real agent, the endpoint would pick up queued runs and report results.
-- This SECURITY DEFINER fn picks targets by scope and produces a fake successful
-- run row so the UI demonstrates the full flow end-to-end.
CREATE OR REPLACE FUNCTION public.run_automation(_automation_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
  _auto RECORD;
  _ep RECORD;
  _count INTEGER := 0;
BEGIN
  _tenant := public.get_user_tenant(auth.uid());
  IF _tenant IS NULL THEN RETURN 0; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO _auto FROM public.automations
    WHERE id = _automation_id AND tenant_id = _tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'automation not found'; END IF;

  FOR _ep IN
    SELECT e.* FROM public.endpoints e
    WHERE e.tenant_id = _tenant
      AND (_auto.scope = 'all'
        OR (_auto.scope = 'client' AND e.client_id = _auto.client_id)
        OR (_auto.scope = 'endpoint' AND e.id = _auto.endpoint_id))
  LOOP
    INSERT INTO public.automation_runs
      (tenant_id, automation_id, endpoint_id, client_id, status,
       triggered_by, trigger_source, exit_code, output, duration_ms,
       started_at, finished_at)
    VALUES
      (_tenant, _auto.id, _ep.id, _ep.client_id, 'success',
       auth.uid(), 'manual', 0,
       'Simulated run on ' || _ep.hostname || E'\n' || left(_auto.code, 400),
       (random() * 4000 + 500)::int,
       now(), now() + interval '1 second');
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;
