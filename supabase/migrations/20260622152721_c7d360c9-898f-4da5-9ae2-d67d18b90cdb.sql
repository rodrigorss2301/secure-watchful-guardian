
-- A2/A6: campos novos em endpoints e métricas
ALTER TABLE public.endpoint_metric_samples
  ADD COLUMN IF NOT EXISTS gateway_rtt_ms NUMERIC;

ALTER TABLE public.endpoints
  ADD COLUMN IF NOT EXISTS os_last_update_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_updates JSONB DEFAULT '[]'::jsonb;

-- B1: canais de notificação
CREATE TYPE public.notification_channel_kind AS ENUM ('email','webhook','slack','teams','whatsapp');

CREATE TABLE public.notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind public.notification_channel_kind NOT NULL,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_channels TO authenticated;
GRANT ALL ON public.notification_channels TO service_role;
ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read channels" ON public.notification_channels FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "admins manage channels" ON public.notification_channels FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));
CREATE TRIGGER trg_notification_channels_updated BEFORE UPDATE ON public.notification_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.alert_rules
  ADD COLUMN IF NOT EXISTS channel_ids UUID[] DEFAULT '{}'::uuid[];

-- B2/B3: templates de automação e aprovação
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE public.automation_approval_status AS ENUM ('pending','approved','rejected');

CREATE TABLE public.automation_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  requested_by UUID,
  approved_by UUID,
  status public.automation_approval_status NOT NULL DEFAULT 'pending',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_approvals TO authenticated;
GRANT ALL ON public.automation_approvals TO service_role;
ALTER TABLE public.automation_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read approvals" ON public.automation_approvals FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "staff insert approvals" ON public.automation_approvals FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));
CREATE POLICY "admins decide approvals" ON public.automation_approvals FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(),'admin'));

-- C1: WhatsApp opt-in no contato
ALTER TABLE public.client_contacts
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_client_contacts_phone ON public.client_contacts(phone);

-- C3: log de mensagens WhatsApp
CREATE TYPE public.whatsapp_direction AS ENUM ('inbound','outbound');
CREATE TYPE public.whatsapp_status AS ENUM ('pending','sent','delivered','failed','received');

CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  direction public.whatsapp_direction NOT NULL,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  status public.whatsapp_status NOT NULL DEFAULT 'pending',
  provider_sid TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read whatsapp" ON public.whatsapp_messages FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));

-- B2: seed da biblioteca de scripts prontos (templates compartilhados via tenant_id = NULL? Não — tabela exige tenant. Marcamos como template sem scope; cada tenant clona.)
-- Como automations.tenant_id é NOT NULL, criamos por tenant on-demand via UI. Em vez disso, criamos uma tabela de catálogo global.
CREATE TABLE public.automation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  kind public.automation_kind NOT NULL,
  language public.automation_language,
  code TEXT,
  power_action TEXT,
  tags TEXT[] DEFAULT '{}',
  destructive BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.automation_templates TO authenticated, anon;
GRANT ALL ON public.automation_templates TO service_role;
ALTER TABLE public.automation_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates public read" ON public.automation_templates FOR SELECT USING (true);

