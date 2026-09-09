-- ==============================================================================
-- Guardian Hub (Autotechs RMM) — schema completo
-- 46 migrations consolidadas em ordem cronológica
--
-- COMO USAR
--   1. Crie um projeto Supabase NOVO e VAZIO.
--   2. Database > Extensions: habilite  pg_cron  (obrigatório — sem ele três
--      rotinas agendadas não são criadas: automações agendadas, limpeza de
--      histórico e detecção de quedas de endpoint).
--   3. SQL Editor > New query: cole este arquivo inteiro e rode.
--   4. Confira o resultado com o bloco de verificação no rodapé.
--
-- VALIDADO em PostgreSQL 16 contra um banco vazio: aplica sem erros e produz
--   37 tabelas (todas com RLS)   102 policies
--   75 funções                    35 triggers
--   32 tipos enum                  9 RPCs usadas pelo app
--
-- ATENÇÃO: cria apenas a ESTRUTURA, nenhum dado. Restaure o dump de dados
-- depois deste arquivo, nunca antes.
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 20260612110247_44415392-785d-4320-aa12-131a180e6d07.sql
-- ─────────────────────────────────────────────────────────────────────

-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'technician', 'viewer');
CREATE TYPE public.user_status AS ENUM ('pending', 'active', 'disabled');

-- Tenants (multi-tenancy root)
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles (one per auth user)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT NOT NULL,
  avatar_url TEXT,
  status public.user_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Roles stored separately (never on profiles) to avoid privilege escalation
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, role)
);

-- Grants
GRANT SELECT ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- Helper: get current user's tenant (SECURITY DEFINER avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.get_user_tenant(_user_id UUID)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.profiles WHERE id = _user_id
$$;

-- Helper: check role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Enable RLS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Tenant policies
CREATE POLICY "Members view their tenant" ON public.tenants
FOR SELECT TO authenticated USING (id = public.get_user_tenant(auth.uid()));

-- Profiles policies
CREATE POLICY "Users view own profile" ON public.profiles
FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY "Tenant members view tenant profiles" ON public.profiles
FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Users update own profile" ON public.profiles
FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "Admins update tenant profiles" ON public.profiles
FOR UPDATE TO authenticated USING (
  tenant_id = public.get_user_tenant(auth.uid())
  AND public.has_role(auth.uid(), 'admin')
);

-- User_roles policies (read-only for tenant members; mutations via service_role/server fns)
CREATE POLICY "Tenant members view tenant roles" ON public.user_roles
FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant(auth.uid()));

-- updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Signup handler: create tenant if first user, else join existing as pending
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _company_name TEXT;
  _company_slug TEXT;
  _full_name TEXT;
  _tenant_id UUID;
  _is_new_tenant BOOLEAN := false;
BEGIN
  _company_name := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'company_name'), ''), 'My Company');
  _full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  _company_slug := lower(regexp_replace(_company_name, '[^a-zA-Z0-9]+', '-', 'g'));
  _company_slug := trim(both '-' from _company_slug);
  IF _company_slug = '' THEN _company_slug := 'company-' || substr(NEW.id::text, 1, 8); END IF;

  SELECT id INTO _tenant_id FROM public.tenants WHERE slug = _company_slug;

  IF _tenant_id IS NULL THEN
    INSERT INTO public.tenants (name, slug) VALUES (_company_name, _company_slug) RETURNING id INTO _tenant_id;
    _is_new_tenant := true;
  END IF;

  INSERT INTO public.profiles (id, tenant_id, full_name, email, status)
  VALUES (NEW.id, _tenant_id, _full_name, NEW.email,
    CASE WHEN _is_new_tenant THEN 'active'::public.user_status ELSE 'pending'::public.user_status END);

  IF _is_new_tenant THEN
    INSERT INTO public.user_roles (user_id, tenant_id, role) VALUES (NEW.id, _tenant_id, 'admin');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─────────────────────────────────────────────────────────────────────
-- 20260612110309_192d87af-1cb8-45dd-be32-84d8f8bd12c1.sql
-- ─────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_tenant(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 20260612115450_0639d52c-72df-4e30-ba3b-fd79890dce43.sql
-- ─────────────────────────────────────────────────────────────────────
-- Enums
CREATE TYPE public.client_status AS ENUM ('active', 'inactive', 'prospect');
CREATE TYPE public.sla_tier AS ENUM ('bronze', 'silver', 'gold', 'platinum');

-- Clients table
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  email TEXT,
  phone TEXT,
  address_line TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  postal_code TEXT,
  status public.client_status NOT NULL DEFAULT 'active',
  sla_tier public.sla_tier NOT NULL DEFAULT 'bronze',
  contract_start DATE,
  contract_end DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_tenant ON public.clients(tenant_id);
CREATE INDEX idx_clients_status ON public.clients(tenant_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view clients"
  ON public.clients FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Admins and technicians insert clients"
  ON public.clients FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'))
  );

CREATE POLICY "Admins and technicians update clients"
  ON public.clients FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'))
  );

CREATE POLICY "Admins delete clients"
  ON public.clients FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Client contacts table
CREATE TABLE public.client_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contacts_client ON public.client_contacts(client_id);
CREATE INDEX idx_contacts_tenant ON public.client_contacts(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_contacts TO authenticated;
GRANT ALL ON public.client_contacts TO service_role;

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view contacts"
  ON public.client_contacts FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Admins and technicians insert contacts"
  ON public.client_contacts FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'))
  );

CREATE POLICY "Admins and technicians update contacts"
  ON public.client_contacts FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'))
  );

CREATE POLICY "Admins and technicians delete contacts"
  ON public.client_contacts FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'))
  );

CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────
-- 20260612120155_9a05192f-2610-4b91-9051-303db37f9cfa.sql
-- ─────────────────────────────────────────────────────────────────────
CREATE TYPE public.endpoint_type AS ENUM ('workstation', 'server', 'mobile', 'network');
CREATE TYPE public.endpoint_status AS ENUM ('online', 'offline', 'warning', 'critical');

CREATE TABLE public.endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,
  type public.endpoint_type NOT NULL DEFAULT 'workstation',
  status public.endpoint_status NOT NULL DEFAULT 'offline',
  os TEXT,
  os_version TEXT,
  ip_address TEXT,
  mac_address TEXT,
  agent_version TEXT,
  cpu_usage NUMERIC(5,2),
  ram_usage NUMERIC(5,2),
  disk_usage NUMERIC(5,2),
  last_heartbeat TIMESTAMPTZ,
  tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_endpoints_tenant ON public.endpoints(tenant_id);
CREATE INDEX idx_endpoints_client ON public.endpoints(client_id);
CREATE INDEX idx_endpoints_status ON public.endpoints(tenant_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.endpoints TO authenticated;
GRANT ALL ON public.endpoints TO service_role;

ALTER TABLE public.endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view endpoints"
  ON public.endpoints FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Admins and technicians insert endpoints"
  ON public.endpoints FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'))
  );

CREATE POLICY "Admins and technicians update endpoints"
  ON public.endpoints FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'))
  );

CREATE POLICY "Admins and technicians delete endpoints"
  ON public.endpoints FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'))
  );

CREATE TRIGGER update_endpoints_updated_at
  BEFORE UPDATE ON public.endpoints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────
-- 20260612122805_22351d77-f419-41a5-a69d-947a8a74eaef.sql
-- ─────────────────────────────────────────────────────────────────────

-- Enums
CREATE TYPE public.ticket_status AS ENUM ('open','in_progress','waiting','resolved','closed');
CREATE TYPE public.ticket_priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE public.ticket_category AS ENUM ('incident','request','problem','change','question');

-- Counter per tenant for ticket numbering
CREATE TABLE public.ticket_counters (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  last_number INTEGER NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE ON public.ticket_counters TO authenticated;
GRANT ALL ON public.ticket_counters TO service_role;
ALTER TABLE public.ticket_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read counters" ON public.ticket_counters FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

-- Tickets
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.client_contacts(id) ON DELETE SET NULL,
  endpoint_id UUID REFERENCES public.endpoints(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status public.ticket_status NOT NULL DEFAULT 'open',
  priority public.ticket_priority NOT NULL DEFAULT 'medium',
  category public.ticket_category NOT NULL DEFAULT 'incident',
  sla_due_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant read tickets" ON public.tickets FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "staff create tickets" ON public.tickets FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));
CREATE POLICY "staff update tickets" ON public.tickets FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "admin delete tickets" ON public.tickets FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_tickets_tenant_status ON public.tickets(tenant_id, status);
CREATE INDEX idx_tickets_client ON public.tickets(client_id);
CREATE INDEX idx_tickets_assignee ON public.tickets(assignee_id);

CREATE TRIGGER trg_tickets_updated BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto number
CREATE OR REPLACE FUNCTION public.assign_ticket_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INTEGER;
BEGIN
  INSERT INTO public.ticket_counters (tenant_id, last_number) VALUES (NEW.tenant_id, 1)
    ON CONFLICT (tenant_id) DO UPDATE SET last_number = ticket_counters.last_number + 1
    RETURNING last_number INTO n;
  NEW.number := 'TKT-' || LPAD(n::text, 5, '0');
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_tickets_number BEFORE INSERT ON public.tickets
  FOR EACH ROW WHEN (NEW.number IS NULL OR NEW.number = '')
  EXECUTE FUNCTION public.assign_ticket_number();

-- Status timestamps
CREATE OR REPLACE FUNCTION public.tickets_status_timestamps()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status <> 'in_progress' AND NEW.started_at IS NULL THEN
    NEW.started_at := now();
  END IF;
  IF NEW.status = 'resolved' AND OLD.status <> 'resolved' THEN NEW.resolved_at := now(); END IF;
  IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN NEW.closed_at := now(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_tickets_status BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.tickets_status_timestamps();

-- Comments
CREATE TABLE public.ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_comments TO authenticated;
GRANT ALL ON public.ticket_comments TO service_role;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read comments" ON public.ticket_comments FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "staff write comments" ON public.ticket_comments FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));
CREATE POLICY "author update comments" ON public.ticket_comments FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND author_id = auth.uid())
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "author or admin delete comments" ON public.ticket_comments FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
    AND (author_id = auth.uid() OR public.has_role(auth.uid(),'admin')));
CREATE INDEX idx_comments_ticket ON public.ticket_comments(ticket_id);
CREATE TRIGGER trg_comments_updated BEFORE UPDATE ON public.ticket_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Activity
CREATE TABLE public.ticket_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ticket_activity TO authenticated;
GRANT ALL ON public.ticket_activity TO service_role;
ALTER TABLE public.ticket_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read activity" ON public.ticket_activity FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "staff write activity" ON public.ticket_activity FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));
CREATE INDEX idx_activity_ticket ON public.ticket_activity(ticket_id);

CREATE OR REPLACE FUNCTION public.tickets_log_activity()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.ticket_activity(tenant_id,ticket_id,actor_id,action,field,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,auth.uid(),'status_change','status',OLD.status::text,NEW.status::text);
  END IF;
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    INSERT INTO public.ticket_activity(tenant_id,ticket_id,actor_id,action,field,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,auth.uid(),'assignee_change','assignee_id',OLD.assignee_id::text,NEW.assignee_id::text);
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.ticket_activity(tenant_id,ticket_id,actor_id,action,field,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,auth.uid(),'priority_change','priority',OLD.priority::text,NEW.priority::text);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_tickets_activity AFTER UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.tickets_log_activity();


-- ─────────────────────────────────────────────────────────────────────
-- 20260612122824_8bb71c4e-ee25-4595-8aac-ffdf40fb4500.sql
-- ─────────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.assign_ticket_number() FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 20260612123815_662bdc2e-5259-462a-ae99-4de2a7206a0e.sql
-- ─────────────────────────────────────────────────────────────────────

-- Enums
CREATE TYPE public.alert_severity AS ENUM ('info', 'warning', 'critical');
CREATE TYPE public.alert_metric AS ENUM ('cpu', 'ram', 'disk', 'offline');
CREATE TYPE public.alert_comparator AS ENUM ('gt', 'gte', 'lt', 'lte');
CREATE TYPE public.alert_status AS ENUM ('open', 'acknowledged', 'resolved');
CREATE TYPE public.alert_scope AS ENUM ('all', 'client', 'endpoint');

-- alert_rules
CREATE TABLE public.alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  metric public.alert_metric NOT NULL,
  comparator public.alert_comparator NOT NULL DEFAULT 'gte',
  threshold NUMERIC NOT NULL DEFAULT 90,
  duration_minutes INTEGER NOT NULL DEFAULT 5,
  severity public.alert_severity NOT NULL DEFAULT 'warning',
  scope public.alert_scope NOT NULL DEFAULT 'all',
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  endpoint_id UUID REFERENCES public.endpoints(id) ON DELETE CASCADE,
  notify_email TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alert_rules_tenant ON public.alert_rules(tenant_id);
CREATE INDEX idx_alert_rules_enabled ON public.alert_rules(tenant_id, enabled);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_rules TO authenticated;
GRANT ALL ON public.alert_rules TO service_role;
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members view alert_rules" ON public.alert_rules FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "staff insert alert_rules" ON public.alert_rules FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));
CREATE POLICY "staff update alert_rules" ON public.alert_rules FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "admin delete alert_rules" ON public.alert_rules FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(),'admin'));

