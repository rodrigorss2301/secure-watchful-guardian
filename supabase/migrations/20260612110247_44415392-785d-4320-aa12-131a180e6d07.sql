
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
