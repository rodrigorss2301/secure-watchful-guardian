import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  slug: z.string().min(4).max(80),
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional().nullable(),
  name: z.string().min(2).max(120),
  email: z.string().email().max(160),
  phone: z.string().max(40).optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
});

export const Route = createFileRoute("/api/public/tickets/submit")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
      POST: async ({ request }) => {
        let json: unknown;
        try { json = await request.json(); } catch { return err(400, "invalid_json"); }
        const p = Body.safeParse(json);
        if (!p.success) return err(400, "invalid_body", p.error.flatten());

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("submit_public_ticket", {
          _slug: p.data.slug,
          _title: p.data.title,
          _description: p.data.description ?? null,
          _name: p.data.name,
          _email: p.data.email,
          _phone: p.data.phone ?? null,
          _priority: p.data.priority ?? "medium",
        });
        if (error) return err(400, "submit_failed", error.message);
        const row = Array.isArray(data) ? data[0] : data;
        return Response.json(
          { ticket_id: row?.ticket_id, number: row?.ticket_number },
          { headers: { "Access-Control-Allow-Origin": "*" } },
        );
      },
    },
  },
});

function err(status: number, code: string, detail?: unknown) {
  return new Response(JSON.stringify({ error: code, detail }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}