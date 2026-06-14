
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
