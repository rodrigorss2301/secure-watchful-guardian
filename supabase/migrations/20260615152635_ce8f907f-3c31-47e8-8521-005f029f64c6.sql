
-- ============ clients: portal só vê o próprio ============
DROP POLICY IF EXISTS "Tenant members view clients" ON public.clients;
CREATE POLICY "Tenant members view clients" ON public.clients
FOR SELECT TO authenticated
USING (
  tenant_id = public.get_user_tenant(auth.uid())
  AND (NOT public.has_role(auth.uid(), 'portal'::app_role)
       OR id = public.get_user_client(auth.uid()))
);

-- ============ client_contacts: portal só vê do próprio cliente ============
DROP POLICY IF EXISTS "Tenant members view contacts" ON public.client_contacts;
CREATE POLICY "Tenant members view contacts" ON public.client_contacts
FOR SELECT TO authenticated
USING (
  tenant_id = public.get_user_tenant(auth.uid())
  AND (NOT public.has_role(auth.uid(), 'portal'::app_role)
       OR client_id = public.get_user_client(auth.uid()))
);

-- ============ endpoints: portal só vê do próprio cliente ============
DROP POLICY IF EXISTS "Tenant members view endpoints" ON public.endpoints;
CREATE POLICY "Tenant members view endpoints" ON public.endpoints
FOR SELECT TO authenticated
USING (
  tenant_id = public.get_user_tenant(auth.uid())
  AND (NOT public.has_role(auth.uid(), 'portal'::app_role)
       OR client_id = public.get_user_client(auth.uid()))
);

-- ============ alerts: portal só vê do próprio cliente ============
DROP POLICY IF EXISTS "tenant members view alerts" ON public.alerts;
CREATE POLICY "tenant members view alerts" ON public.alerts
FOR SELECT TO authenticated
USING (
  tenant_id = public.get_user_tenant(auth.uid())
  AND (NOT public.has_role(auth.uid(), 'portal'::app_role)
       OR client_id = public.get_user_client(auth.uid()))
);

-- ============ alert_rules: portal só vê do próprio cliente ============
DROP POLICY IF EXISTS "tenant members view alert_rules" ON public.alert_rules;
CREATE POLICY "tenant members view alert_rules" ON public.alert_rules
FOR SELECT TO authenticated
USING (
  tenant_id = public.get_user_tenant(auth.uid())
  AND (NOT public.has_role(auth.uid(), 'portal'::app_role)
       OR client_id = public.get_user_client(auth.uid())
       OR scope = 'all'::alert_scope AND false) -- portal não vê regras globais
);

-- ============ invoices: portal só vê as do próprio cliente ============
DROP POLICY IF EXISTS "Tenant view invoices" ON public.invoices;
CREATE POLICY "Tenant view invoices" ON public.invoices
FOR SELECT TO authenticated
USING (
  tenant_id = public.get_user_tenant(auth.uid())
  AND (NOT public.has_role(auth.uid(), 'portal'::app_role)
       OR client_id = public.get_user_client(auth.uid()))
);

-- ============ invoice_items: escopo via parent invoice ============
DROP POLICY IF EXISTS "Tenant view invoice items" ON public.invoice_items;
CREATE POLICY "Tenant view invoice items" ON public.invoice_items
FOR SELECT TO authenticated
USING (
  tenant_id = public.get_user_tenant(auth.uid())
  AND (NOT public.has_role(auth.uid(), 'portal'::app_role)
       OR EXISTS (
         SELECT 1 FROM public.invoices i
         WHERE i.id = invoice_items.invoice_id
           AND i.client_id = public.get_user_client(auth.uid())
       ))
);

-- ============ contracts: portal só vê os do próprio cliente ============
DROP POLICY IF EXISTS "Tenant view contracts" ON public.contracts;
CREATE POLICY "Tenant view contracts" ON public.contracts
FOR SELECT TO authenticated
USING (
  tenant_id = public.get_user_tenant(auth.uid())
  AND (NOT public.has_role(auth.uid(), 'portal'::app_role)
       OR client_id = public.get_user_client(auth.uid()))
);

-- ============ contract_items: escopo via parent contract ============
DROP POLICY IF EXISTS "Tenant view contract items" ON public.contract_items;
CREATE POLICY "Tenant view contract items" ON public.contract_items
FOR SELECT TO authenticated
USING (
  tenant_id = public.get_user_tenant(auth.uid())
  AND (NOT public.has_role(auth.uid(), 'portal'::app_role)
       OR EXISTS (
         SELECT 1 FROM public.contracts c
         WHERE c.id = contract_items.contract_id
           AND c.client_id = public.get_user_client(auth.uid())
       ))
);

-- ============ service_catalog: escondido do portal ============
DROP POLICY IF EXISTS "Tenant view services" ON public.service_catalog;
CREATE POLICY "Tenant view services" ON public.service_catalog
FOR SELECT TO authenticated
USING (
  tenant_id = public.get_user_tenant(auth.uid())
  AND NOT public.has_role(auth.uid(), 'portal'::app_role)
);

-- ============ agent_enrollments: só admin/técnico podem ler tokens ============
DROP POLICY IF EXISTS "Tenant members read enrollments" ON public.agent_enrollments;
CREATE POLICY "Staff read enrollments" ON public.agent_enrollments
FOR SELECT TO authenticated
USING (
  tenant_id = public.get_user_tenant(auth.uid())
  AND (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'technician'::app_role))
);

-- ============ automations: scripts só para admin/técnico ============
DROP POLICY IF EXISTS "Tenant members view automations" ON public.automations;
CREATE POLICY "Staff view automations" ON public.automations
FOR SELECT TO authenticated
USING (
  tenant_id = public.get_user_tenant(auth.uid())
  AND (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'technician'::app_role))
);

-- ============ user_roles: alvo deve pertencer ao mesmo tenant ============
DROP POLICY IF EXISTS "Admins manage tenant roles - insert" ON public.user_roles;
CREATE POLICY "Admins manage tenant roles - insert" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.get_user_tenant(auth.uid())
  AND public.has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_roles.user_id
      AND p.tenant_id = public.get_user_tenant(auth.uid())
  )
);

DROP POLICY IF EXISTS "Admins manage tenant roles - update" ON public.user_roles;
CREATE POLICY "Admins manage tenant roles - update" ON public.user_roles
FOR UPDATE TO authenticated
USING (
  tenant_id = public.get_user_tenant(auth.uid())
  AND public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  tenant_id = public.get_user_tenant(auth.uid())
  AND public.has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_roles.user_id
      AND p.tenant_id = public.get_user_tenant(auth.uid())
  )
);
