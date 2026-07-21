import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/tickets/default-intake")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("clients")
          .select("public_intake_slug, name, tenant_id, tenants(name)")
          .eq("public_intake_enabled", true)
          .not("public_intake_slug", "is", null)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (error) return json({ error: "lookup_failed" }, 500);
        if (!data?.public_intake_slug) return json({ error: "not_configured" }, 404);
        return json({
          slug: data.public_intake_slug,
          client_name: data.name,
          tenant_name: (data as any).tenants?.name ?? "Suporte",
        });
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