CREATE TRIGGER update_alert_rules_updated_at BEFORE UPDATE ON public.alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- alerts (events)
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.alert_rules(id) ON DELETE SET NULL,
  endpoint_id UUID REFERENCES public.endpoints(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  metric public.alert_metric NOT NULL,
  severity public.alert_severity NOT NULL,
  value NUMERIC,
  threshold NUMERIC,
  message TEXT NOT NULL,
  status public.alert_status NOT NULL DEFAULT 'open',
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerts_tenant_status ON public.alerts(tenant_id, status);
CREATE INDEX idx_alerts_endpoint ON public.alerts(endpoint_id);
CREATE INDEX idx_alerts_created ON public.alerts(tenant_id, created_at DESC);
CREATE UNIQUE INDEX uniq_open_alert_per_rule_endpoint
  ON public.alerts(rule_id, endpoint_id) WHERE status <> 'resolved';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members view alerts" ON public.alerts FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "staff insert alerts" ON public.alerts FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));
CREATE POLICY "staff update alerts" ON public.alerts FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "admin delete alerts" ON public.alerts FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(),'admin'));

CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Evaluation function: runs in caller's tenant via get_user_tenant; SECURITY INVOKER so RLS applies.
CREATE OR REPLACE FUNCTION public.evaluate_alert_rules()
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
  _rule RECORD;
  _ep RECORD;
  _value NUMERIC;
  _triggered BOOLEAN;
  _msg TEXT;
  _count INTEGER := 0;
BEGIN
  _tenant := public.get_user_tenant(auth.uid());
  IF _tenant IS NULL THEN RETURN 0; END IF;

  FOR _rule IN
    SELECT * FROM public.alert_rules WHERE tenant_id = _tenant AND enabled = true
  LOOP
    FOR _ep IN
      SELECT e.* FROM public.endpoints e
      WHERE e.tenant_id = _tenant
        AND (_rule.scope = 'all'
          OR (_rule.scope = 'client' AND e.client_id = _rule.client_id)
          OR (_rule.scope = 'endpoint' AND e.id = _rule.endpoint_id))
    LOOP
      _triggered := false;
      _value := NULL;

      IF _rule.metric = 'cpu' THEN _value := _ep.cpu_usage;
      ELSIF _rule.metric = 'ram' THEN _value := _ep.ram_usage;
      ELSIF _rule.metric = 'disk' THEN _value := _ep.disk_usage;
      ELSIF _rule.metric = 'offline' THEN
        IF _ep.last_heartbeat IS NULL
           OR _ep.last_heartbeat < now() - (_rule.duration_minutes || ' minutes')::interval THEN
          _triggered := true;
          _value := EXTRACT(EPOCH FROM (now() - COALESCE(_ep.last_heartbeat, _ep.created_at))) / 60;
        END IF;
      END IF;

      IF _rule.metric <> 'offline' AND _value IS NOT NULL THEN
        _triggered := CASE _rule.comparator
          WHEN 'gt' THEN _value > _rule.threshold
          WHEN 'gte' THEN _value >= _rule.threshold
          WHEN 'lt' THEN _value < _rule.threshold
          WHEN 'lte' THEN _value <= _rule.threshold
        END;
      END IF;

      IF _triggered THEN
        _msg := _ep.hostname || ' — ' || _rule.name;
        INSERT INTO public.alerts (tenant_id, rule_id, endpoint_id, client_id, metric, severity, value, threshold, message)
        VALUES (_tenant, _rule.id, _ep.id, _ep.client_id, _rule.metric, _rule.severity, _value, _rule.threshold, _msg)
        ON CONFLICT (rule_id, endpoint_id) WHERE status <> 'resolved'
          DO UPDATE SET value = EXCLUDED.value, severity = EXCLUDED.severity, updated_at = now();
        _count := _count + 1;
      ELSE
        UPDATE public.alerts
          SET status = 'resolved', resolved_at = now(), updated_at = now()
          WHERE rule_id = _rule.id AND endpoint_id = _ep.id AND status <> 'resolved';
      END IF;
    END LOOP;
  END LOOP;

  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.evaluate_alert_rules() TO authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 20260612124844_9ee30179-922c-48c1-b169-6345949ed42d.sql
-- ─────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────
-- 20260612125404_85c0254d-59cb-4d1e-b951-d51b84b403cd.sql
-- ─────────────────────────────────────────────────────────────────────

-- Enums
CREATE TYPE public.automation_kind AS ENUM ('script', 'task');
CREATE TYPE public.automation_language AS ENUM ('powershell', 'bash', 'python');
CREATE TYPE public.automation_trigger AS ENUM ('manual', 'schedule', 'alert');
CREATE TYPE public.automation_scope AS ENUM ('all', 'client', 'endpoint');
CREATE TYPE public.automation_run_status AS ENUM ('queued', 'running', 'success', 'failed', 'cancelled');

-- automations
CREATE TABLE public.automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  kind public.automation_kind NOT NULL DEFAULT 'script',
  language public.automation_language NOT NULL DEFAULT 'powershell',
  code TEXT NOT NULL DEFAULT '',
  trigger public.automation_trigger NOT NULL DEFAULT 'manual',
  cron_expr TEXT,
  scope public.automation_scope NOT NULL DEFAULT 'all',
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  endpoint_id UUID REFERENCES public.endpoints(id) ON DELETE CASCADE,
  notify_email TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automations TO authenticated;
GRANT ALL ON public.automations TO service_role;

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view automations" ON public.automations
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Staff insert automations" ON public.automations
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
              AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician')));

CREATE POLICY "Staff update automations" ON public.automations
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
         AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician')))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
              AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician')));

CREATE POLICY "Admins delete automations" ON public.automations
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER automations_updated_at
  BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- automation_runs
CREATE TABLE public.automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  endpoint_id UUID REFERENCES public.endpoints(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  status public.automation_run_status NOT NULL DEFAULT 'queued',
  triggered_by UUID,
  trigger_source public.automation_trigger NOT NULL DEFAULT 'manual',
  exit_code INTEGER,
  output TEXT,
  error TEXT,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_runs TO authenticated;
GRANT ALL ON public.automation_runs TO service_role;

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view runs" ON public.automation_runs
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Staff insert runs" ON public.automation_runs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
              AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician')));

CREATE POLICY "Staff update runs" ON public.automation_runs
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
         AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician')))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
              AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician')));

CREATE INDEX automation_runs_automation_idx ON public.automation_runs (automation_id, started_at DESC);
CREATE INDEX automations_tenant_idx ON public.automations (tenant_id);

-- Helper function: simulate execution of an automation (manual run).
-- In a real agent, the endpoint would pick up queued runs and report results.
-- This SECURITY DEFINER fn picks targets by scope and produces a fake successful
-- run row so the UI demonstrates the full flow end-to-end.
CREATE OR REPLACE FUNCTION public.run_automation(_automation_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
  _auto RECORD;
  _ep RECORD;
  _count INTEGER := 0;
BEGIN
  _tenant := public.get_user_tenant(auth.uid());
  IF _tenant IS NULL THEN RETURN 0; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO _auto FROM public.automations
    WHERE id = _automation_id AND tenant_id = _tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'automation not found'; END IF;

  FOR _ep IN
    SELECT e.* FROM public.endpoints e
    WHERE e.tenant_id = _tenant
      AND (_auto.scope = 'all'
        OR (_auto.scope = 'client' AND e.client_id = _auto.client_id)
        OR (_auto.scope = 'endpoint' AND e.id = _auto.endpoint_id))
  LOOP
    INSERT INTO public.automation_runs
      (tenant_id, automation_id, endpoint_id, client_id, status,
       triggered_by, trigger_source, exit_code, output, duration_ms,
       started_at, finished_at)
    VALUES
      (_tenant, _auto.id, _ep.id, _ep.client_id, 'success',
       auth.uid(), 'manual', 0,
       'Simulated run on ' || _ep.hostname || E'\n' || left(_auto.code, 400),
       (random() * 4000 + 500)::int,
       now(), now() + interval '1 second');
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────
-- 20260612130248_96aeab40-f611-412c-a0ff-5b3c04a12a4c.sql
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  actor_id UUID,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID,
  summary TEXT,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_tenant_created ON public.audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_table, entity_id);

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read tenant audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
  _entity UUID;
  _summary TEXT;
  _actor_email TEXT;
  _old JSONB;
  _new JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _tenant := (to_jsonb(OLD)->>'tenant_id')::UUID;
    _entity := (to_jsonb(OLD)->>'id')::UUID;
    _old := to_jsonb(OLD);
    _new := NULL;
    _summary := COALESCE(to_jsonb(OLD)->>'name', to_jsonb(OLD)->>'hostname', to_jsonb(OLD)->>'title', _entity::text);
  ELSE
    _tenant := (to_jsonb(NEW)->>'tenant_id')::UUID;
    _entity := (to_jsonb(NEW)->>'id')::UUID;
    _new := to_jsonb(NEW);
    _old := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
    _summary := COALESCE(to_jsonb(NEW)->>'name', to_jsonb(NEW)->>'hostname', to_jsonb(NEW)->>'title', _entity::text);
  END IF;

  IF _tenant IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT email INTO _actor_email FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.audit_logs(tenant_id, actor_id, actor_email, action, entity_table, entity_id, summary, old_values, new_values)
  VALUES (_tenant, auth.uid(), _actor_email, lower(TG_OP), TG_TABLE_NAME, _entity, _summary, _old, _new);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_clients AFTER INSERT OR UPDATE OR DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER audit_endpoints AFTER INSERT OR UPDATE OR DELETE ON public.endpoints
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER audit_automations AFTER INSERT OR UPDATE OR DELETE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER audit_alert_rules AFTER INSERT OR UPDATE OR DELETE ON public.alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER audit_tickets AFTER INSERT OR DELETE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();


-- ─────────────────────────────────────────────────────────────────────
-- 20260612130307_7eefdb8f-fe7b-44f2-b904-bde413547e83.sql
-- ─────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.log_audit_event() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 20260612130325_d238d7bc-178c-41df-968a-3b5ece2489a6.sql
-- ─────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_ticket_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 20260612131132_4f091830-2dc8-47e9-aec3-5cfa91e88364.sql
-- ─────────────────────────────────────────────────────────────────────

CREATE TYPE public.kb_visibility AS ENUM ('internal', 'public');
CREATE TYPE public.kb_status AS ENUM ('draft', 'published', 'archived');

CREATE TABLE public.kb_articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  author_id UUID,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  excerpt TEXT,
  body TEXT NOT NULL DEFAULT '',
  category TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  visibility public.kb_visibility NOT NULL DEFAULT 'internal',
  status public.kb_status NOT NULL DEFAULT 'draft',
  views INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

CREATE INDEX idx_kb_articles_tenant ON public.kb_articles(tenant_id, status, updated_at DESC);
CREATE INDEX idx_kb_articles_client ON public.kb_articles(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_articles TO authenticated;
GRANT ALL ON public.kb_articles TO service_role;

ALTER TABLE public.kb_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read articles" ON public.kb_articles
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Tech and admins create articles" ON public.kb_articles
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'))
  );

CREATE POLICY "Tech and admins update articles" ON public.kb_articles
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'))
  );

