import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/tickets/lookup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const slug = url.searchParams.get("slug");
        if (!slug) return json({ error: "missing_slug" }, 400);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc(
          "get_public_intake" as never,
          { _slug: slug } as never,
        );
        if (error) return json({ error: "lookup_failed" }, 500);
        const rows = (Array.isArray(data) ? data : data ? [data] : []) as Array<{
          client_id?: string;
          client_name?: string;
          tenant_name?: string;
        }>;
        const row = rows[0];
        if (!row) return json({ error: "not_found" }, 404);
        const { data: brand, error: brandError } = await supabaseAdmin
          .from("clients")
          .select("portal_logo_url, portal_primary_color, portal_title, portal_message")
          .eq("id", row.client_id!)
          .eq("public_intake_slug", slug)
          .eq("public_intake_enabled", true)
          .maybeSingle();
        if (brandError) return json({ error: "lookup_failed" }, 500);
        if (!brand) return json({ error: "not_found" }, 404);
        return json({ client_name: row.client_name, tenant_name: row.tenant_name, ...brand });
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
