
-- Allow admins to manage user roles within their own tenant
CREATE POLICY "Admins manage tenant roles - insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage tenant roles - update" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage tenant roles - delete" ON public.user_roles
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- Allow admins to update their tenant info (name)
CREATE POLICY "Admins update own tenant" ON public.tenants
  FOR UPDATE TO authenticated
  USING (id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'admin'));
