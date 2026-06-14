import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  agent_token: z.string().min(40).max(128),
  command_id: z.string().uuid(),
  status: z.enum(["succeeded", "failed"]),
  output: z.string().max(8000).optional().nullable(),
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

        const { data: ep } = await supabaseAdmin
          .from("endpoints")
          .select("id")
          .eq("agent_token", b.agent_token)
          .maybeSingle();
        if (!ep) return jsonErr(401, "invalid_token");

        const { error } = await supabaseAdmin
          .from("endpoint_commands")
          .update({
            status: b.status,
            output: b.output ?? null,
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