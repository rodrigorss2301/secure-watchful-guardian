
-- 1) Tenant-scoped has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND ur.tenant_id = public.get_user_tenant(_user_id)
  )
$$;

-- 2) user_roles: exclude portal users from listing staff roles
DROP POLICY IF EXISTS "Tenant members view tenant roles" ON public.user_roles;
CREATE POLICY "Tenant members view tenant roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  tenant_id = public.get_user_tenant(auth.uid())
  AND NOT public.has_role(auth.uid(), 'portal'::app_role)
);

-- 3) invoice_counters: staff-only read
DROP POLICY IF EXISTS "Tenant view counters" ON public.invoice_counters;
CREATE POLICY "Tenant view counters"
ON public.invoice_counters
FOR SELECT
TO authenticated
USING (
  tenant_id = public.get_user_tenant(auth.uid())
  AND NOT public.has_role(auth.uid(), 'portal'::app_role)
);

-- 4) ticket_counters: staff-only read
DROP POLICY IF EXISTS "tenant read counters" ON public.ticket_counters;
CREATE POLICY "tenant read counters"
ON public.ticket_counters
FOR SELECT
TO authenticated
USING (
  tenant_id = public.get_user_tenant(auth.uid())
  AND NOT public.has_role(auth.uid(), 'portal'::app_role)
);