CREATE POLICY "Admins delete articles" ON public.kb_articles
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE TRIGGER update_kb_articles_updated_at
  BEFORE UPDATE ON public.kb_articles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER audit_kb_articles
  AFTER INSERT OR UPDATE OR DELETE ON public.kb_articles
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();


-- ─────────────────────────────────────────────────────────────────────
-- 20260612131847_e4b9891c-0935-4e31-84a0-e505c97b175a.sql
-- ─────────────────────────────────────────────────────────────────────
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'portal';

-- ─────────────────────────────────────────────────────────────────────
-- 20260612131944_cac07d04-05ed-4dd2-90d6-8d77b37ae67c.sql
-- ─────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────
-- 20260612135811_df0025d1-3bf7-4a78-8afb-b4186548cc0d.sql
-- ─────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────
-- 20260612154245_93ea0abf-8981-4492-9dc8-0b4dfe7c7022.sql
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.endpoints
  ADD COLUMN IF NOT EXISTS agent_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS last_seen_ip text;

CREATE TABLE IF NOT EXISTS public.agent_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  default_type public.endpoint_type NOT NULL DEFAULT 'workstation',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  used_endpoint_id uuid REFERENCES public.endpoints(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_enrollments_tenant ON public.agent_enrollments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_enrollments_token ON public.agent_enrollments(token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_enrollments TO authenticated;
GRANT ALL ON public.agent_enrollments TO service_role;

ALTER TABLE public.agent_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read enrollments"
  ON public.agent_enrollments FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Tenant admins/techs manage enrollments"
  ON public.agent_enrollments FOR ALL
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'))
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'technician'))
  );

-- ─────────────────────────────────────────────────────────────────────
-- 20260612165139_6d4702c6-b3da-4bff-b614-ad7384e4dd9d.sql
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────
-- 20260612165638_a1942d7b-c5cf-40fa-b5d0-f4a0099f6b9f.sql
-- ─────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.endpoints TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_activity TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_counters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_articles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_counters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_catalog TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_enrollments TO authenticated;

GRANT ALL ON public.profiles, public.tenants, public.user_roles, public.clients, public.client_contacts,
  public.endpoints, public.tickets, public.ticket_comments, public.ticket_activity, public.ticket_counters,
  public.alerts, public.alert_rules, public.automations, public.automation_runs, public.kb_articles,
  public.audit_logs, public.contracts, public.contract_items, public.invoices, public.invoice_items,
  public.invoice_counters, public.service_catalog, public.agent_enrollments TO service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260612165828_4713b435-ca81-47f1-858a-16f54f3bb9ae.sql
