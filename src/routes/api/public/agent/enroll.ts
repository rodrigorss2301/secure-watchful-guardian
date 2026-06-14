import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { randomBytes } from "node:crypto";

const Body = z.object({
  token: z.string().min(20).max(128),
  hostname: z.string().min(1).max(120),
  os: z.string().max(120).optional().nullable(),
  os_version: z.string().max(120).optional().nullable(),
  ip_address: z.string().max(64).optional().nullable(),
  mac_address: z.string().max(64).optional().nullable(),
  agent_version: z.string().max(40).optional().nullable(),
  type: z.enum(["workstation", "server", "mobile", "network"]).optional(),
});

export const Route = createFileRoute("/api/public/agent/enroll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let json: unknown;
        try { json = await request.json(); } catch { return jsonErr(400, "invalid_json"); }
        const parsed = Body.safeParse(json);
        if (!parsed.success) return jsonErr(400, "invalid_body", parsed.error.flatten());
        const b = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: enr, error: enrErr } = await supabaseAdmin
          .from("agent_enrollments")
          .select("id, tenant_id, client_id, default_type, expires_at, used_at")
          .eq("token", b.token)
          .maybeSingle();
        if (enrErr) return jsonErr(500, "db_error");
        if (!enr) return jsonErr(404, "token_not_found");
        if (enr.used_at) return jsonErr(410, "token_used");
        if (new Date(enr.expires_at).getTime() < Date.now()) return jsonErr(410, "token_expired");

        const agentToken = randomBytes(32).toString("hex");
        const ip = b.ip_address ?? request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

        let existingEndpoint: { id: string } | null = null;
        if (b.mac_address) {
          const { data } = await supabaseAdmin
            .from("endpoints")
            .select("id")
            .eq("tenant_id", enr.tenant_id)
            .eq("client_id", enr.client_id)
            .eq("mac_address", b.mac_address)
            .order("last_heartbeat", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();
          existingEndpoint = data;
        }

        const endpointPayload = {
          tenant_id: enr.tenant_id,
          client_id: enr.client_id,
          hostname: b.hostname,
          type: (b.type ?? enr.default_type) as "workstation",
          status: "online" as const,
          os: b.os ?? null,
          os_version: b.os_version ?? null,
          ip_address: ip,
          mac_address: b.mac_address ?? null,
          agent_version: b.agent_version ?? null,
          agent_token: agentToken,
          last_heartbeat: new Date().toISOString(),
          last_seen_ip: ip,
        };

        const endpointQuery = existingEndpoint
          ? supabaseAdmin.from("endpoints").update(endpointPayload).eq("id", existingEndpoint.id).select("id").single()
          : supabaseAdmin.from("endpoints").insert(endpointPayload).select("id").single();

        const { data: endpoint, error: epErr } = await endpointQuery;
        if (epErr || !endpoint) return jsonErr(500, "endpoint_create_failed", epErr?.message);

        await supabaseAdmin
          .from("agent_enrollments")
          .update({ used_at: new Date().toISOString(), used_endpoint_id: endpoint.id })
          .eq("id", enr.id);

        return Response.json({
          endpoint_id: endpoint.id,
          agent_token: agentToken,
          heartbeat_interval_seconds: 60,
        });
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