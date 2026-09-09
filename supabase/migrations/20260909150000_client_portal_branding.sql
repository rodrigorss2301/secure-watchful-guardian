-- Per-client branding inherits the clients table's existing tenant/role RLS.
ALTER TABLE public.clients
  ADD COLUMN portal_logo_url text NOT NULL DEFAULT '',
  ADD COLUMN portal_primary_color text NOT NULL DEFAULT '#2563eb',
  ADD COLUMN portal_title text NOT NULL DEFAULT '',
  ADD COLUMN portal_message text NOT NULL DEFAULT '',
  ADD CONSTRAINT clients_portal_logo_url_check CHECK (
    length(portal_logo_url) <= 1000 AND
    (portal_logo_url = '' OR portal_logo_url ~ '^https://[^/@[:space:]]+([/:?#]|$)')
  ),
  ADD CONSTRAINT clients_portal_primary_color_check CHECK (portal_primary_color ~ '^#[0-9a-fA-F]{6}$'),
  ADD CONSTRAINT clients_portal_title_check CHECK (length(portal_title) <= 100),
  ADD CONSTRAINT clients_portal_message_check CHECK (length(portal_message) <= 400);

COMMENT ON COLUMN public.clients.portal_logo_url IS 'Public HTTPS logo for this client support portal.';
