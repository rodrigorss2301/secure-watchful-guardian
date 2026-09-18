-- Intake publico e honestidade das automacoes.
--
--   1. submit_public_ticket e chamavel direto com a chave anon, pulando a
--      validacao zod da rota de servidor: sem limite de tamanho e sem
--      throttle, qualquer um enchia a base de tickets.
--   2. run_automation gravava status 'success' para automacoes de script que
--      nunca sao executadas ("Simulated run on ..."), o que faz o historico
--      mentir sobre o que rodou na maquina do cliente.

-- ---------------------------------------------------------------------------
-- 1) Limites de tamanho e throttle no intake publico.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_public_ticket(
  _slug TEXT, _title TEXT, _description TEXT,
  _name TEXT, _email TEXT, _phone TEXT, _priority TEXT DEFAULT 'medium'
) RETURNS TABLE(ticket_id UUID, ticket_number TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _client RECORD;
  _tid UUID;
  _num TEXT;
  _mail TEXT;
BEGIN
  IF _title IS NULL OR length(trim(_title)) < 3 THEN RAISE EXCEPTION 'title too short'; END IF;
  IF _name  IS NULL OR length(trim(_name))  < 2 THEN RAISE EXCEPTION 'name required'; END IF;
  IF _email IS NULL OR _email !~ '^[^@]+@[^@]+\.[^@]+$' THEN RAISE EXCEPTION 'invalid email'; END IF;

  -- Mesmos limites que a rota /api/public/tickets/submit aplica via zod, agora
  -- tambem para quem chama o RPC diretamente.
  IF length(_title) > 200                     THEN RAISE EXCEPTION 'title too long';       END IF;
  IF length(COALESCE(_description, '')) > 5000 THEN RAISE EXCEPTION 'description too long'; END IF;
  IF length(_name) > 120                      THEN RAISE EXCEPTION 'name too long';        END IF;
  IF length(_email) > 160                     THEN RAISE EXCEPTION 'email too long';       END IF;
  IF length(COALESCE(_phone, '')) > 40        THEN RAISE EXCEPTION 'phone too long';       END IF;

  _mail := lower(trim(_email));

  SELECT c.id AS id, c.tenant_id AS tenant_id
    INTO _client
    FROM public.clients c
   WHERE c.public_intake_slug = _slug AND c.public_intake_enabled = true
   LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'intake not found'; END IF;

  IF (SELECT count(*) FROM public.tickets
       WHERE client_id = _client.id AND source = 'public_intake'
         AND submitter_email = _mail
         AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'rate limited';
  END IF;

  IF (SELECT count(*) FROM public.tickets
       WHERE client_id = _client.id AND source = 'public_intake'
         AND created_at > now() - interval '1 hour') >= 50 THEN
    RAISE EXCEPTION 'rate limited';
  END IF;

  INSERT INTO public.tickets(
    tenant_id, client_id, title, description, priority, category, source,
    submitter_name, submitter_email, submitter_phone
  ) VALUES (
    _client.tenant_id, _client.id, trim(_title), _description,
    COALESCE(NULLIF(_priority, '')::ticket_priority, 'medium'::ticket_priority),
    'request'::ticket_category, 'public_intake',
    trim(_name), _mail, NULLIF(trim(COALESCE(_phone, '')), '')
  ) RETURNING id, number INTO _tid, _num;

  RETURN QUERY SELECT _tid, _num;
END $$;

REVOKE ALL ON FUNCTION public.submit_public_ticket(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_ticket(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT)
  TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_tickets_public_intake_throttle
  ON public.tickets(client_id, submitter_email, created_at DESC)
  WHERE source = 'public_intake';

-- ---------------------------------------------------------------------------
-- 2) Automacao de script nao e executada: parar de registrar como sucesso.
-- ---------------------------------------------------------------------------
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
  _has_pending BOOLEAN;
BEGIN
  _caller := auth.uid();
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

  SELECT * INTO _auto FROM public.automations WHERE id = _automation_id AND tenant_id = _tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'automation not found'; END IF;

  IF _auto.requires_approval AND NOT _is_scheduled THEN
    SELECT EXISTS(
      SELECT 1 FROM public.automation_approvals
       WHERE automation_id = _auto.id AND status = 'approved'
         AND decided_at > now() - interval '5 minutes'
    ) INTO _has_pending;
    IF NOT _has_pending THEN
      INSERT INTO public.automation_approvals (tenant_id, automation_id, requested_by, status)
      VALUES (_tenant, _auto.id, _caller, 'pending');
      RETURN 0;
    END IF;
  END IF;

  FOR _ep IN
    SELECT e.* FROM public.endpoints e
     WHERE e.tenant_id = _tenant
       AND (_auto.scope = 'all'
         OR (_auto.scope = 'client'   AND e.client_id = _auto.client_id)
         OR (_auto.scope = 'endpoint' AND e.id = _auto.endpoint_id))
  LOOP
    IF _auto.kind = 'power' AND _auto.power_action IS NOT NULL THEN
      INSERT INTO public.endpoint_commands (tenant_id, endpoint_id, command, params)
      VALUES (_tenant, _ep.id, _auto.power_action,
        jsonb_build_object('delay_seconds', COALESCE(_auto.power_delay_seconds, 30),
          'message', COALESCE(_auto.power_message, ''), 'automation_id', _auto.id));
      INSERT INTO public.automation_runs (tenant_id, automation_id, endpoint_id, client_id, status,
         triggered_by, trigger_source, exit_code, output, duration_ms, started_at, finished_at)
      VALUES (_tenant, _auto.id, _ep.id, _ep.client_id, 'success', _caller,
        CASE WHEN _is_scheduled THEN 'schedule' ELSE 'manual' END, 0,
        'Power command ' || _auto.power_action || ' queued for ' || _ep.hostname, 50, now(), now());
      _count := _count + 1;
    ELSE
      -- Execucao remota de script ainda nao existe: o agente nao recebe nada.
      -- Registrar como falha para o historico nao afirmar que rodou.
      INSERT INTO public.automation_runs (tenant_id, automation_id, endpoint_id, client_id, status,
         triggered_by, trigger_source, exit_code, output, duration_ms, started_at, finished_at)
      VALUES (_tenant, _auto.id, _ep.id, _ep.client_id, 'failed', _caller,
        CASE WHEN _is_scheduled THEN 'schedule' ELSE 'manual' END, 1,
        'Execucao remota de script nao implementada: nenhum comando foi enviado para '
          || _ep.hostname || '.', 0, now(), now());
    END IF;
  END LOOP;

  RETURN _count;
END;
$$;
