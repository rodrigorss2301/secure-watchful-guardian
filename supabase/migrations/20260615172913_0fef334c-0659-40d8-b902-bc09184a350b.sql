-- Tighten portal role exposure on alert_rules and ticket_activity

-- 1) alert_rules: remove dead `AND false` clause; portal users see nothing.
DROP POLICY IF EXISTS "tenant members view alert_rules" ON public.alert_rules;
CREATE POLICY "tenant members view alert_rules"
  ON public.alert_rules
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND NOT public.has_role(auth.uid(), 'portal'::public.app_role)
  );

-- 2) ticket_activity: split staff vs portal SELECT for clarity.
DROP POLICY IF EXISTS "tenant read activity" ON public.ticket_activity;

CREATE POLICY "staff read activity"
  ON public.ticket_activity
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND NOT public.has_role(auth.uid(), 'portal'::public.app_role)
  );

CREATE POLICY "portal read own ticket activity"
  ON public.ticket_activity
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'portal'::public.app_role)
    AND tenant_id = public.get_user_tenant(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_activity.ticket_id
        AND t.client_id = public.get_user_client(auth.uid())
    )
  );

-- 3) ticket_activity: explicit deny for UPDATE and DELETE from any authenticated role.
--    Only the service role (bypasses RLS) and the audit trigger may mutate activity rows.
DROP POLICY IF EXISTS "no client update activity" ON public.ticket_activity;
DROP POLICY IF EXISTS "no client delete activity" ON public.ticket_activity;

CREATE POLICY "no client update activity"
  ON public.ticket_activity
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "no client delete activity"
  ON public.ticket_activity
  FOR DELETE
  TO authenticated
  USING (false);
