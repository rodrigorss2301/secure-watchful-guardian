
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
