
-- 1) automation_approvals: exclude portal users
DROP POLICY IF EXISTS "tenant read approvals" ON public.automation_approvals;
CREATE POLICY "tenant read approvals" ON public.automation_approvals
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND NOT public.has_role(auth.uid(), 'portal'::public.app_role)
  );

-- 2) endpoint_command_logs: scope portal by client
DROP POLICY IF EXISTS "tenant members read command logs" ON public.endpoint_command_logs;
CREATE POLICY "tenant members read command logs" ON public.endpoint_command_logs
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (
      NOT public.has_role(auth.uid(), 'portal'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.endpoints e
        WHERE e.id = endpoint_command_logs.endpoint_id
          AND e.client_id = public.get_user_client(auth.uid())
      )
    )
  );

-- 3) notification_channels: exclude portal users
DROP POLICY IF EXISTS "tenant read channels" ON public.notification_channels;
CREATE POLICY "tenant read channels" ON public.notification_channels
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND NOT public.has_role(auth.uid(), 'portal'::public.app_role)
  );

-- 4) tenants.command_signing_key: hide from app roles entirely
REVOKE SELECT ON public.tenants FROM authenticated, anon;
GRANT SELECT (id, name, slug, created_at) ON public.tenants TO authenticated;

-- 5) endpoint_outages: restrict policy role to authenticated
DROP POLICY IF EXISTS "tenant members read outages" ON public.endpoint_outages;
CREATE POLICY "tenant members read outages" ON public.endpoint_outages
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (
      NOT public.has_role(auth.uid(), 'portal'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.endpoints e
        WHERE e.id = endpoint_outages.endpoint_id
          AND e.client_id = public.get_user_client(auth.uid())
      )
    )
  );

-- 6) Revoke anon EXECUTE on SECURITY DEFINER function used by backend only
REVOKE EXECUTE ON FUNCTION public.get_latest_agent_release(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_latest_agent_release(text) TO authenticated, service_role;
