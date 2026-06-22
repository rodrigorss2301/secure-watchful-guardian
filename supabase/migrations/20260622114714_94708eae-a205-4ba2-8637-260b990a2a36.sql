
-- Tracks changes to endpoint inventory (hardware, network, software) over time.
CREATE TABLE public.endpoint_inventory_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint_id UUID NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
  category TEXT NOT NULL,          -- 'hardware' | 'network' | 'software' | 'os'
  field TEXT NOT NULL,             -- column or software name
  change_type TEXT NOT NULL,       -- 'changed' | 'added' | 'removed'
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_eih_endpoint_time ON public.endpoint_inventory_history (endpoint_id, created_at DESC);
CREATE INDEX idx_eih_tenant_time ON public.endpoint_inventory_history (tenant_id, created_at DESC);
CREATE INDEX idx_eih_category ON public.endpoint_inventory_history (endpoint_id, category, created_at DESC);

GRANT SELECT ON public.endpoint_inventory_history TO authenticated;
GRANT ALL ON public.endpoint_inventory_history TO service_role;

ALTER TABLE public.endpoint_inventory_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can read inventory history"
  ON public.endpoint_inventory_history FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

-- Trigger function: compares OLD and NEW endpoint rows and logs changes
CREATE OR REPLACE FUNCTION public.log_endpoint_inventory_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old_sw JSONB;
  _new_sw JSONB;
  _item JSONB;
  _name TEXT;
  _ver TEXT;
