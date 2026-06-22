import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  agent_token: z.string().min(40).max(128),
  command_id: z.string().uuid(),
  status: z.enum(["succeeded", "failed", "timeout"]),
  output: z.string().max(8000).optional().nullable(),
  failed_reason: z.string().max(400).optional().nullable(),
});

export const Route = createFileRoute("/api/public/agent/command-result")({
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
          .select("endpoint_id")
          .eq("agent_token", b.agent_token)
          .maybeSingle();
        if (!sec) return jsonErr(401, "invalid_token");
        const ep = { id: sec.endpoint_id };

        // Verifica expiração antes de aceitar resultado
        const { data: cmd } = await supabaseAdmin
          .from("endpoint_commands").select("expires_at, status")
          .eq("id", b.command_id).eq("endpoint_id", ep.id).maybeSingle();
        if (!cmd) return jsonErr(404, "command_not_found");
        if (cmd.expires_at && new Date(cmd.expires_at).getTime() < Date.now()) {
          await supabaseAdmin.from("endpoint_commands").update({
            status: "expired",
            failed_reason: "result_after_expiration",
            completed_at: new Date().toISOString(),
          }).eq("id", b.command_id);
          return jsonErr(410, "expired");
        }

        const { error } = await supabaseAdmin
          .from("endpoint_commands")
          .update({
            status: b.status,
            output: b.output ?? null,
            failed_reason: b.failed_reason ?? null,
            completed_at: new Date().toISOString(),
          })
          .eq("id", b.command_id)
          .eq("endpoint_id", ep.id);
        if (error) return jsonErr(500, "update_failed");

        return Response.json({ ok: true });
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