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