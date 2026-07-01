import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/tickets/lookup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const slug = url.searchParams.get("slug");
        if (!slug) return json({ error: "missing_slug" }, 400);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("get_public_intake" as never, { _slug: slug } as never);
        if (error) return json({ error: "lookup_failed" }, 500);
        const rows = (Array.isArray(data) ? data : data ? [data] : []) as Array<{
          client_id?: string; client_name?: string; tenant_name?: string;
        }>;
        const row = rows[0];
        if (!row) return json({ error: "not_found" }, 404);
        return json({ client_name: row.client_name, tenant_name: row.tenant_name });
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}