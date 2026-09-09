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
        try {
          json = await request.json();
        } catch {
          return jsonErr(400, "invalid_json");
        }
        const parsed = Body.safeParse(json);
        if (!parsed.success) return jsonErr(400, "invalid_body", parsed.error.flatten());
        const b = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: sec, error: authError } = await supabaseAdmin
          .from("endpoint_secrets")
          .select("endpoint_id")
          .eq("agent_token", b.agent_token)
          .maybeSingle();
        if (authError) return jsonErr(500, "db_error");
        if (!sec) return jsonErr(401, "invalid_token");
        const { recordCommandResult } = await import("@/lib/agent-commands.server");
        const outcome = await recordCommandResult(supabaseAdmin, sec.endpoint_id, b);
        if (outcome.error) return jsonErr(outcome.status, outcome.error);

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
