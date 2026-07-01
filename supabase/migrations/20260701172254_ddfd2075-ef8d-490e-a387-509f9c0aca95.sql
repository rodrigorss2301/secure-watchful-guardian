
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
