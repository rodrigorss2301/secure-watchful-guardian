import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  agent_token: z.string().min(40).max(128),
  command_id: z.string().uuid(),
  lines: z.array(z.object({
    level: z.enum(["info","warn","error"]).default("info"),
    message: z.string().min(1).max(4000),
    created_at: z.string().max(40).optional(),
  })).min(1).max(200),
});

export const Route = createFileRoute("/api/public/agent/command-log")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let json: unknown;
        try { json = await request.json(); } catch { return jsonErr(400, "invalid_json"); }
        const parsed = Body.safeParse(json);
        if (!parsed.success) return jsonErr(400, "invalid_body", parsed.error.flatten());
        const b = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: sec } = await supabaseAdmin
          .from("endpoint_secrets")
          .select("endpoint_id, tenant_id")
          .eq("agent_token", b.agent_token)
          .maybeSingle();
        if (!sec) return jsonErr(401, "invalid_token");

        const { data: cmd } = await supabaseAdmin
          .from("endpoint_commands").select("id")
          .eq("id", b.command_id).eq("endpoint_id", sec.endpoint_id).maybeSingle();
        if (!cmd) return jsonErr(404, "command_not_found");

        const rows = b.lines.map((l) => ({
          tenant_id: sec.tenant_id,
          endpoint_id: sec.endpoint_id,
          command_id: b.command_id,
          level: l.level,
          message: l.message,
          ...(l.created_at ? { created_at: l.created_at } : {}),
        }));
        const { error } = await supabaseAdmin.from("endpoint_command_logs").insert(rows);
        if (error) return jsonErr(500, "insert_failed");

        return Response.json({ ok: true, accepted: rows.length });
      },
    },
  },
});

function jsonErr(status: number, code: string, detail?: unknown) {
  return new Response(JSON.stringify({ error: code, detail }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}