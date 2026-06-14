CREATE TABLE public.endpoint_metric_samples (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  endpoint_id UUID NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
  sampled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cpu_usage NUMERIC,
  ram_usage NUMERIC,
  disk_usage NUMERIC
);

CREATE INDEX idx_metric_samples_endpoint_time ON public.endpoint_metric_samples (endpoint_id, sampled_at DESC);
CREATE INDEX idx_metric_samples_tenant ON public.endpoint_metric_samples (tenant_id);

GRANT SELECT ON public.endpoint_metric_samples TO authenticated;
GRANT ALL ON public.endpoint_metric_samples TO service_role;

ALTER TABLE public.endpoint_metric_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read metric samples"
ON public.endpoint_metric_samples FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant(auth.uid()));