-- ─────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.get_user_tenant(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_user_client(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_alert_rules() TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_automation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_invoice_from_contract(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_invoice_paid(uuid) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 20260612172500_d1338065-ce18-47da-9ed4-4cb1a68b56f2.sql
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.endpoints
  ADD COLUMN IF NOT EXISTS cpu_model TEXT,
  ADD COLUMN IF NOT EXISTS cpu_cores INTEGER,
  ADD COLUMN IF NOT EXISTS cpu_threads INTEGER,
  ADD COLUMN IF NOT EXISTS ram_total_mb BIGINT,
  ADD COLUMN IF NOT EXISTS gpu TEXT,
  ADD COLUMN IF NOT EXISTS manufacturer TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS serial_number TEXT,
  ADD COLUMN IF NOT EXISTS motherboard TEXT,
  ADD COLUMN IF NOT EXISTS bios_vendor TEXT,
  ADD COLUMN IF NOT EXISTS bios_version TEXT,
  ADD COLUMN IF NOT EXISTS bios_date DATE,
  ADD COLUMN IF NOT EXISTS uptime_seconds BIGINT,
  ADD COLUMN IF NOT EXISTS last_boot_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  ADD COLUMN IF NOT EXISTS domain TEXT,
  ADD COLUMN IF NOT EXISTS logged_user TEXT,
  ADD COLUMN IF NOT EXISTS public_ip TEXT,
  ADD COLUMN IF NOT EXISTS gateway TEXT,
  ADD COLUMN IF NOT EXISTS dns_servers JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS disks JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS network_interfaces JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS installed_software JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS running_processes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS services JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pending_updates JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS inventory_updated_at TIMESTAMPTZ;


-- ─────────────────────────────────────────────────────────────────────
-- 20260614132216_613b6dba-4cef-4e75-a62c-4cfb481563ee.sql
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE public.endpoint_metric_samples (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  endpoint_id UUID NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
  sampled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cpu_usage NUMERIC,
  ram_usage NUMERIC,
  disk_usage NUMERIC
);

CREATE INDEX idx_metric_samples_endpoint_time ON public.endpoint_metric_samples (endpoint_id, sampled_at DESC);
CREATE INDEX idx_metric_samples_tenant ON public.endpoint_metric_samples (tenant_id);

GRANT SELECT ON public.endpoint_metric_samples TO authenticated;
GRANT ALL ON public.endpoint_metric_samples TO service_role;

ALTER TABLE public.endpoint_metric_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read metric samples"
ON public.endpoint_metric_samples FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant(auth.uid()));


-- ─────────────────────────────────────────────────────────────────────
-- 20260614133019_950f7f2c-ee4b-46aa-9a5d-21d2706fbc0e.sql
-- ─────────────────────────────────────────────────────────────────────

-- Revoke EXECUTE from anon/authenticated on all SECURITY DEFINER functions, then re-grant only where needed.

-- Trigger-only functions: no EXECUTE needed for app roles
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_ticket_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_invoice_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_audit_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalc_invoice_totals() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tickets_log_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tickets_status_timestamps() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- Helper functions used inside RLS policies — needed by authenticated, not anon
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_tenant(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_client(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_client(uuid) TO authenticated;

-- RPCs intentionally callable by signed-in users; internal checks enforce roles
REVOKE ALL ON FUNCTION public.evaluate_alert_rules() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_alert_rules() TO authenticated;

REVOKE ALL ON FUNCTION public.run_automation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_automation(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_invoice_from_contract(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_invoice_from_contract(uuid, date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_invoice_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_invoice_paid(uuid) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 20260614135219_5370b506-f338-47e7-9064-5f7e25e8cfea.sql
-- ─────────────────────────────────────────────────────────────────────

CREATE TYPE public.endpoint_command_type AS ENUM ('shutdown','restart','sleep','hibernate','wake_on_lan','logoff');
CREATE TYPE public.endpoint_command_status AS ENUM ('pending','sent','succeeded','failed','cancelled');

CREATE TABLE public.endpoint_commands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint_id UUID NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
  command public.endpoint_command_type NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.endpoint_command_status NOT NULL DEFAULT 'pending',
  output TEXT,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_endpoint_commands_endpoint ON public.endpoint_commands(endpoint_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.endpoint_commands TO authenticated;
GRANT ALL ON public.endpoint_commands TO service_role;

ALTER TABLE public.endpoint_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read commands" ON public.endpoint_commands
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "admin/tech create commands" ON public.endpoint_commands
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician'))
  );

CREATE POLICY "admin/tech update commands" ON public.endpoint_commands
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician'))
  );

CREATE POLICY "admin/tech delete commands" ON public.endpoint_commands
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician'))
  );

CREATE TRIGGER trg_endpoint_commands_updated
  BEFORE UPDATE ON public.endpoint_commands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ─────────────────────────────────────────────────────────────────────
-- 20260614140003_4aa9cc34-db03-405e-91f3-d51c9724f941.sql
-- ─────────────────────────────────────────────────────────────────────

-- Tighten EXECUTE on SECURITY DEFINER functions. Default Postgres grants EXECUTE to PUBLIC,
-- which the linter flags. Revoke from PUBLIC/anon and grant only to roles that actually need it.

-- Trigger-only functions: no direct caller needs EXECUTE.
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tickets_log_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tickets_status_timestamps() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_ticket_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_invoice_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalc_invoice_totals() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_audit_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Helper functions referenced by RLS policies and other DEFINER functions:
-- RLS policy evaluation runs as the calling user, so authenticated needs EXECUTE.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_tenant(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_client(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_client(uuid) TO authenticated;

-- RPCs intentionally called by signed-in users (they enforce role checks internally).
REVOKE ALL ON FUNCTION public.run_automation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_automation(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_invoice_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_invoice_paid(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_invoice_from_contract(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_invoice_from_contract(uuid, date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.evaluate_alert_rules() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_alert_rules() TO authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 20260614141425_87a23124-847f-4b5c-bbcb-bee5f8d36ade.sql
-- ─────────────────────────────────────────────────────────────────────
ALTER TYPE public.endpoint_command_type ADD VALUE IF NOT EXISTS 'enable_rdp';

-- ─────────────────────────────────────────────────────────────────────
-- 20260615135711_a7e17758-2438-4f63-80f9-c14a91fa0ff5.sql
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.endpoints ADD COLUMN IF NOT EXISTS tailscale_ip TEXT;

-- ─────────────────────────────────────────────────────────────────────
-- 20260615152635_ce8f907f-3c31-47e8-8521-005f029f64c6.sql
-- ─────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────
-- 20260615162743_54766a6a-1358-46dd-a027-787303f0b4f2.sql
-- ─────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────
-- 20260615172913_0fef334c-0659-40d8-b902-bc09184a350b.sql
-- ─────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────
-- 20260615175908_6f587131-3374-432e-8a3a-9b0a6a5f45de.sql
-- ─────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────
-- 20260615181622_2e20c5f9-3cb5-4d7f-a591-31557fd7bf8b.sql
-- ─────────────────────────────────────────────────────────────────────

-- 1) Server-only secrets table for agent tokens
CREATE TABLE IF NOT EXISTS public.endpoint_secrets (
  endpoint_id UUID PRIMARY KEY REFERENCES public.endpoints(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service role only — no grants to anon/authenticated
GRANT ALL ON public.endpoint_secrets TO service_role;
ALTER TABLE public.endpoint_secrets ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated/anon => fully blocked from Data API

CREATE TRIGGER trg_endpoint_secrets_updated
  BEFORE UPDATE ON public.endpoint_secrets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Backfill from existing endpoints.agent_token
INSERT INTO public.endpoint_secrets (endpoint_id, tenant_id, agent_token)
SELECT id, tenant_id, agent_token
FROM public.endpoints
WHERE agent_token IS NOT NULL
ON CONFLICT (endpoint_id) DO NOTHING;

-- 3) Drop the sensitive column from endpoints
ALTER TABLE public.endpoints DROP COLUMN IF EXISTS agent_token;

-- 4) Tighten ticket_comments author update policy: cannot flip to internal,
--    cannot edit if currently internal. Staff (admin/technician) keep full edit via separate policy.
DROP POLICY IF EXISTS "author update comments" ON public.ticket_comments;
CREATE POLICY "author update comments" ON public.ticket_comments
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND author_id = auth.uid()
    AND COALESCE(internal, false) = false
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid())
    AND author_id = auth.uid()
    AND COALESCE(internal, false) = false
  );

DROP POLICY IF EXISTS "staff update comments" ON public.ticket_comments;
CREATE POLICY "staff update comments" ON public.ticket_comments
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician'))
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician'))
  );


-- ─────────────────────────────────────────────────────────────────────
-- 20260617102851_08650649-bba8-4f8b-b0f5-318efd4a3b7d.sql
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.endpoints ADD COLUMN display_name TEXT;

-- ─────────────────────────────────────────────────────────────────────
-- 20260617211732_df8b3615-e1ad-4cc3-90ba-7a7001d69c06.sql
-- ─────────────────────────────────────────────────────────────────────

-- 1. Add 'power' to automation_kind enum
ALTER TYPE public.automation_kind ADD VALUE IF NOT EXISTS 'power';

-- 2. Add columns for power automations
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS power_action public.endpoint_command_type,
  ADD COLUMN IF NOT EXISTS power_delay_seconds integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS power_message text;

-- 3. Cron matcher helper. Supports: '*' or comma list of integers / ranges (a-b) / steps (*/n) for each field.
CREATE OR REPLACE FUNCTION public.cron_field_matches(_field text, _value integer)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _part text;
  _a int; _b int; _step int;
BEGIN
  IF _field = '*' THEN RETURN true; END IF;
  FOREACH _part IN ARRAY string_to_array(_field, ',') LOOP
    -- step like */5 or 0-30/5
    IF _part LIKE '%/%' THEN
      _step := (split_part(_part, '/', 2))::int;
      IF split_part(_part, '/', 1) = '*' THEN
        IF _value % _step = 0 THEN RETURN true; END IF;
      ELSIF split_part(_part, '/', 1) LIKE '%-%' THEN
        _a := split_part(split_part(_part, '/', 1), '-', 1)::int;
        _b := split_part(split_part(_part, '/', 1), '-', 2)::int;
        IF _value BETWEEN _a AND _b AND (_value - _a) % _step = 0 THEN RETURN true; END IF;
      END IF;
    ELSIF _part LIKE '%-%' THEN
      _a := split_part(_part, '-', 1)::int;
      _b := split_part(_part, '-', 2)::int;
      IF _value BETWEEN _a AND _b THEN RETURN true; END IF;
    ELSE
      IF _part::int = _value THEN RETURN true; END IF;
    END IF;
  END LOOP;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.cron_matches(_expr text, _ts timestamptz)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _parts text[];
  _min int; _hour int; _dom int; _mon int; _dow int;
BEGIN
  IF _expr IS NULL OR length(trim(_expr)) = 0 THEN RETURN false; END IF;
  _parts := regexp_split_to_array(trim(_expr), '\s+');
  IF array_length(_parts, 1) <> 5 THEN RETURN false; END IF;
  _min  := extract(minute from _ts)::int;
  _hour := extract(hour   from _ts)::int;
  _dom  := extract(day    from _ts)::int;
  _mon  := extract(month  from _ts)::int;
  _dow  := extract(dow    from _ts)::int; -- 0=Sun..6=Sat
  RETURN public.cron_field_matches(_parts[1], _min)
     AND public.cron_field_matches(_parts[2], _hour)
     AND public.cron_field_matches(_parts[3], _dom)
     AND public.cron_field_matches(_parts[4], _mon)
     AND public.cron_field_matches(_parts[5], _dow);
END;
$$;

-- 4. Replace run_automation to support 'power' kind
CREATE OR REPLACE FUNCTION public.run_automation(_automation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
  _auto RECORD;
  _ep RECORD;
  _count INTEGER := 0;
  _caller UUID;
  _is_scheduled BOOLEAN := false;
BEGIN
  _caller := auth.uid();

  -- Allow being called from scheduled runner (no auth context)
  IF _caller IS NULL THEN
    _is_scheduled := true;
    SELECT tenant_id INTO _tenant FROM public.automations WHERE id = _automation_id;
  ELSE
    _tenant := public.get_user_tenant(_caller);
    IF _tenant IS NULL THEN RETURN 0; END IF;
    IF NOT (public.has_role(_caller, 'admin') OR public.has_role(_caller, 'technician')) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  SELECT * INTO _auto FROM public.automations
    WHERE id = _automation_id AND tenant_id = _tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'automation not found'; END IF;

  FOR _ep IN
    SELECT e.* FROM public.endpoints e
    WHERE e.tenant_id = _tenant
      AND (_auto.scope = 'all'
        OR (_auto.scope = 'client'   AND e.client_id = _auto.client_id)
        OR (_auto.scope = 'endpoint' AND e.id = _auto.endpoint_id))
  LOOP
    IF _auto.kind = 'power' AND _auto.power_action IS NOT NULL THEN
      -- Enqueue the real power command for the agent
      INSERT INTO public.endpoint_commands (tenant_id, endpoint_id, command, params)
      VALUES (_tenant, _ep.id, _auto.power_action,
        jsonb_build_object(
          'delay_seconds', COALESCE(_auto.power_delay_seconds, 30),
          'message', COALESCE(_auto.power_message, ''),
          'automation_id', _auto.id
        ));

      INSERT INTO public.automation_runs
        (tenant_id, automation_id, endpoint_id, client_id, status,
         triggered_by, trigger_source, exit_code, output, duration_ms,
         started_at, finished_at)
      VALUES
        (_tenant, _auto.id, _ep.id, _ep.client_id, 'success',
         _caller,
         CASE WHEN _is_scheduled THEN 'schedule' ELSE 'manual' END,
         0,
         'Power command ' || _auto.power_action || ' queued for ' || _ep.hostname,
         50, now(), now());
    ELSE
      -- Legacy simulated script/task run
      INSERT INTO public.automation_runs
        (tenant_id, automation_id, endpoint_id, client_id, status,
         triggered_by, trigger_source, exit_code, output, duration_ms,
         started_at, finished_at)
      VALUES
        (_tenant, _auto.id, _ep.id, _ep.client_id, 'success',
         _caller,
         CASE WHEN _is_scheduled THEN 'schedule' ELSE 'manual' END,
         0,
         'Simulated run on ' || _ep.hostname || E'\n' || left(COALESCE(_auto.code, ''), 400),
         (random() * 4000 + 500)::int,
         now(), now() + interval '1 second');
    END IF;
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

-- 5. Scheduled runner: invoked every minute by pg_cron
CREATE OR REPLACE FUNCTION public.run_scheduled_automations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _a RECORD;
  _total INTEGER := 0;
  _now timestamptz := date_trunc('minute', now());
BEGIN
  FOR _a IN
    SELECT id, cron_expr FROM public.automations
    WHERE enabled = true AND trigger = 'schedule' AND cron_expr IS NOT NULL
  LOOP
    IF public.cron_matches(_a.cron_expr, _now) THEN
      BEGIN
        _total := _total + public.run_automation(_a.id);
      EXCEPTION WHEN OTHERS THEN
        -- swallow per-automation errors so one bad row doesn't block others
        NULL;
      END;
    END IF;
  END LOOP;
  RETURN _total;
END;
$$;

-- 6. Ensure pg_cron is enabled and schedule the runner every minute
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule if already exists (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('run-scheduled-automations');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'run-scheduled-automations',
  '* * * * *',
  $$SELECT public.run_scheduled_automations();$$
);


-- ─────────────────────────────────────────────────────────────────────
-- 20260622114714_94708eae-a205-4ba2-8637-260b990a2a36.sql
-- ─────────────────────────────────────────────────────────────────────

-- Tracks changes to endpoint inventory (hardware, network, software) over time.
CREATE TABLE public.endpoint_inventory_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint_id UUID NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
  category TEXT NOT NULL,          -- 'hardware' | 'network' | 'software' | 'os'
  field TEXT NOT NULL,             -- column or software name
  change_type TEXT NOT NULL,       -- 'changed' | 'added' | 'removed'
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_eih_endpoint_time ON public.endpoint_inventory_history (endpoint_id, created_at DESC);
CREATE INDEX idx_eih_tenant_time ON public.endpoint_inventory_history (tenant_id, created_at DESC);
CREATE INDEX idx_eih_category ON public.endpoint_inventory_history (endpoint_id, category, created_at DESC);

GRANT SELECT ON public.endpoint_inventory_history TO authenticated;
GRANT ALL ON public.endpoint_inventory_history TO service_role;

ALTER TABLE public.endpoint_inventory_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can read inventory history"
  ON public.endpoint_inventory_history FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

-- Trigger function: compares OLD and NEW endpoint rows and logs changes
CREATE OR REPLACE FUNCTION public.log_endpoint_inventory_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old_sw JSONB;
  _new_sw JSONB;
  _item JSONB;
  _name TEXT;
  _ver TEXT;
BEGIN
  -- Hardware scalar fields
  IF NEW.cpu_model IS DISTINCT FROM OLD.cpu_model THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'hardware','cpu_model','changed',OLD.cpu_model,NEW.cpu_model);
  END IF;
  IF NEW.cpu_cores IS DISTINCT FROM OLD.cpu_cores THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'hardware','cpu_cores','changed',OLD.cpu_cores::text,NEW.cpu_cores::text);
  END IF;
  IF NEW.ram_total_mb IS DISTINCT FROM OLD.ram_total_mb THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'hardware','ram_total_mb','changed',OLD.ram_total_mb::text,NEW.ram_total_mb::text);
  END IF;
  IF NEW.gpu IS DISTINCT FROM OLD.gpu THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'hardware','gpu','changed',OLD.gpu,NEW.gpu);
  END IF;
  IF NEW.manufacturer IS DISTINCT FROM OLD.manufacturer THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'hardware','manufacturer','changed',OLD.manufacturer,NEW.manufacturer);
  END IF;
  IF NEW.model IS DISTINCT FROM OLD.model THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'hardware','model','changed',OLD.model,NEW.model);
  END IF;
  IF NEW.serial_number IS DISTINCT FROM OLD.serial_number THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'hardware','serial_number','changed',OLD.serial_number,NEW.serial_number);
  END IF;
  IF NEW.motherboard IS DISTINCT FROM OLD.motherboard THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'hardware','motherboard','changed',OLD.motherboard,NEW.motherboard);
  END IF;
  IF NEW.bios_version IS DISTINCT FROM OLD.bios_version THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'hardware','bios_version','changed',OLD.bios_version,NEW.bios_version);
  END IF;

  -- OS
  IF NEW.os IS DISTINCT FROM OLD.os THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'os','os','changed',OLD.os,NEW.os);
  END IF;
  IF NEW.os_version IS DISTINCT FROM OLD.os_version THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'os','os_version','changed',OLD.os_version,NEW.os_version);
  END IF;

  -- Network scalars
  IF NEW.ip_address IS DISTINCT FROM OLD.ip_address THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'network','ip_address','changed',OLD.ip_address,NEW.ip_address);
  END IF;
  IF NEW.public_ip IS DISTINCT FROM OLD.public_ip THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'network','public_ip','changed',OLD.public_ip,NEW.public_ip);
  END IF;
  IF NEW.gateway IS DISTINCT FROM OLD.gateway THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'network','gateway','changed',OLD.gateway,NEW.gateway);
  END IF;
  IF NEW.mac_address IS DISTINCT FROM OLD.mac_address THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'network','mac_address','changed',OLD.mac_address,NEW.mac_address);
  END IF;
  IF NEW.tailscale_ip IS DISTINCT FROM OLD.tailscale_ip THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'network','tailscale_ip','changed',OLD.tailscale_ip,NEW.tailscale_ip);
  END IF;
  IF NEW.dns_servers IS DISTINCT FROM OLD.dns_servers THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'network','dns_servers','changed',OLD.dns_servers::text,NEW.dns_servers::text);
  END IF;
  IF NEW.network_interfaces IS DISTINCT FROM OLD.network_interfaces THEN
    INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
    VALUES (NEW.tenant_id,NEW.id,'network','interfaces','changed',
      jsonb_array_length(COALESCE(OLD.network_interfaces,'[]'::jsonb))::text || ' interfaces',
      jsonb_array_length(COALESCE(NEW.network_interfaces,'[]'::jsonb))::text || ' interfaces');
  END IF;

  -- Disks composition (sizes change ≠ usage change; we hash by name+size_gb)
  IF NEW.disks IS DISTINCT FROM OLD.disks THEN
    -- only log when count or names/sizes change, not free space
    IF (
      SELECT COALESCE(jsonb_agg(d->>'name' || ':' || COALESCE(d->>'size_gb','?') ORDER BY d->>'name'), '[]'::jsonb)
      FROM jsonb_array_elements(COALESCE(OLD.disks,'[]'::jsonb)) d
    ) IS DISTINCT FROM (
      SELECT COALESCE(jsonb_agg(d->>'name' || ':' || COALESCE(d->>'size_gb','?') ORDER BY d->>'name'), '[]'::jsonb)
      FROM jsonb_array_elements(COALESCE(NEW.disks,'[]'::jsonb)) d
    ) THEN
      INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
      VALUES (NEW.tenant_id,NEW.id,'hardware','disks','changed',
        jsonb_array_length(COALESCE(OLD.disks,'[]'::jsonb))::text || ' discos',
        jsonb_array_length(COALESCE(NEW.disks,'[]'::jsonb))::text || ' discos');
    END IF;
  END IF;

  -- Installed software diff (by name)
  IF NEW.installed_software IS DISTINCT FROM OLD.installed_software THEN
    _old_sw := COALESCE(OLD.installed_software,'[]'::jsonb);
    _new_sw := COALESCE(NEW.installed_software,'[]'::jsonb);

    -- Added
    FOR _item IN
      SELECT n FROM jsonb_array_elements(_new_sw) n
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(_old_sw) o
        WHERE lower(o->>'name') = lower(n->>'name')
      )
    LOOP
      _name := _item->>'name';
      _ver  := _item->>'version';
      IF _name IS NOT NULL THEN
        INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
        VALUES (NEW.tenant_id,NEW.id,'software',_name,'added',NULL,_ver);
      END IF;
    END LOOP;

    -- Removed
    FOR _item IN
      SELECT o FROM jsonb_array_elements(_old_sw) o
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(_new_sw) n
        WHERE lower(n->>'name') = lower(o->>'name')
      )
    LOOP
      _name := _item->>'name';
      _ver  := _item->>'version';
      IF _name IS NOT NULL THEN
        INSERT INTO public.endpoint_inventory_history(tenant_id,endpoint_id,category,field,change_type,old_value,new_value)
        VALUES (NEW.tenant_id,NEW.id,'software',_name,'removed',_ver,NULL);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_endpoints_log_inventory
  AFTER UPDATE ON public.endpoints
  FOR EACH ROW
  EXECUTE FUNCTION public.log_endpoint_inventory_changes();

