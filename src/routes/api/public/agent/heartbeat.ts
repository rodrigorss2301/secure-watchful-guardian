import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  agent_token: z.string().min(40).max(128),
  cpu_usage: z.number().min(0).max(100).optional().nullable(),
  ram_usage: z.number().min(0).max(100).optional().nullable(),
  disk_usage: z.number().min(0).max(100).optional().nullable(),
  ip_address: z.string().max(64).optional().nullable(),
  agent_version: z.string().max(40).optional().nullable(),
  os_version: z.string().max(120).optional().nullable(),
});

function deriveStatus(cpu: number | null | undefined, ram: number | null | undefined, disk: number | null | undefined) {
  const m = Math.max(cpu ?? 0, ram ?? 0, disk ?? 0);
  if (m >= 90) return "critical" as const;
  if (m >= 75) return "warning" as const;
  return "online" as const;
}

export const Route = createFileRoute("/api/public/agent/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let json: unknown;
        try { json = await request.json(); } catch { return jsonErr(400, "invalid_json"); }
        const parsed = Body.safeParse(json);
        if (!parsed.success) return jsonErr(400, "invalid_body", parsed.error.flatten());
        const b = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: ep, error } = await supabaseAdmin
          .from("endpoints")
          .select("id")
          .eq("agent_token", b.agent_token)
          .maybeSingle();
        if (error) return jsonErr(500, "db_error");
        if (!ep) return jsonErr(401, "invalid_token");

        const ip = b.ip_address ?? request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

        const { error: upErr } = await supabaseAdmin
          .from("endpoints")
          .update({
            last_heartbeat: new Date().toISOString(),
            status: deriveStatus(b.cpu_usage, b.ram_usage, b.disk_usage),
            cpu_usage: b.cpu_usage ?? null,
            ram_usage: b.ram_usage ?? null,
            disk_usage: b.disk_usage ?? null,
            last_seen_ip: ip,
            ...(b.agent_version ? { agent_version: b.agent_version } : {}),
            ...(b.os_version ? { os_version: b.os_version } : {}),
          })
          .eq("id", ep.id);
        if (upErr) return jsonErr(500, "update_failed");

        return Response.json({ ok: true, interval_seconds: 60 });
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