
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
