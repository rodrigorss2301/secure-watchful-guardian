-- =============================================================================
-- Correção: auditoria de endpoints inflando o banco (~1 GB/dia)
--
-- Causa: log_audit_event() gravava to_jsonb(OLD) + to_jsonb(NEW) — a linha
-- inteira, duas vezes — em TODO update. Os agentes mandam heartbeat a cada
-- 60 segundos e cada heartbeat reescreve o inventário completo do endpoint
-- (processos em execução, serviços, software instalado). Dá ~30 kB de
-- auditoria por heartbeat, ~1 GB por dia com 25 endpoints.
--
-- Correção, em duas partes:
--   1. Em UPDATE, gravar apenas os campos que mudaram, não a linha inteira.
--      INSERT e DELETE continuam guardando tudo.
--   2. Ignorar as colunas escritas por máquina. A lista é POR TABELA — em
--      endpoints o "status" é derivado do agente e é ruído, mas em tickets
--      o "status" é ação humana e precisa ser auditado.
--
-- As mudanças de inventário já têm histórico próprio em
-- endpoint_inventory_history, gravado pelo gatilho trg_endpoints_log_inventory.
-- Duplicá-las na auditoria nunca acrescentou informação.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.log_audit_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tenant UUID;
  _entity UUID;
  _summary TEXT;
  _actor_email TEXT;
  _actor UUID;
  _oldj JSONB;
  _newj JSONB;
  _old JSONB;
  _new JSONB;
  _changed TEXT[];
  _noise TEXT[];

  -- Ruído em qualquer tabela.
  _noise_all CONSTANT TEXT[] := ARRAY['updated_at'];

  -- Colunas de endpoints escritas pelo agente a cada heartbeat.
  _noise_endpoints CONSTANT TEXT[] := ARRAY[
    -- telemetria
    'last_heartbeat','last_seen_ip','status','cpu_usage','ram_usage','disk_usage',
    'agent_cpu_pct','agent_ram_mb','agent_heartbeat_duration_ms','agent_queue_size',
    'agent_last_error','agent_last_error_at','agent_version','os_version',
    'tailscale_ip','os_last_update_at','inventory_updated_at',
    -- inventário (já versionado em endpoint_inventory_history)
    'cpu_model','cpu_cores','cpu_threads','ram_total_mb','gpu','manufacturer','model',
    'serial_number','motherboard','bios_vendor','bios_version','bios_date','uptime_seconds',
    'last_boot_at','timezone','domain','logged_user','public_ip','gateway','dns_servers',
    'disks','network_interfaces','installed_software','running_processes','services',
    'pending_updates'
  ];
BEGIN
  _actor := auth.uid();

  IF TG_OP = 'DELETE' THEN
    _oldj   := to_jsonb(OLD);
    _tenant := (_oldj->>'tenant_id')::UUID;
    _entity := (_oldj->>'id')::UUID;
    _old    := _oldj;
    _new    := NULL;
    _summary := COALESCE(_oldj->>'name', _oldj->>'hostname', _oldj->>'title', _entity::text);

  ELSIF TG_OP = 'INSERT' THEN
    _newj   := to_jsonb(NEW);
    _tenant := (_newj->>'tenant_id')::UUID;
    _entity := (_newj->>'id')::UUID;
    _old    := NULL;
    _new    := _newj;
    _summary := COALESCE(_newj->>'name', _newj->>'hostname', _newj->>'title', _entity::text);

  ELSE
    _oldj   := to_jsonb(OLD);
    _newj   := to_jsonb(NEW);
    _tenant := (_newj->>'tenant_id')::UUID;
    _entity := (_newj->>'id')::UUID;
    _summary := COALESCE(_newj->>'name', _newj->>'hostname', _newj->>'title', _entity::text);

    _noise := _noise_all;
    IF TG_TABLE_NAME = 'endpoints' THEN
      _noise := _noise || _noise_endpoints;
    END IF;

    SELECT array_agg(n.key) INTO _changed
    FROM jsonb_each(_newj) n
    WHERE NOT (n.key = ANY(_noise))
      AND (_oldj -> n.key) IS DISTINCT FROM n.value;

    -- Só mudou coisa de máquina: nada a auditar.
    IF _changed IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT jsonb_object_agg(k, COALESCE(_oldj -> k, 'null'::jsonb)) INTO _old FROM unnest(_changed) k;
    SELECT jsonb_object_agg(k, COALESCE(_newj -> k, 'null'::jsonb)) INTO _new FROM unnest(_changed) k;
  END IF;

  IF _tenant IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT email INTO _actor_email FROM public.profiles WHERE id = _actor;

  INSERT INTO public.audit_logs(
    tenant_id, actor_id, actor_email, action,
    entity_table, entity_id, summary, old_values, new_values
  )
  VALUES (
    _tenant, _actor, _actor_email, lower(TG_OP),
    TG_TABLE_NAME, _entity, _summary, _old, _new
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;
