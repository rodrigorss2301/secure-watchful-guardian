-- Outages log for endpoint network/agent connectivity
CREATE TABLE public.endpoint_outages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint_id UUID NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  reason TEXT NOT NULL DEFAULT 'no_heartbeat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_endpoint_outages_endpoint ON public.endpoint_outages(endpoint_id, started_at DESC);
CREATE INDEX idx_endpoint_outages_open ON public.endpoint_outages(endpoint_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX uniq_endpoint_outages_open ON public.endpoint_outages(endpoint_id) WHERE ended_at IS NULL;

GRANT SELECT ON public.endpoint_outages TO authenticated;
GRANT ALL ON public.endpoint_outages TO service_role;

ALTER TABLE public.endpoint_outages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read outages"
  ON public.endpoint_outages FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

-- Detector: marks endpoints offline after 3 min without heartbeat, closes outages on return
CREATE OR REPLACE FUNCTION public.detect_endpoint_outages()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ep RECORD;
  _open RECORD;
  _count INTEGER := 0;
  _threshold INTERVAL := interval '3 minutes';
BEGIN
  -- Open outages for endpoints that went silent
  FOR _ep IN
    SELECT e.id, e.tenant_id, e.last_heartbeat
    FROM public.endpoints e
    WHERE e.last_heartbeat IS NOT NULL
      AND e.last_heartbeat < now() - _threshold
      AND NOT EXISTS (
        SELECT 1 FROM public.endpoint_outages o
        WHERE o.endpoint_id = e.id AND o.ended_at IS NULL
      )
  LOOP
    INSERT INTO public.endpoint_outages (tenant_id, endpoint_id, started_at, reason)
    VALUES (_ep.tenant_id, _ep.id, _ep.last_heartbeat, 'no_heartbeat');
    UPDATE public.endpoints SET status = 'offline' WHERE id = _ep.id AND status <> 'offline';
    _count := _count + 1;
  END LOOP;

  -- Close outages for endpoints that came back
  FOR _open IN
    SELECT o.id, o.started_at, e.last_heartbeat
    FROM public.endpoint_outages o
    JOIN public.endpoints e ON e.id = o.endpoint_id
    WHERE o.ended_at IS NULL
      AND e.last_heartbeat IS NOT NULL
      AND e.last_heartbeat > o.started_at
      AND e.last_heartbeat > now() - _threshold
  LOOP
    UPDATE public.endpoint_outages
       SET ended_at = _open.last_heartbeat,
           duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (_open.last_heartbeat - _open.started_at))::int)
     WHERE id = _open.id;
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

-- Extend retention cleanup to outages
CREATE OR REPLACE FUNCTION public.cleanup_endpoint_history()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.endpoint_inventory_history WHERE created_at < now() - interval '30 days';
  DELETE FROM public.endpoint_metric_samples    WHERE sampled_at < now() - interval '30 days';
  DELETE FROM public.endpoint_outages           WHERE COALESCE(ended_at, started_at) < now() - interval '30 days';
$$;

-- Schedule detector every minute
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'detect-endpoint-outages') THEN
    PERFORM cron.unschedule('detect-endpoint-outages');
  END IF;
  PERFORM cron.schedule(
    'detect-endpoint-outages',
    '* * * * *',
    $cron$ SELECT public.detect_endpoint_outages(); $cron$
  );
END $$;