
-- 1. Add 'power' to automation_kind enum
ALTER TYPE public.automation_kind ADD VALUE IF NOT EXISTS 'power';

-- 2. Add columns for power automations
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS power_action public.endpoint_command_type,
  ADD COLUMN IF NOT EXISTS power_delay_seconds integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS power_message text;

-- 3. Cron matcher helper. Supports: '*' or comma list of integers / ranges (a-b) / steps (*/n) for each field.
CREATE OR REPLACE FUNCTION public.cron_field_matches(_field text, _value integer)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _part text;
  _a int; _b int; _step int;
BEGIN
  IF _field = '*' THEN RETURN true; END IF;
  FOREACH _part IN ARRAY string_to_array(_field, ',') LOOP
    -- step like */5 or 0-30/5
    IF _part LIKE '%/%' THEN
      _step := (split_part(_part, '/', 2))::int;
      IF split_part(_part, '/', 1) = '*' THEN
        IF _value % _step = 0 THEN RETURN true; END IF;
      ELSIF split_part(_part, '/', 1) LIKE '%-%' THEN
        _a := split_part(split_part(_part, '/', 1), '-', 1)::int;
        _b := split_part(split_part(_part, '/', 1), '-', 2)::int;
        IF _value BETWEEN _a AND _b AND (_value - _a) % _step = 0 THEN RETURN true; END IF;
      END IF;
    ELSIF _part LIKE '%-%' THEN
      _a := split_part(_part, '-', 1)::int;
      _b := split_part(_part, '-', 2)::int;
      IF _value BETWEEN _a AND _b THEN RETURN true; END IF;
    ELSE
      IF _part::int = _value THEN RETURN true; END IF;
    END IF;
  END LOOP;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.cron_matches(_expr text, _ts timestamptz)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _parts text[];
  _min int; _hour int; _dom int; _mon int; _dow int;
BEGIN
  IF _expr IS NULL OR length(trim(_expr)) = 0 THEN RETURN false; END IF;
  _parts := regexp_split_to_array(trim(_expr), '\s+');
  IF array_length(_parts, 1) <> 5 THEN RETURN false; END IF;
  _min  := extract(minute from _ts)::int;
  _hour := extract(hour   from _ts)::int;
  _dom  := extract(day    from _ts)::int;
  _mon  := extract(month  from _ts)::int;
  _dow  := extract(dow    from _ts)::int; -- 0=Sun..6=Sat
  RETURN public.cron_field_matches(_parts[1], _min)
     AND public.cron_field_matches(_parts[2], _hour)
     AND public.cron_field_matches(_parts[3], _dom)
     AND public.cron_field_matches(_parts[4], _mon)
     AND public.cron_field_matches(_parts[5], _dow);
END;
$$;

-- 4. Replace run_automation to support 'power' kind
CREATE OR REPLACE FUNCTION public.run_automation(_automation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
  _auto RECORD;
  _ep RECORD;
  _count INTEGER := 0;
  _caller UUID;
  _is_scheduled BOOLEAN := false;
BEGIN
  _caller := auth.uid();

  -- Allow being called from scheduled runner (no auth context)
  IF _caller IS NULL THEN
    _is_scheduled := true;
    SELECT tenant_id INTO _tenant FROM public.automations WHERE id = _automation_id;
  ELSE
    _tenant := public.get_user_tenant(_caller);
    IF _tenant IS NULL THEN RETURN 0; END IF;
    IF NOT (public.has_role(_caller, 'admin') OR public.has_role(_caller, 'technician')) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  SELECT * INTO _auto FROM public.automations
    WHERE id = _automation_id AND tenant_id = _tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'automation not found'; END IF;

  FOR _ep IN
    SELECT e.* FROM public.endpoints e
    WHERE e.tenant_id = _tenant
      AND (_auto.scope = 'all'
        OR (_auto.scope = 'client'   AND e.client_id = _auto.client_id)
        OR (_auto.scope = 'endpoint' AND e.id = _auto.endpoint_id))
  LOOP
    IF _auto.kind = 'power' AND _auto.power_action IS NOT NULL THEN
      -- Enqueue the real power command for the agent
      INSERT INTO public.endpoint_commands (tenant_id, endpoint_id, command, params)
      VALUES (_tenant, _ep.id, _auto.power_action,
        jsonb_build_object(
          'delay_seconds', COALESCE(_auto.power_delay_seconds, 30),
          'message', COALESCE(_auto.power_message, ''),
          'automation_id', _auto.id
        ));

      INSERT INTO public.automation_runs
        (tenant_id, automation_id, endpoint_id, client_id, status,
         triggered_by, trigger_source, exit_code, output, duration_ms,
         started_at, finished_at)
      VALUES
        (_tenant, _auto.id, _ep.id, _ep.client_id, 'success',
         _caller,
         CASE WHEN _is_scheduled THEN 'schedule' ELSE 'manual' END,
         0,
         'Power command ' || _auto.power_action || ' queued for ' || _ep.hostname,
         50, now(), now());
    ELSE
      -- Legacy simulated script/task run
      INSERT INTO public.automation_runs
        (tenant_id, automation_id, endpoint_id, client_id, status,
         triggered_by, trigger_source, exit_code, output, duration_ms,
         started_at, finished_at)
      VALUES
        (_tenant, _auto.id, _ep.id, _ep.client_id, 'success',
         _caller,
         CASE WHEN _is_scheduled THEN 'schedule' ELSE 'manual' END,
         0,
         'Simulated run on ' || _ep.hostname || E'\n' || left(COALESCE(_auto.code, ''), 400),
         (random() * 4000 + 500)::int,
         now(), now() + interval '1 second');
    END IF;
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

-- 5. Scheduled runner: invoked every minute by pg_cron
CREATE OR REPLACE FUNCTION public.run_scheduled_automations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _a RECORD;
  _total INTEGER := 0;
  _now timestamptz := date_trunc('minute', now());
BEGIN
  FOR _a IN
    SELECT id, cron_expr FROM public.automations
    WHERE enabled = true AND trigger = 'schedule' AND cron_expr IS NOT NULL
  LOOP
    IF public.cron_matches(_a.cron_expr, _now) THEN
      BEGIN
        _total := _total + public.run_automation(_a.id);
      EXCEPTION WHEN OTHERS THEN
        -- swallow per-automation errors so one bad row doesn't block others
        NULL;
      END;
    END IF;
  END LOOP;
  RETURN _total;
END;
$$;

-- 6. Ensure pg_cron is enabled and schedule the runner every minute
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule if already exists (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('run-scheduled-automations');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'run-scheduled-automations',
  '* * * * *',
  $$SELECT public.run_scheduled_automations();$$
);
