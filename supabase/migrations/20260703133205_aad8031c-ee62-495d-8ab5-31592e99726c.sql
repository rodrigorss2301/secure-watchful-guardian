
-- 1) automation_templates: restrict to staff (admin/technician)
DROP POLICY IF EXISTS "templates authenticated read" ON public.automation_templates;
CREATE POLICY "templates staff read" ON public.automation_templates
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'));

-- 2) agent_releases: authenticated only
DROP POLICY IF EXISTS "anyone reads agent releases" ON public.agent_releases;
REVOKE SELECT ON public.agent_releases FROM anon;
CREATE POLICY "authenticated reads agent releases" ON public.agent_releases
  FOR SELECT TO authenticated
  USING (true);

-- 3) SECURITY DEFINER functions: revoke public/anon execute; keep only public intake fns callable by anon
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.get_public_intake(text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_public_ticket(text, text, text, text, text, text, text) TO anon;