-- Retention: keep 30 days of history + 30 days of metric samples
CREATE OR REPLACE FUNCTION public.cleanup_endpoint_history()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.endpoint_inventory_history WHERE created_at < now() - interval '30 days';
  DELETE FROM public.endpoint_metric_samples    WHERE sampled_at < now() - interval '30 days';
$$;

-- Schedule daily cleanup (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('endpoint-history-cleanup');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('endpoint-history-cleanup', '15 3 * * *', $$SELECT public.cleanup_endpoint_history();$$);


-- ─────────────────────────────────────────────────────────────────────
-- 20260622115458_9c8321cd-7901-4776-b30a-a2732cd40748.sql
-- ─────────────────────────────────────────────────────────────────────
-- Outages log for endpoint network/agent connectivity
CREATE TABLE public.endpoint_outages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint_id UUID NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  reason TEXT NOT NULL DEFAULT 'no_heartbeat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_endpoint_outages_endpoint ON public.endpoint_outages(endpoint_id, started_at DESC);
CREATE INDEX idx_endpoint_outages_open ON public.endpoint_outages(endpoint_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX uniq_endpoint_outages_open ON public.endpoint_outages(endpoint_id) WHERE ended_at IS NULL;

GRANT SELECT ON public.endpoint_outages TO authenticated;
GRANT ALL ON public.endpoint_outages TO service_role;

ALTER TABLE public.endpoint_outages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read outages"
  ON public.endpoint_outages FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

-- Detector: marks endpoints offline after 3 min without heartbeat, closes outages on return
CREATE OR REPLACE FUNCTION public.detect_endpoint_outages()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ep RECORD;
  _open RECORD;
  _count INTEGER := 0;
  _threshold INTERVAL := interval '3 minutes';
BEGIN
  -- Open outages for endpoints that went silent
  FOR _ep IN
    SELECT e.id, e.tenant_id, e.last_heartbeat
    FROM public.endpoints e
    WHERE e.last_heartbeat IS NOT NULL
      AND e.last_heartbeat < now() - _threshold
      AND NOT EXISTS (
        SELECT 1 FROM public.endpoint_outages o
        WHERE o.endpoint_id = e.id AND o.ended_at IS NULL
      )
  LOOP
    INSERT INTO public.endpoint_outages (tenant_id, endpoint_id, started_at, reason)
    VALUES (_ep.tenant_id, _ep.id, _ep.last_heartbeat, 'no_heartbeat');
    UPDATE public.endpoints SET status = 'offline' WHERE id = _ep.id AND status <> 'offline';
    _count := _count + 1;
  END LOOP;

  -- Close outages for endpoints that came back
  FOR _open IN
    SELECT o.id, o.started_at, e.last_heartbeat
    FROM public.endpoint_outages o
    JOIN public.endpoints e ON e.id = o.endpoint_id
    WHERE o.ended_at IS NULL
      AND e.last_heartbeat IS NOT NULL
      AND e.last_heartbeat > o.started_at
      AND e.last_heartbeat > now() - _threshold
  LOOP
    UPDATE public.endpoint_outages
       SET ended_at = _open.last_heartbeat,
           duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (_open.last_heartbeat - _open.started_at))::int)
     WHERE id = _open.id;
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

-- Extend retention cleanup to outages
CREATE OR REPLACE FUNCTION public.cleanup_endpoint_history()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.endpoint_inventory_history WHERE created_at < now() - interval '30 days';
  DELETE FROM public.endpoint_metric_samples    WHERE sampled_at < now() - interval '30 days';
  DELETE FROM public.endpoint_outages           WHERE COALESCE(ended_at, started_at) < now() - interval '30 days';
$$;

-- Schedule detector every minute
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'detect-endpoint-outages') THEN
    PERFORM cron.unschedule('detect-endpoint-outages');
  END IF;
  PERFORM cron.schedule(
    'detect-endpoint-outages',
    '* * * * *',
    $cron$ SELECT public.detect_endpoint_outages(); $cron$
  );
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 20260622115713_d62266b6-2a4a-4b56-a07c-11f61c5c4d39.sql
-- ─────────────────────────────────────────────────────────────────────
-- 1) Scope endpoint_inventory_history reads for portal users to their own client
DROP POLICY IF EXISTS "Tenant members can read inventory history" ON public.endpoint_inventory_history;
DROP POLICY IF EXISTS "tenant members read inventory history" ON public.endpoint_inventory_history;

