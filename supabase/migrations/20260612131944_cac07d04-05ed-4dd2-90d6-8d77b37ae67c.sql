
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.get_user_client(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id FROM public.profiles WHERE id = _user_id
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_client(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_client(uuid) TO authenticated;

CREATE POLICY "Portal read own tickets" ON public.tickets
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'portal')
    AND tenant_id = public.get_user_tenant(auth.uid())
    AND client_id = public.get_user_client(auth.uid())
  );

CREATE POLICY "Portal create tickets" ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'portal')
    AND tenant_id = public.get_user_tenant(auth.uid())
    AND client_id = public.get_user_client(auth.uid())
  );

CREATE POLICY "Portal read own comments" ON public.ticket_comments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'portal')
    AND tenant_id = public.get_user_tenant(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id AND t.client_id = public.get_user_client(auth.uid())
    )
    AND COALESCE(internal, false) = false
  );

CREATE POLICY "Portal write own comments" ON public.ticket_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'portal')
    AND tenant_id = public.get_user_tenant(auth.uid())
    AND author_id = auth.uid()
    AND COALESCE(internal, false) = false
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id AND t.client_id = public.get_user_client(auth.uid())
    )
  );
