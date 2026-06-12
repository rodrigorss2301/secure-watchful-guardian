-- ENUMS
CREATE TYPE public.billing_cycle AS ENUM ('one_time','monthly','quarterly','yearly');
CREATE TYPE public.contract_status AS ENUM ('draft','active','suspended','ended','cancelled');
CREATE TYPE public.invoice_status AS ENUM ('draft','sent','paid','overdue','void');
CREATE TYPE public.service_unit AS ENUM ('hour','month','endpoint','user','license','fixed');

-- ============ SERVICE CATALOG ============
CREATE TABLE public.service_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  unit public.service_unit NOT NULL DEFAULT 'month',
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX service_catalog_tenant_idx ON public.service_catalog(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_catalog TO authenticated;
GRANT ALL ON public.service_catalog TO service_role;

ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant view services" ON public.service_catalog FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "Staff insert services" ON public.service_catalog FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));
CREATE POLICY "Staff update services" ON public.service_catalog FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "Admins delete services" ON public.service_catalog FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(),'admin'));

-- ============ CONTRACTS ============
CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status public.contract_status NOT NULL DEFAULT 'draft',
  billing_cycle public.billing_cycle NOT NULL DEFAULT 'monthly',
  currency TEXT NOT NULL DEFAULT 'BRL',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  monthly_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX contracts_tenant_idx ON public.contracts(tenant_id);
CREATE INDEX contracts_client_idx ON public.contracts(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant view contracts" ON public.contracts FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "Staff insert contracts" ON public.contracts FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));
CREATE POLICY "Staff update contracts" ON public.contracts FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "Admins delete contracts" ON public.contracts FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(),'admin'));

-- ============ CONTRACT ITEMS ============
CREATE TABLE public.contract_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.service_catalog(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX contract_items_contract_idx ON public.contract_items(contract_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_items TO authenticated;
GRANT ALL ON public.contract_items TO service_role;

ALTER TABLE public.contract_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant view contract items" ON public.contract_items FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "Staff manage contract items" ON public.contract_items FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));

-- ============ INVOICE COUNTERS ============
CREATE TABLE public.invoice_counters (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  last_number INTEGER NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE ON public.invoice_counters TO authenticated;
GRANT ALL ON public.invoice_counters TO service_role;
ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant view counters" ON public.invoice_counters FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

-- ============ INVOICES ============
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  number TEXT NOT NULL,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL DEFAULT (CURRENT_DATE + 15),
  period_start DATE,
  period_end DATE,
  currency TEXT NOT NULL DEFAULT 'BRL',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  paid_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX invoices_tenant_idx ON public.invoices(tenant_id);
CREATE INDEX invoices_client_idx ON public.invoices(client_id);
CREATE INDEX invoices_contract_idx ON public.invoices(contract_id);
CREATE INDEX invoices_status_idx ON public.invoices(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant view invoices" ON public.invoices FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "Staff insert invoices" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));
CREATE POLICY "Staff update invoices" ON public.invoices FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "Admins delete invoices" ON public.invoices FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(),'admin'));

-- ============ INVOICE ITEMS ============
CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX invoice_items_invoice_idx ON public.invoice_items(invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant view invoice items" ON public.invoice_items FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "Staff manage invoice items" ON public.invoice_items FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));

-- ============ TRIGGERS ============
CREATE TRIGGER service_catalog_updated_at BEFORE UPDATE ON public.service_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER contracts_updated_at BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER service_catalog_audit AFTER INSERT OR UPDATE OR DELETE ON public.service_catalog
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER contracts_audit AFTER INSERT OR UPDATE OR DELETE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER invoices_audit AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- ============ INVOICE NUMBERING ============
CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INTEGER;
BEGIN
  INSERT INTO public.invoice_counters (tenant_id, last_number) VALUES (NEW.tenant_id, 1)
    ON CONFLICT (tenant_id) DO UPDATE SET last_number = invoice_counters.last_number + 1
    RETURNING last_number INTO n;
  IF NEW.number IS NULL OR NEW.number = '' THEN
    NEW.number := 'INV-' || LPAD(n::text, 5, '0');
  END IF;
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER invoices_assign_number BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_number();

-- ============ TOTALS RECALC ============
CREATE OR REPLACE FUNCTION public.recalc_invoice_totals()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _inv_id UUID; _sub NUMERIC;
BEGIN
  _inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT COALESCE(SUM(total),0) INTO _sub FROM public.invoice_items WHERE invoice_id = _inv_id;
  UPDATE public.invoices SET subtotal = _sub, total = _sub + tax, updated_at = now() WHERE id = _inv_id;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER invoice_items_recalc AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_invoice_totals();

-- ============ GENERATE INVOICE FROM CONTRACT ============
CREATE OR REPLACE FUNCTION public.generate_invoice_from_contract(
  _contract_id UUID, _period_start DATE DEFAULT NULL, _period_end DATE DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tenant UUID;
  _contract RECORD;
  _invoice_id UUID;
  _item RECORD;
  _line_total NUMERIC;
BEGIN
  _tenant := public.get_user_tenant(auth.uid());
  IF _tenant IS NULL THEN RAISE EXCEPTION 'no tenant'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO _contract FROM public.contracts WHERE id = _contract_id AND tenant_id = _tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'contract not found'; END IF;

  INSERT INTO public.invoices (tenant_id, client_id, contract_id, currency,
    period_start, period_end, due_date, notes, created_by)
  VALUES (_tenant, _contract.client_id, _contract.id, _contract.currency,
    COALESCE(_period_start, date_trunc('month', CURRENT_DATE)::date),
    COALESCE(_period_end, (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date),
    CURRENT_DATE + 15, _contract.name, auth.uid())
  RETURNING id INTO _invoice_id;

  FOR _item IN SELECT * FROM public.contract_items WHERE contract_id = _contract.id LOOP
    _line_total := _item.quantity * _item.unit_price * (1 - _item.discount_pct / 100.0);
    INSERT INTO public.invoice_items (tenant_id, invoice_id, description, quantity, unit_price, total)
    VALUES (_tenant, _invoice_id, _item.description, _item.quantity, _item.unit_price, _line_total);
  END LOOP;

  RETURN _invoice_id;
END $$;

CREATE OR REPLACE FUNCTION public.mark_invoice_paid(_invoice_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tenant UUID;
BEGIN
  _tenant := public.get_user_tenant(auth.uid());
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.invoices SET status='paid', paid_at=now(), updated_at=now()
   WHERE id=_invoice_id AND tenant_id=_tenant;
END $$;