CREATE POLICY "Tenant members can read inventory history"
  ON public.endpoint_inventory_history FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (
      NOT public.has_role(auth.uid(), 'portal'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.endpoints e
        WHERE e.id = endpoint_inventory_history.endpoint_id
          AND e.client_id = public.get_user_client(auth.uid())
      )
    )
  );

-- 2) Revoke EXECUTE from PUBLIC/anon on internal SECURITY DEFINER functions.
--    Keep them callable by authenticated (RLS helpers) or service_role only (triggers/jobs).

-- RLS helpers — needed by authenticated to evaluate policies
REVOKE EXECUTE ON FUNCTION public.get_user_tenant(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_client(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_tenant(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_client(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- App-action functions — only signed-in users should call
REVOKE EXECUTE ON FUNCTION public.evaluate_alert_rules() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.run_automation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_invoice_from_contract(uuid, date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_invoice_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_alert_rules() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_automation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_invoice_from_contract(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_invoice_paid(uuid) TO authenticated, service_role;

-- Trigger / cron-only helpers — never callable from the API
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tickets_log_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tickets_status_timestamps() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_ticket_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_invoice_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_invoice_totals() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_endpoint_inventory_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_scheduled_automations() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_endpoint_outages() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_endpoint_history() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_matches(text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_field_matches(text, integer) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 20260622124531_31cf1702-8b82-49bb-8192-e43f083c4031.sql
-- ─────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────
-- 20260622152721_c7d360c9-898f-4da5-9ae2-d67d18b90cdb.sql
-- ─────────────────────────────────────────────────────────────────────

-- A2/A6: campos novos em endpoints e métricas
ALTER TABLE public.endpoint_metric_samples
  ADD COLUMN IF NOT EXISTS gateway_rtt_ms NUMERIC;

ALTER TABLE public.endpoints
  ADD COLUMN IF NOT EXISTS os_last_update_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_updates JSONB DEFAULT '[]'::jsonb;

-- B1: canais de notificação
CREATE TYPE public.notification_channel_kind AS ENUM ('email','webhook','slack','teams','whatsapp');

CREATE TABLE public.notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind public.notification_channel_kind NOT NULL,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_channels TO authenticated;
GRANT ALL ON public.notification_channels TO service_role;
ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read channels" ON public.notification_channels FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "admins manage channels" ON public.notification_channels FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));
CREATE TRIGGER trg_notification_channels_updated BEFORE UPDATE ON public.notification_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.alert_rules
  ADD COLUMN IF NOT EXISTS channel_ids UUID[] DEFAULT '{}'::uuid[];

-- B2/B3: templates de automação e aprovação
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE public.automation_approval_status AS ENUM ('pending','approved','rejected');

CREATE TABLE public.automation_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  requested_by UUID,
  approved_by UUID,
  status public.automation_approval_status NOT NULL DEFAULT 'pending',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_approvals TO authenticated;
GRANT ALL ON public.automation_approvals TO service_role;
ALTER TABLE public.automation_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read approvals" ON public.automation_approvals FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE POLICY "staff insert approvals" ON public.automation_approvals FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));
CREATE POLICY "admins decide approvals" ON public.automation_approvals FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(),'admin'));

-- C1: WhatsApp opt-in no contato
ALTER TABLE public.client_contacts
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_client_contacts_phone ON public.client_contacts(phone);

-- C3: log de mensagens WhatsApp
CREATE TYPE public.whatsapp_direction AS ENUM ('inbound','outbound');
CREATE TYPE public.whatsapp_status AS ENUM ('pending','sent','delivered','failed','received');

CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  direction public.whatsapp_direction NOT NULL,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  status public.whatsapp_status NOT NULL DEFAULT 'pending',
  provider_sid TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read whatsapp" ON public.whatsapp_messages FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));

-- B2: seed da biblioteca de scripts prontos (templates compartilhados via tenant_id = NULL? Não — tabela exige tenant. Marcamos como template sem scope; cada tenant clona.)
-- Como automations.tenant_id é NOT NULL, criamos por tenant on-demand via UI. Em vez disso, criamos uma tabela de catálogo global.
CREATE TABLE public.automation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  kind public.automation_kind NOT NULL,
  language public.automation_language,
  code TEXT,
  power_action TEXT,
  tags TEXT[] DEFAULT '{}',
  destructive BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.automation_templates TO authenticated, anon;
GRANT ALL ON public.automation_templates TO service_role;
ALTER TABLE public.automation_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates public read" ON public.automation_templates FOR SELECT USING (true);

INSERT INTO public.automation_templates (name, description, kind, language, code, destructive, tags) VALUES
('Limpar %TEMP% (Windows)', 'Remove arquivos temporários do usuário e do sistema.', 'script', 'powershell',
$$Get-ChildItem -Path $env:TEMP -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path "$env:WINDIR\Temp" -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "TEMP cleaned"$$, false, ARRAY['windows','limpeza']),
('Flush DNS', 'Limpa o cache de DNS do Windows.', 'script', 'powershell', 'ipconfig /flushdns', false, ARRAY['windows','rede']),
('Reiniciar Spooler', 'Reinicia o serviço de impressão.', 'script', 'powershell',
'Restart-Service -Name Spooler -Force; Get-Service Spooler', false, ARRAY['windows','impressao']),
('Forçar gpupdate /force', 'Atualiza políticas de grupo.', 'script', 'powershell', 'gpupdate /force', false, ARRAY['windows','dominio']),
('Windows Update (install)', 'Instala atualizações pendentes via PSWindowsUpdate.', 'script', 'powershell',
'if (-not (Get-Module -ListAvailable PSWindowsUpdate)) { Install-Module PSWindowsUpdate -Force -Scope AllUsers }
Import-Module PSWindowsUpdate
Get-WindowsUpdate -Install -AcceptAll -AutoReboot:$false', true, ARRAY['windows','update']),
('Coletar Event Viewer (System)', 'Últimos 200 eventos de erro do log System.', 'script', 'powershell',
'Get-EventLog -LogName System -EntryType Error -Newest 200 | Format-Table -AutoSize | Out-String', false, ARRAY['windows','diagnostico']),
('Limpar lixeira', 'Esvazia a lixeira de todos os usuários.', 'script', 'powershell',
'Clear-RecycleBin -Force -ErrorAction SilentlyContinue; Write-Output "Recycle bin cleared"', true, ARRAY['windows','limpeza']),
('Reiniciar serviço (param NAME)', 'Reinicia serviço pelo nome (edite NAME antes).', 'script', 'powershell',
'$svc = "NAME"; Restart-Service -Name $svc -Force; Get-Service $svc', false, ARRAY['windows','servicos']);

-- A4: detecção de anomalia simples
CREATE OR REPLACE FUNCTION public.detect_metric_anomalies()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r RECORD;
  _count INT := 0;
  _avg NUMERIC; _stddev NUMERIC; _latest NUMERIC;
  _metric TEXT;
BEGIN
  FOR _r IN SELECT id, tenant_id, hostname FROM public.endpoints WHERE last_heartbeat > now() - interval '15 minutes' LOOP
    FOREACH _metric IN ARRAY ARRAY['cpu','ram','disk'] LOOP
      EXECUTE format(
        'SELECT avg(%I), stddev_samp(%I) FROM public.endpoint_metric_samples
         WHERE endpoint_id = $1 AND sampled_at > now() - interval ''24 hours''',
        _metric||'_usage', _metric||'_usage'
      ) INTO _avg, _stddev USING _r.id;

      EXECUTE format('SELECT %I FROM public.endpoints WHERE id = $1', _metric||'_usage')
        INTO _latest USING _r.id;

      IF _latest IS NOT NULL AND _avg IS NOT NULL AND _stddev IS NOT NULL
         AND _stddev > 3 AND _latest > _avg + 2 * _stddev AND _latest > 60 THEN
        INSERT INTO public.alerts (tenant_id, endpoint_id, client_id, metric, severity, value, threshold, message, status)
        SELECT _r.tenant_id, _r.id, e.client_id, _metric, 'warning', _latest, _avg + 2 * _stddev,
               _r.hostname || ' — anomalia em ' || _metric || ' (' || round(_latest,1) || '% vs média ' || round(_avg,1) || '%)',
               'open'
        FROM public.endpoints e WHERE e.id = _r.id
        ON CONFLICT DO NOTHING;
        _count := _count + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN _count;
END;
$$;

-- B3: substitui run_automation para respeitar requires_approval
CREATE OR REPLACE FUNCTION public.run_automation(_automation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
  _auto RECORD;
  _ep RECORD;
  _count INTEGER := 0;
  _caller UUID;
  _is_scheduled BOOLEAN := false;
  _has_pending BOOLEAN;
BEGIN
  _caller := auth.uid();
  IF _caller IS NULL THEN
    _is_scheduled := true;
    SELECT tenant_id INTO _tenant FROM public.automations WHERE id = _automation_id;
  ELSE
    _tenant := public.get_user_tenant(_caller);
    IF _tenant IS NULL THEN RETURN 0; END IF;
    IF NOT (public.has_role(_caller, 'admin') OR public.has_role(_caller, 'technician')) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  SELECT * INTO _auto FROM public.automations WHERE id = _automation_id AND tenant_id = _tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'automation not found'; END IF;

  -- Se requer aprovação e ninguém aprovou recentemente, cria pedido e retorna 0
  IF _auto.requires_approval AND NOT _is_scheduled THEN
    SELECT EXISTS(
      SELECT 1 FROM public.automation_approvals
      WHERE automation_id = _auto.id AND status = 'approved'
        AND decided_at > now() - interval '5 minutes'
    ) INTO _has_pending;
    IF NOT _has_pending THEN
      INSERT INTO public.automation_approvals (tenant_id, automation_id, requested_by, status)
      VALUES (_tenant, _auto.id, _caller, 'pending');
      RETURN 0;
    END IF;
  END IF;

  FOR _ep IN
    SELECT e.* FROM public.endpoints e
    WHERE e.tenant_id = _tenant
      AND (_auto.scope = 'all'
        OR (_auto.scope = 'client' AND e.client_id = _auto.client_id)
        OR (_auto.scope = 'endpoint' AND e.id = _auto.endpoint_id))
  LOOP
    IF _auto.kind = 'power' AND _auto.power_action IS NOT NULL THEN
      INSERT INTO public.endpoint_commands (tenant_id, endpoint_id, command, params)
      VALUES (_tenant, _ep.id, _auto.power_action,
        jsonb_build_object('delay_seconds', COALESCE(_auto.power_delay_seconds, 30),
          'message', COALESCE(_auto.power_message, ''), 'automation_id', _auto.id));
      INSERT INTO public.automation_runs (tenant_id, automation_id, endpoint_id, client_id, status,
         triggered_by, trigger_source, exit_code, output, duration_ms, started_at, finished_at)
      VALUES (_tenant, _auto.id, _ep.id, _ep.client_id, 'success', _caller,
        CASE WHEN _is_scheduled THEN 'schedule' ELSE 'manual' END, 0,
        'Power command ' || _auto.power_action || ' queued for ' || _ep.hostname, 50, now(), now());
    ELSE
      INSERT INTO public.automation_runs (tenant_id, automation_id, endpoint_id, client_id, status,
         triggered_by, trigger_source, exit_code, output, duration_ms, started_at, finished_at)
      VALUES (_tenant, _auto.id, _ep.id, _ep.client_id, 'success', _caller,
        CASE WHEN _is_scheduled THEN 'schedule' ELSE 'manual' END, 0,
        'Simulated run on ' || _ep.hostname || E'\n' || left(COALESCE(_auto.code, ''), 400),
        (random() * 4000 + 500)::int, now(), now() + interval '1 second');
    END IF;
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$$;

-- Função para aprovar pedido (e disparar a automação)
CREATE OR REPLACE FUNCTION public.approve_automation(_approval_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _appr RECORD; _tenant UUID; _ran INT;
BEGIN
  _tenant := public.get_user_tenant(auth.uid());
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.automation_approvals
    SET status='approved', approved_by=auth.uid(), decided_at=now()
    WHERE id=_approval_id AND tenant_id=_tenant AND status='pending'
    RETURNING * INTO _appr;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found or already decided'; END IF;
  SELECT public.run_automation(_appr.automation_id) INTO _ran;
  RETURN _ran;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_automation(_approval_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _tenant UUID;
BEGIN
  _tenant := public.get_user_tenant(auth.uid());
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.automation_approvals
    SET status='rejected', approved_by=auth.uid(), decided_at=now(), reason=COALESCE(_reason, reason)
    WHERE id=_approval_id AND tenant_id=_tenant AND status='pending';
END;
$$;


-- ─────────────────────────────────────────────────────────────────────
-- 20260622154232_e9e24567-cefd-4b5b-a479-0173613a103a.sql
-- ─────────────────────────────────────────────────────────────────────

-- =========================================================
-- Item 6 — Agente: auto-update, comandos assinados, eventos, health-check
-- =========================================================

-- 1) tenants: chave secreta para assinar comandos
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS command_signing_key TEXT;

UPDATE public.tenants
  SET command_signing_key = encode(extensions.gen_random_bytes(32), 'hex')
  WHERE command_signing_key IS NULL;

ALTER TABLE public.tenants ALTER COLUMN command_signing_key SET NOT NULL;
ALTER TABLE public.tenants
  ALTER COLUMN command_signing_key SET DEFAULT encode(extensions.gen_random_bytes(32), 'hex');

-- 2) endpoints: canal de atualização + health do agente
ALTER TABLE public.endpoints
  ADD COLUMN IF NOT EXISTS update_channel TEXT NOT NULL DEFAULT 'stable',
  ADD COLUMN IF NOT EXISTS agent_last_update_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agent_cpu_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS agent_ram_mb INTEGER,
  ADD COLUMN IF NOT EXISTS agent_last_error TEXT,
  ADD COLUMN IF NOT EXISTS agent_last_error_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agent_heartbeat_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS agent_queue_size INTEGER;

ALTER TABLE public.endpoints
  DROP CONSTRAINT IF EXISTS endpoints_update_channel_check;
ALTER TABLE public.endpoints
  ADD CONSTRAINT endpoints_update_channel_check CHECK (update_channel IN ('stable','beta'));

-- 3) endpoint_commands: novos status, timeout, assinatura, expiração
ALTER TYPE public.endpoint_command_status ADD VALUE IF NOT EXISTS 'timeout';
ALTER TYPE public.endpoint_command_status ADD VALUE IF NOT EXISTS 'expired';

ALTER TABLE public.endpoint_commands
  ADD COLUMN IF NOT EXISTS timeout_seconds INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS signature TEXT,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_reason TEXT;

-- Trigger para assinar comandos na inserção
CREATE OR REPLACE FUNCTION public.sign_endpoint_command()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _key TEXT;
BEGIN
  IF NEW.signature IS NOT NULL THEN RETURN NEW; END IF;
  SELECT command_signing_key INTO _key FROM public.tenants WHERE id = NEW.tenant_id;
  IF _key IS NULL THEN RETURN NEW; END IF;
  NEW.signature := encode(
    extensions.hmac(
      NEW.id::text || '|' || NEW.command::text || '|' || COALESCE(NEW.params::text, '{}') || '|' || NEW.timeout_seconds::text,
      _key, 'sha256'
    ), 'hex');
  NEW.signed_at := now();
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := now() + (GREATEST(NEW.timeout_seconds * 2, 600) || ' seconds')::interval;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_endpoint_commands_sign ON public.endpoint_commands;
CREATE TRIGGER trg_endpoint_commands_sign
  BEFORE INSERT ON public.endpoint_commands
  FOR EACH ROW EXECUTE FUNCTION public.sign_endpoint_command();

-- 4) endpoint_command_logs
CREATE TABLE IF NOT EXISTS public.endpoint_command_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  command_id UUID NOT NULL REFERENCES public.endpoint_commands(id) ON DELETE CASCADE,
  endpoint_id UUID NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','warn','error')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.endpoint_command_logs TO authenticated;
GRANT ALL ON public.endpoint_command_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.endpoint_command_logs_id_seq TO authenticated, service_role;

ALTER TABLE public.endpoint_command_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read command logs" ON public.endpoint_command_logs
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_command_logs_command ON public.endpoint_command_logs(command_id, created_at);

-- 5) endpoint_events
DO $$ BEGIN
  CREATE TYPE public.endpoint_event_level AS ENUM ('info','warning','error','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.endpoint_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint_id UUID NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'windows',
  level public.endpoint_event_level NOT NULL DEFAULT 'error',
  event_id INTEGER,
  provider TEXT,
  message TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.endpoint_events TO authenticated;
GRANT ALL ON public.endpoint_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.endpoint_events_id_seq TO authenticated, service_role;

ALTER TABLE public.endpoint_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read endpoint events" ON public.endpoint_events
  FOR SELECT TO authenticated USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (NOT public.has_role(auth.uid(), 'portal'::app_role)
         OR EXISTS (SELECT 1 FROM public.endpoints e
                    WHERE e.id = endpoint_events.endpoint_id
                      AND e.client_id = public.get_user_client(auth.uid())))
  );

CREATE INDEX IF NOT EXISTS idx_endpoint_events_lookup
  ON public.endpoint_events(endpoint_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_endpoint_events_tenant_time
  ON public.endpoint_events(tenant_id, occurred_at DESC);

-- 6) agent_releases (global; leitura pública do mais recente)
CREATE TABLE IF NOT EXISTS public.agent_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL CHECK (channel IN ('stable','beta')),
  version TEXT NOT NULL,
  script_url TEXT NOT NULL,
  sha256 TEXT,
  notes TEXT,
  released_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel, version)
);

GRANT SELECT ON public.agent_releases TO anon, authenticated;
GRANT ALL ON public.agent_releases TO service_role;

ALTER TABLE public.agent_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads agent releases" ON public.agent_releases
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "admins manage agent releases" ON public.agent_releases
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.agent_releases (channel, version, script_url, notes) VALUES
  ('stable', '1.6.0', '/agent/install.ps1', 'Auto-update, comandos assinados, eventos e self-health'),
  ('beta',   '1.6.0', '/agent/install.ps1', 'Auto-update, comandos assinados, eventos e self-health')
ON CONFLICT (channel, version) DO NOTHING;

-- 7) função pública para o último release por canal
CREATE OR REPLACE FUNCTION public.get_latest_agent_release(_channel TEXT)
RETURNS TABLE(channel TEXT, version TEXT, script_url TEXT, sha256 TEXT, released_at TIMESTAMPTZ)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT channel, version, script_url, sha256, released_at
    FROM public.agent_releases
   WHERE channel = COALESCE(_channel, 'stable')
   ORDER BY released_at DESC
   LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_agent_release(TEXT) TO anon, authenticated, service_role;

-- 8) cleanup ampliado para eventos e command logs
CREATE OR REPLACE FUNCTION public.cleanup_endpoint_history()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.endpoint_inventory_history WHERE created_at < now() - interval '30 days';
  DELETE FROM public.endpoint_metric_samples    WHERE sampled_at < now() - interval '30 days';
  DELETE FROM public.endpoint_outages           WHERE COALESCE(ended_at, started_at) < now() - interval '30 days';
  DELETE FROM public.endpoint_events            WHERE occurred_at < now() - interval '30 days';
  DELETE FROM public.endpoint_command_logs      WHERE created_at < now() - interval '14 days';
$$;


-- ─────────────────────────────────────────────────────────────────────
-- 20260623135835_447a6c5d-4598-40ac-a608-f69cfaee6007.sql
-- ─────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────
-- 20260701172254_ddfd2075-ef8d-490e-a387-509f9c0aca95.sql
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS public_intake_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_intake_slug TEXT UNIQUE;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS submitter_name TEXT,
  ADD COLUMN IF NOT EXISTS submitter_email TEXT,
  ADD COLUMN IF NOT EXISTS submitter_phone TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'internal';

-- Public lookup function (safe: returns only client name + tenant name for display)
CREATE OR REPLACE FUNCTION public.get_public_intake(_slug TEXT)
RETURNS TABLE(client_id UUID, client_name TEXT, tenant_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.id, c.name, t.name
  FROM public.clients c
  JOIN public.tenants t ON t.id = c.tenant_id
  WHERE c.public_intake_slug = _slug AND c.public_intake_enabled = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_intake(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_intake(TEXT) TO service_role;

-- Insert function used by the public endpoint (service role only)
CREATE OR REPLACE FUNCTION public.submit_public_ticket(
  _slug TEXT, _title TEXT, _description TEXT,
  _name TEXT, _email TEXT, _phone TEXT, _priority TEXT DEFAULT 'medium'
) RETURNS TABLE(ticket_id UUID, ticket_number TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _client RECORD;
  _tid UUID;
  _num TEXT;
BEGIN
  IF _title IS NULL OR length(trim(_title)) < 3 THEN RAISE EXCEPTION 'title too short'; END IF;
  IF _name  IS NULL OR length(trim(_name))  < 2 THEN RAISE EXCEPTION 'name required'; END IF;
  IF _email IS NULL OR _email !~ '^[^@]+@[^@]+\.[^@]+$' THEN RAISE EXCEPTION 'invalid email'; END IF;

  SELECT c.id AS id, c.tenant_id AS tenant_id
    INTO _client
    FROM public.clients c
   WHERE c.public_intake_slug = _slug AND c.public_intake_enabled = true
   LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'intake not found'; END IF;

  INSERT INTO public.tickets(
    tenant_id, client_id, title, description, priority, category, source,
    submitter_name, submitter_email, submitter_phone
  ) VALUES (
    _client.tenant_id, _client.id, trim(_title), _description,
    COALESCE(NULLIF(_priority,'')::ticket_priority,'medium'::ticket_priority),
    'request'::ticket_category, 'public_intake',
    trim(_name), lower(trim(_email)), NULLIF(trim(COALESCE(_phone,'')),'')
  ) RETURNING id, number INTO _tid, _num;

  RETURN QUERY SELECT _tid, _num;
END $$;

REVOKE ALL ON FUNCTION public.submit_public_ticket(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_ticket(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260701181745_7226defa-d0f3-42c1-ba90-2e4b51580f17.sql
-- ─────────────────────────────────────────────────────────────────────

-- 1) Move command_signing_key out of tenants into a secrets-only table
CREATE TABLE IF NOT EXISTS public.tenant_secrets (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  command_signing_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No grants to anon/authenticated: only service_role and SECURITY DEFINER functions may touch this.
GRANT ALL ON public.tenant_secrets TO service_role;
ALTER TABLE public.tenant_secrets ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: default-deny for anon/authenticated. service_role bypasses RLS.

-- Backfill existing keys, if the column exists on tenants
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tenants' AND column_name='command_signing_key'
  ) THEN
    INSERT INTO public.tenant_secrets (tenant_id, command_signing_key)
    SELECT id, command_signing_key FROM public.tenants
    WHERE command_signing_key IS NOT NULL
    ON CONFLICT (tenant_id) DO UPDATE SET command_signing_key = EXCLUDED.command_signing_key;

    ALTER TABLE public.tenants DROP COLUMN command_signing_key;
  END IF;
END $$;

-- Update sign_endpoint_command trigger function to pull the key from tenant_secrets
CREATE OR REPLACE FUNCTION public.sign_endpoint_command()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE _key TEXT;
BEGIN
  IF NEW.signature IS NOT NULL THEN RETURN NEW; END IF;
  SELECT command_signing_key INTO _key FROM public.tenant_secrets WHERE tenant_id = NEW.tenant_id;
  IF _key IS NULL THEN RETURN NEW; END IF;
  NEW.signature := encode(
    extensions.hmac(
      NEW.id::text || '|' || NEW.command::text || '|' || COALESCE(NEW.params::text, '{}') || '|' || NEW.timeout_seconds::text,
      _key, 'sha256'
    ), 'hex');
  NEW.signed_at := now();
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := now() + (GREATEST(NEW.timeout_seconds * 2, 600) || ' seconds')::interval;
  END IF;
  RETURN NEW;
END $function$;

-- 2) Restrict automation_templates read access to authenticated users only
DROP POLICY IF EXISTS "templates public read" ON public.automation_templates;
CREATE POLICY "templates authenticated read"
  ON public.automation_templates
  FOR SELECT
  TO authenticated
  USING (true);

-- 3) Revoke EXECUTE from anon/public on every SECURITY DEFINER function in public
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon;', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role;', r.proname, r.args);
  END LOOP;
END $$;

-- Public intake RPCs must remain callable without a session (used by anon submit form)
GRANT EXECUTE ON FUNCTION public.get_public_intake(text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_public_ticket(text, text, text, text, text, text, text) TO anon;


-- ─────────────────────────────────────────────────────────────────────
-- 20260703133205_aad8031c-ee62-495d-8ab5-31592e99726c.sql
-- ─────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────
-- 20260721001149_977b9351-004f-4202-adfd-574ce9e4245e.sql
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE public.endpoint_maintenance_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint_id UUID NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind TEXT NOT NULL DEFAULT 'maintenance', -- 'maintenance' | 'cleaning' | 'both'
  notes TEXT,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX endpoint_maintenance_logs_endpoint_idx ON public.endpoint_maintenance_logs(endpoint_id, performed_at DESC);
CREATE INDEX endpoint_maintenance_logs_tenant_idx ON public.endpoint_maintenance_logs(tenant_id, performed_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.endpoint_maintenance_logs TO authenticated;
GRANT ALL ON public.endpoint_maintenance_logs TO service_role;

ALTER TABLE public.endpoint_maintenance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_read_maintenance" ON public.endpoint_maintenance_logs
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician') OR public.has_role(auth.uid(),'viewer')));

CREATE POLICY "tenant_write_maintenance" ON public.endpoint_maintenance_logs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));

CREATE POLICY "tenant_update_maintenance" ON public.endpoint_maintenance_logs
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));

CREATE POLICY "tenant_delete_maintenance" ON public.endpoint_maintenance_logs
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'technician')));

-- Denormalized "last" fields on endpoints for quick display / sorting
ALTER TABLE public.endpoints
  ADD COLUMN IF NOT EXISTS last_maintenance_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_maintenance_kind TEXT,
  ADD COLUMN IF NOT EXISTS last_maintenance_notes TEXT;

CREATE OR REPLACE FUNCTION public.sync_endpoint_last_maintenance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _last RECORD;
BEGIN
  SELECT performed_at, kind, notes INTO _last
    FROM public.endpoint_maintenance_logs
   WHERE endpoint_id = COALESCE(NEW.endpoint_id, OLD.endpoint_id)
   ORDER BY performed_at DESC LIMIT 1;
  UPDATE public.endpoints
     SET last_maintenance_at = _last.performed_at,
         last_maintenance_kind = _last.kind,
         last_maintenance_notes = _last.notes
   WHERE id = COALESCE(NEW.endpoint_id, OLD.endpoint_id);
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER endpoint_maintenance_sync
AFTER INSERT OR UPDATE OR DELETE ON public.endpoint_maintenance_logs
FOR EACH ROW EXECUTE FUNCTION public.sync_endpoint_last_maintenance();



-- ─────────────────────────────────────────
-- 20260825103919_audit_log_diff_only.sql
-- ─────────────────────────────────────────
-- =============================================================================
-- Correção: auditoria de endpoints inflando o banco (~1 GB/dia)
--
-- Causa: log_audit_event() gravava to_jsonb(OLD) + to_jsonb(NEW) — a linha
-- inteira, duas vezes — em TODO update. Os agentes mandam heartbeat a cada
-- 60 segundos e cada heartbeat reescreve o inventário completo do endpoint
-- (processos em execução, serviços, software instalado). Dá ~30 kB de
-- auditoria por heartbeat, ~1 GB por dia com 25 endpoints.
--
-- Correção, em duas partes:
--   1. Em UPDATE, gravar apenas os campos que mudaram, não a linha inteira.
--      INSERT e DELETE continuam guardando tudo.
--   2. Ignorar as colunas escritas por máquina. A lista é POR TABELA — em
--      endpoints o "status" é derivado do agente e é ruído, mas em tickets
--      o "status" é ação humana e precisa ser auditado.
--
-- As mudanças de inventário já têm histórico próprio em
-- endpoint_inventory_history, gravado pelo gatilho trg_endpoints_log_inventory.
-- Duplicá-las na auditoria nunca acrescentou informação.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.log_audit_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tenant UUID;
  _entity UUID;
  _summary TEXT;
  _actor_email TEXT;
  _actor UUID;
  _oldj JSONB;
  _newj JSONB;
  _old JSONB;
  _new JSONB;
  _changed TEXT[];
  _noise TEXT[];

  -- Ruído em qualquer tabela.
  _noise_all CONSTANT TEXT[] := ARRAY['updated_at'];

  -- Colunas de endpoints escritas pelo agente a cada heartbeat.
  _noise_endpoints CONSTANT TEXT[] := ARRAY[
    -- telemetria
    'last_heartbeat','last_seen_ip','status','cpu_usage','ram_usage','disk_usage',
    'agent_cpu_pct','agent_ram_mb','agent_heartbeat_duration_ms','agent_queue_size',
    'agent_last_error','agent_last_error_at','agent_version','os_version',
    'tailscale_ip','os_last_update_at','inventory_updated_at',
    -- inventário (já versionado em endpoint_inventory_history)
    'cpu_model','cpu_cores','cpu_threads','ram_total_mb','gpu','manufacturer','model',
    'serial_number','motherboard','bios_vendor','bios_version','bios_date','uptime_seconds',
    'last_boot_at','timezone','domain','logged_user','public_ip','gateway','dns_servers',
    'disks','network_interfaces','installed_software','running_processes','services',
    'pending_updates'
  ];
BEGIN
  _actor := auth.uid();

  IF TG_OP = 'DELETE' THEN
    _oldj   := to_jsonb(OLD);
    _tenant := (_oldj->>'tenant_id')::UUID;
    _entity := (_oldj->>'id')::UUID;
    _old    := _oldj;
    _new    := NULL;
    _summary := COALESCE(_oldj->>'name', _oldj->>'hostname', _oldj->>'title', _entity::text);

  ELSIF TG_OP = 'INSERT' THEN
    _newj   := to_jsonb(NEW);
    _tenant := (_newj->>'tenant_id')::UUID;
    _entity := (_newj->>'id')::UUID;
    _old    := NULL;
    _new    := _newj;
    _summary := COALESCE(_newj->>'name', _newj->>'hostname', _newj->>'title', _entity::text);

  ELSE
    _oldj   := to_jsonb(OLD);
    _newj   := to_jsonb(NEW);
    _tenant := (_newj->>'tenant_id')::UUID;
    _entity := (_newj->>'id')::UUID;
    _summary := COALESCE(_newj->>'name', _newj->>'hostname', _newj->>'title', _entity::text);

    _noise := _noise_all;
    IF TG_TABLE_NAME = 'endpoints' THEN
      _noise := _noise || _noise_endpoints;
    END IF;

    SELECT array_agg(n.key) INTO _changed
    FROM jsonb_each(_newj) n
    WHERE NOT (n.key = ANY(_noise))
      AND (_oldj -> n.key) IS DISTINCT FROM n.value;

    -- Só mudou coisa de máquina: nada a auditar.
    IF _changed IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT jsonb_object_agg(k, COALESCE(_oldj -> k, 'null'::jsonb)) INTO _old FROM unnest(_changed) k;
    SELECT jsonb_object_agg(k, COALESCE(_newj -> k, 'null'::jsonb)) INTO _new FROM unnest(_changed) k;
  END IF;

  IF _tenant IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT email INTO _actor_email FROM public.profiles WHERE id = _actor;

  INSERT INTO public.audit_logs(
    tenant_id, actor_id, actor_email, action,
    entity_table, entity_id, summary, old_values, new_values
  )
  VALUES (
    _tenant, _actor, _actor_email, lower(TG_OP),
    TG_TABLE_NAME, _entity, _summary, _old, _new
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;



-- ==============================================================================
-- VERIFICAÇÃO — rode depois e compare com os números do cabeçalho
-- ==============================================================================
-- select
--   (select count(*) from pg_tables where schemaname='public')                as tabelas,
--   (select count(*) from pg_policies where schemaname='public')              as policies,
--   (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--      where n.nspname='public')                                              as funcoes,
--   (select count(*) from cron.job)                                           as jobs_agendados;
--
-- -- Nenhuma tabela pode aparecer aqui (todas devem ter RLS ligado):
-- select tablename from pg_tables t where schemaname='public'
--   and not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
--     where n.nspname='public' and c.relname=t.tablename and c.relrowsecurity);
