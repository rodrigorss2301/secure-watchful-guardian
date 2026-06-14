
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
