DROP POLICY "tenant members read outages" ON public.endpoint_outages;
CREATE POLICY "tenant members read outages" ON public.endpoint_outages
FOR SELECT
USING (
  tenant_id = get_user_tenant(auth.uid())
  AND (
    NOT has_role(auth.uid(), 'portal'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.endpoints e
      WHERE e.id = endpoint_outages.endpoint_id
        AND e.client_id = get_user_client(auth.uid())
    )
  )
);