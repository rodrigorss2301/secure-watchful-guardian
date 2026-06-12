
GRANT EXECUTE ON FUNCTION public.get_user_tenant(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_user_client(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_alert_rules() TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_automation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_invoice_from_contract(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_invoice_paid(uuid) TO authenticated;