INSERT INTO public.automation_templates (name, description, kind, language, code, destructive, tags) VALUES
('Limpar %TEMP% (Windows)', 'Remove arquivos temporários do usuário e do sistema.', 'script', 'powershell',
$$Get-ChildItem -Path $env:TEMP -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path "$env:WINDIR\Temp" -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "TEMP cleaned"$$, false, ARRAY['windows','limpeza']),
('Flush DNS', 'Limpa o cache de DNS do Windows.', 'script', 'powershell', 'ipconfig /flushdns', false, ARRAY['windows','rede']),
('Reiniciar Spooler', 'Reinicia o serviço de impressão.', 'script', 'powershell',
'Restart-Service -Name Spooler -Force; Get-Service Spooler', false, ARRAY['windows','impressao']),
('Forçar gpupdate /force', 'Atualiza políticas de grupo.', 'script', 'powershell', 'gpupdate /force', false, ARRAY['windows','dominio']),
('Windows Update (install)', 'Instala atualizações pendentes via PSWindowsUpdate.', 'script', 'powershell',
'if (-not (Get-Module -ListAvailable PSWindowsUpdate)) { Install-Module PSWindowsUpdate -Force -Scope AllUsers }
Import-Module PSWindowsUpdate
Get-WindowsUpdate -Install -AcceptAll -AutoReboot:$false', true, ARRAY['windows','update']),
('Coletar Event Viewer (System)', 'Últimos 200 eventos de erro do log System.', 'script', 'powershell',
'Get-EventLog -LogName System -EntryType Error -Newest 200 | Format-Table -AutoSize | Out-String', false, ARRAY['windows','diagnostico']),
('Limpar lixeira', 'Esvazia a lixeira de todos os usuários.', 'script', 'powershell',
'Clear-RecycleBin -Force -ErrorAction SilentlyContinue; Write-Output "Recycle bin cleared"', true, ARRAY['windows','limpeza']),
('Reiniciar serviço (param NAME)', 'Reinicia serviço pelo nome (edite NAME antes).', 'script', 'powershell',
'$svc = "NAME"; Restart-Service -Name $svc -Force; Get-Service $svc', false, ARRAY['windows','servicos']);

-- A4: detecção de anomalia simples
CREATE OR REPLACE FUNCTION public.detect_metric_anomalies()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r RECORD;
  _count INT := 0;
  _avg NUMERIC; _stddev NUMERIC; _latest NUMERIC;
  _metric TEXT;
BEGIN
  FOR _r IN SELECT id, tenant_id, hostname FROM public.endpoints WHERE last_heartbeat > now() - interval '15 minutes' LOOP
    FOREACH _metric IN ARRAY ARRAY['cpu','ram','disk'] LOOP
      EXECUTE format(
        'SELECT avg(%I), stddev_samp(%I) FROM public.endpoint_metric_samples
         WHERE endpoint_id = $1 AND sampled_at > now() - interval ''24 hours''',
        _metric||'_usage', _metric||'_usage'
      ) INTO _avg, _stddev USING _r.id;

      EXECUTE format('SELECT %I FROM public.endpoints WHERE id = $1', _metric||'_usage')
        INTO _latest USING _r.id;

      IF _latest IS NOT NULL AND _avg IS NOT NULL AND _stddev IS NOT NULL
         AND _stddev > 3 AND _latest > _avg + 2 * _stddev AND _latest > 60 THEN
        INSERT INTO public.alerts (tenant_id, endpoint_id, client_id, metric, severity, value, threshold, message, status)
        SELECT _r.tenant_id, _r.id, e.client_id, _metric, 'warning', _latest, _avg + 2 * _stddev,
               _r.hostname || ' — anomalia em ' || _metric || ' (' || round(_latest,1) || '% vs média ' || round(_avg,1) || '%)',
               'open'
        FROM public.endpoints e WHERE e.id = _r.id
        ON CONFLICT DO NOTHING;
        _count := _count + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN _count;
END;
$$;

-- B3: substitui run_automation para respeitar requires_approval
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

  -- Se requer aprovação e ninguém aprovou recentemente, cria pedido e retorna 0
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
        OR (_auto.scope = 'client' AND e.client_id = _auto.client_id)
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
    ELSE
      INSERT INTO public.automation_runs (tenant_id, automation_id, endpoint_id, client_id, status,
         triggered_by, trigger_source, exit_code, output, duration_ms, started_at, finished_at)
      VALUES (_tenant, _auto.id, _ep.id, _ep.client_id, 'success', _caller,
        CASE WHEN _is_scheduled THEN 'schedule' ELSE 'manual' END, 0,
        'Simulated run on ' || _ep.hostname || E'\n' || left(COALESCE(_auto.code, ''), 400),
        (random() * 4000 + 500)::int, now(), now() + interval '1 second');
    END IF;
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$$;

-- Função para aprovar pedido (e disparar a automação)
CREATE OR REPLACE FUNCTION public.approve_automation(_approval_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _appr RECORD; _tenant UUID; _ran INT;
BEGIN
  _tenant := public.get_user_tenant(auth.uid());
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.automation_approvals
    SET status='approved', approved_by=auth.uid(), decided_at=now()
    WHERE id=_approval_id AND tenant_id=_tenant AND status='pending'
    RETURNING * INTO _appr;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found or already decided'; END IF;
  SELECT public.run_automation(_appr.automation_id) INTO _ran;
  RETURN _ran;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_automation(_approval_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _tenant UUID;
BEGIN
  _tenant := public.get_user_tenant(auth.uid());
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.automation_approvals
    SET status='rejected', approved_by=auth.uid(), decided_at=now(), reason=COALESCE(_reason, reason)
    WHERE id=_approval_id AND tenant_id=_tenant AND status='pending';
END;
$$;
