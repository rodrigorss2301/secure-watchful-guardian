import { createFileRoute } from "@tanstack/react-router";

// Rota publica e sem sessao, portanto sem contexto de tenant: a versao anterior
// devolvia "o primeiro cliente com intake ativo" da instancia inteira, vazando o
// slug de um tenant para visitantes de outro. Agora o slug padrao e explicito
// (PUBLIC_INTAKE_DEFAULT_SLUG); sem ele, o visitante precisa usar /submit/<slug>.
export const Route = createFileRoute("/api/public/tickets/default-intake")({
  server: {
    handlers: {
      GET: async () => {
        const slug = process.env.PUBLIC_INTAKE_DEFAULT_SLUG;
        if (!slug) return json({ error: "not_configured" }, 404);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("clients")
          .select("public_intake_slug, name, tenant_id, tenants(name)")
          .eq("public_intake_slug", slug)
          .eq("public_intake_enabled", true)
          .maybeSingle();
        if (error) return json({ error: "lookup_failed" }, 500);
        if (!data?.public_intake_slug) return json({ error: "not_configured" }, 404);

        const tenant = data.tenants as { name: string } | null;
        return json({
          slug: data.public_intake_slug,
          client_name: data.name,
          tenant_name: tenant?.name ?? "Suporte",
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
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
