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
  // Inventário expandido (opcional)
  cpu_model: z.string().max(200).optional().nullable(),
  cpu_cores: z.number().int().min(0).max(4096).optional().nullable(),
  cpu_threads: z.number().int().min(0).max(8192).optional().nullable(),
  ram_total_mb: z.number().int().min(0).optional().nullable(),
  gpu: z.string().max(300).optional().nullable(),
  manufacturer: z.string().max(120).optional().nullable(),
  model: z.string().max(160).optional().nullable(),
  serial_number: z.string().max(120).optional().nullable(),
  motherboard: z.string().max(200).optional().nullable(),
  bios_vendor: z.string().max(120).optional().nullable(),
  bios_version: z.string().max(80).optional().nullable(),
  bios_date: z.string().max(20).optional().nullable(),
  uptime_seconds: z.number().int().min(0).optional().nullable(),
  last_boot_at: z.string().max(40).optional().nullable(),
  timezone: z.string().max(80).optional().nullable(),
  domain: z.string().max(160).optional().nullable(),
  logged_user: z.string().max(160).optional().nullable(),
  public_ip: z.string().max(64).optional().nullable(),
  gateway: z.string().max(64).optional().nullable(),
  dns_servers: z.array(z.string().max(64)).max(20).optional(),
  disks: z.array(z.record(z.string(), z.unknown())).max(64).optional(),
  network_interfaces: z.array(z.record(z.string(), z.unknown())).max(32).optional(),
  installed_software: z.array(z.record(z.string(), z.unknown())).max(2000).optional(),
  running_processes: z.array(z.record(z.string(), z.unknown())).max(500).optional(),
  services: z.array(z.record(z.string(), z.unknown())).max(500).optional(),
  pending_updates: z.array(z.record(z.string(), z.unknown())).max(500).optional(),
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

        const inventoryKeys = [
          "cpu_model","cpu_cores","cpu_threads","ram_total_mb","gpu","manufacturer","model",
          "serial_number","motherboard","bios_vendor","bios_version","bios_date","uptime_seconds",
          "last_boot_at","timezone","domain","logged_user","public_ip","gateway","dns_servers",
          "disks","network_interfaces","installed_software","running_processes","services","pending_updates",
        ] as const;
        const inv: Record<string, unknown> = {};
        let hasInventory = false;
        for (const k of inventoryKeys) {
          const v = (b as Record<string, unknown>)[k];
          if (v !== undefined && v !== null) { inv[k] = v; hasInventory = true; }
        }

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
            ...inv,
            ...(hasInventory ? { inventory_updated_at: new Date().toISOString() } : {}),
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