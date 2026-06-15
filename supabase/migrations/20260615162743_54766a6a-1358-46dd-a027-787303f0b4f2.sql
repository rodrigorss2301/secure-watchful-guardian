
REVOKE SELECT (agent_token) ON public.endpoints FROM authenticated;

DROP POLICY IF EXISTS "Tenant members view runs" ON public.automation_runs;
CREATE POLICY "Tenant members view runs" ON public.automation_runs
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant(auth.uid())
         AND NOT has_role(auth.uid(), 'portal'::app_role));

DROP POLICY IF EXISTS "tenant members read commands" ON public.endpoint_commands;
CREATE POLICY "tenant members read commands" ON public.endpoint_commands
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_user_tenant(auth.uid())
    AND (
      NOT has_role(auth.uid(), 'portal'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.endpoints e
        WHERE e.id = endpoint_commands.endpoint_id
          AND e.client_id = get_user_client(auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "tenant members read metric samples" ON public.endpoint_metric_samples;
CREATE POLICY "tenant members read metric samples" ON public.endpoint_metric_samples
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_user_tenant(auth.uid())
    AND (
      NOT has_role(auth.uid(), 'portal'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.endpoints e
        WHERE e.id = endpoint_metric_samples.endpoint_id
          AND e.client_id = get_user_client(auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "tenant read comments" ON public.ticket_comments;
CREATE POLICY "tenant read comments" ON public.ticket_comments
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant(auth.uid())
         AND NOT has_role(auth.uid(), 'portal'::app_role));

DROP POLICY IF EXISTS "tenant read activity" ON public.ticket_activity;
CREATE POLICY "tenant read activity" ON public.ticket_activity
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_user_tenant(auth.uid())
    AND (
      NOT has_role(auth.uid(), 'portal'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id = ticket_activity.ticket_id
          AND t.client_id = get_user_client(auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "tenant read tickets" ON public.tickets;
CREATE POLICY "tenant read tickets" ON public.tickets
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant(auth.uid())
         AND NOT has_role(auth.uid(), 'portal'::app_role));

DROP POLICY IF EXISTS "Tenant members read articles" ON public.kb_articles;
CREATE POLICY "Tenant members read articles" ON public.kb_articles
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_user_tenant(auth.uid())
    AND (
      NOT has_role(auth.uid(), 'portal'::app_role)
      OR (
        status = 'published'::kb_status
        AND visibility = 'public'::kb_visibility
        AND (client_id IS NULL OR client_id = get_user_client(auth.uid()))
      )
    )
  );

DROP POLICY IF EXISTS "Tenant members view tenant profiles" ON public.profiles;
CREATE POLICY "Tenant members view tenant profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_user_tenant(auth.uid())
    AND (
      NOT has_role(auth.uid(), 'portal'::app_role)
      OR id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND status = (SELECT p.status FROM public.profiles p WHERE p.id = auth.uid())
    AND tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid())
    AND COALESCE(client_id::text, '') = COALESCE((SELECT p.client_id::text FROM public.profiles p WHERE p.id = auth.uid()), '')
    AND email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
  );