BEGIN
  -- Hardware scalar fields
  IF NEW.cpu_model IS DISTINCT FROM OLD.cpu_model THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'hardware','cpu_model','changed',OLD.cpu_model,NEW.cpu_model);
  END IF;
  IF NEW.cpu_cores IS DISTINCT FROM OLD.cpu_cores THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'hardware','cpu_cores','changed',OLD.cpu_cores::text,NEW.cpu_cores::text);
  END IF;
  IF NEW.ram_total_mb IS DISTINCT FROM OLD.ram_total_mb THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'hardware','ram_total_mb','changed',OLD.ram_total_mb::text,NEW.ram_total_mb::text);
  END IF;
  IF NEW.gpu IS DISTINCT FROM OLD.gpu THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'hardware','gpu','changed',OLD.gpu,NEW.gpu);
  END IF;
  IF NEW.manufacturer IS DISTINCT FROM OLD.manufacturer THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'hardware','manufacturer','changed',OLD.manufacturer,NEW.manufacturer);
  END IF;
  IF NEW.model IS DISTINCT FROM OLD.model THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'hardware','model','changed',OLD.model,NEW.model);
  END IF;
  IF NEW.serial_number IS DISTINCT FROM OLD.serial_number THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'hardware','serial_number','changed',OLD.serial_number,NEW.serial_number);
  END IF;
  IF NEW.motherboard IS DISTINCT FROM OLD.motherboard THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'hardware','motherboard','changed',OLD.motherboard,NEW.motherboard);
  END IF;
  IF NEW.bios_version IS DISTINCT FROM OLD.bios_version THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'hardware','bios_version','changed',OLD.bios_version,NEW.bios_version);
  END IF;

  -- OS
  IF NEW.os IS DISTINCT FROM OLD.os THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'os','os','changed',OLD.os,NEW.os);
  END IF;
  IF NEW.os_version IS DISTINCT FROM OLD.os_version THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'os','os_version','changed',OLD.os_version,NEW.os_version);
  END IF;

  -- Network scalars
  IF NEW.ip_address IS DISTINCT FROM OLD.ip_address THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'network','ip_address','changed',OLD.ip_address,NEW.ip_address);
  END IF;
  IF NEW.public_ip IS DISTINCT FROM OLD.public_ip THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'network','public_ip','changed',OLD.public_ip,NEW.public_ip);
  END IF;
  IF NEW.gateway IS DISTINCT FROM OLD.gateway THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'network','gateway','changed',OLD.gateway,NEW.gateway);
  END IF;
  IF NEW.mac_address IS DISTINCT FROM OLD.mac_address THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'network','mac_address','changed',OLD.mac_address,NEW.mac_address);
  END IF;
  IF NEW.tailscale_ip IS DISTINCT FROM OLD.tailscale_ip THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'network','tailscale_ip','changed',OLD.tailscale_ip,NEW.tailscale_ip);
  END IF;
  IF NEW.dns_servers IS DISTINCT FROM OLD.dns_servers THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'network','dns_servers','changed',OLD.dns_servers::text,NEW.dns_servers::text);
  END IF;
  IF NEW.network_interfaces IS DISTINCT FROM OLD.network_interfaces THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'network','interfaces','changed',
      jsonb_array_length(COALESCE(OLD.network_interfaces,'[]'::jsonb))::text || ' interfaces',
      jsonb_array_length(COALESCE(NEW.network_interfaces,'[]'::jsonb))::text || ' interfaces');
  END IF;

  -- Disks composition (sizes change ≠ usage change; we hash by name+size_gb)
  IF NEW.disks IS DISTINCT FROM OLD.disks THEN
    -- only log when count or names/sizes change, not free space
    IF (
      SELECT COALESCE(jsonb_agg(d->>'name' || ':' || COALESCE(d->>'size_gb','?') ORDER BY d->>'name'), '[]'::jsonb)
      FROM jsonb_array_elements(COALESCE(OLD.disks,'[]'::jsonb)) d
    ) IS DISTINCT FROM (
      SELECT COALESCE(jsonb_agg(d->>'name' || ':' || COALESCE(d->>'size_gb','?') ORDER BY d->>'name'), '[]'::jsonb)
      FROM jsonb_array_elements(COALESCE(NEW.disks,'[]'::jsonb)) d
    ) THEN
      INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
      VALUES (NEW.tenant_id,NEW.id,'hardware','disks','changed',
        jsonb_array_length(COALESCE(OLD.disks,'[]'::jsonb))::text || ' discos',
        jsonb_array_length(COALESCE(NEW.disks,'[]'::jsonb))::text || ' discos');
    END IF;
  END IF;

  -- Installed software diff (by name)
  IF NEW.installed_software IS DISTINCT FROM OLD.installed_software THEN
    _old_sw := COALESCE(OLD.installed_software,'[]'::jsonb);
    _new_sw := COALESCE(NEW.installed_software,'[]'::jsonb);

    -- Added
    FOR _item IN
      SELECT n FROM jsonb_array_elements(_new_sw) n
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(_old_sw) o
        WHERE lower(o->>'name') = lower(n->>'name')
      )
    LOOP
      _name := _item->>'name';
      _ver  := _item->>'version';
      IF _name IS NOT NULL THEN
        INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
        VALUES (NEW.tenant_id,NEW.id,'software',_name,'added',NULL,_ver);
      END IF;
    END LOOP;

    -- Removed
    FOR _item IN
      SELECT o FROM jsonb_array_elements(_old_sw) o
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(_new_sw) n
        WHERE lower(n->>'name') = lower(o->>'name')
      )
    LOOP
      _name := _item->>'name';
      _ver  := _item->>'version';
      IF _name IS NOT NULL THEN
        INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
        VALUES (NEW.tenant_id,NEW.id,'software',_name,'removed',_ver,NULL);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_endpoints_log_inventory
  AFTER UPDATE ON public.endpoints
  FOR EACH ROW
  EXECUTE FUNCTION public.log_endpoint_inventory_changes();

-- Retention: keep 30 days of history + 30 days of metric samples
CREATE OR REPLACE FUNCTION public.cleanup_endpoint_history()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.endpoint_inventory_history WHERE created_at < now() - interval '30 days';
  DELETE FROM public.endpoint_metric_samples    WHERE sampled_at < now() - interval '30 days';
$$;

-- Schedule daily cleanup (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('endpoint-history-cleanup');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('endpoint-history-cleanup', '15 3 * * *', $$SELECT public.cleanup_endpoint_history();$$);
