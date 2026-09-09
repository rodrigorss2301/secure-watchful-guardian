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
  tailscale_ip: z.string().max(64).optional().nullable(),
  gateway_rtt_ms: z.number().min(0).max(60000).optional().nullable(),
  os_last_update_at: z.string().max(40).optional().nullable(),
  // Health do próprio agente
  agent_cpu_pct: z.number().min(0).max(100).optional().nullable(),
  agent_ram_mb: z.number().int().min(0).max(20000).optional().nullable(),
  agent_last_error: z.string().max(2000).optional().nullable(),
  agent_heartbeat_duration_ms: z.number().int().min(0).max(600000).optional().nullable(),
  agent_queue_size: z.number().int().min(0).max(100000).optional().nullable(),
  // Lote de métricas (modo offline drenando fila)
  metrics_batch: z.array(z.object({
    sampled_at: z.string().max(40),
    cpu_usage: z.number().min(0).max(100).optional().nullable(),
    ram_usage: z.number().min(0).max(100).optional().nullable(),
    disk_usage: z.number().min(0).max(100).optional().nullable(),
    gateway_rtt_ms: z.number().min(0).max(60000).optional().nullable(),
  })).max(500).optional(),
  // Eventos do SO
  events: z.array(z.object({
    source: z.string().max(40).optional(),
    level: z.enum(["info","warning","error","critical"]),
    event_id: z.number().int().optional().nullable(),
    provider: z.string().max(160).optional().nullable(),
    message: z.string().max(4000),
    occurred_at: z.string().max(40),
  })).max(50).optional(),
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

        const { data: sec, error } = await supabaseAdmin
          .from("endpoint_secrets")
          .select("endpoint_id, tenant_id")
          .eq("agent_token", b.agent_token)
          .maybeSingle();
        if (error) return jsonErr(500, "db_error");
        if (!sec) return jsonErr(401, "invalid_token");
        const ep = { id: sec.endpoint_id, tenant_id: sec.tenant_id };

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
            ...(b.tailscale_ip !== undefined ? { tailscale_ip: b.tailscale_ip } : {}),
            ...(b.os_last_update_at !== undefined ? { os_last_update_at: b.os_last_update_at } : {}),
            ...(b.agent_cpu_pct !== undefined && b.agent_cpu_pct !== null ? { agent_cpu_pct: b.agent_cpu_pct } : {}),
            ...(b.agent_ram_mb !== undefined && b.agent_ram_mb !== null ? { agent_ram_mb: b.agent_ram_mb } : {}),
            ...(b.agent_heartbeat_duration_ms !== undefined && b.agent_heartbeat_duration_ms !== null ? { agent_heartbeat_duration_ms: b.agent_heartbeat_duration_ms } : {}),
            ...(b.agent_queue_size !== undefined && b.agent_queue_size !== null ? { agent_queue_size: b.agent_queue_size } : {}),
            ...(b.agent_last_error ? { agent_last_error: b.agent_last_error, agent_last_error_at: new Date().toISOString() } : {}),
            ...inv,
            ...(hasInventory ? { inventory_updated_at: new Date().toISOString() } : {}),
          })
          .eq("id", ep.id);
        if (upErr) return jsonErr(500, "update_failed");

        // store metric sample (best-effort) for the 24h chart
        if (b.cpu_usage != null || b.ram_usage != null || b.disk_usage != null) {
          await supabaseAdmin.from("endpoint_metric_samples").insert({
            tenant_id: ep.tenant_id,
            endpoint_id: ep.id,
            cpu_usage: b.cpu_usage ?? null,
            ram_usage: b.ram_usage ?? null,
            disk_usage: b.disk_usage ?? null,
            gateway_rtt_ms: b.gateway_rtt_ms ?? null,
          });
        }

        // Drenar lote de métricas offline
        if (b.metrics_batch && b.metrics_batch.length > 0) {
          const rows = b.metrics_batch.map((s) => ({
            tenant_id: ep.tenant_id,
            endpoint_id: ep.id,
            sampled_at: s.sampled_at,
            cpu_usage: s.cpu_usage ?? null,
            ram_usage: s.ram_usage ?? null,
            disk_usage: s.disk_usage ?? null,
            gateway_rtt_ms: s.gateway_rtt_ms ?? null,
          }));
          await supabaseAdmin.from("endpoint_metric_samples").insert(rows);
        }

        // Eventos do SO
        if (b.events && b.events.length > 0) {
          const rows = b.events.map((ev) => ({
            tenant_id: ep.tenant_id,
            endpoint_id: ep.id,
            source: ev.source ?? "windows",
            level: ev.level,
            event_id: ev.event_id ?? null,
            provider: ev.provider ?? null,
            message: ev.message,
            occurred_at: ev.occurred_at,
          }));
          await supabaseAdmin.from("endpoint_events").insert(rows);
        }

        const { claimPendingCommands } = await import("@/lib/agent-commands.server");
        let commands;
        try {
          commands = await claimPendingCommands(supabaseAdmin, ep.id);
        } catch {
          return jsonErr(500, "command_dispatch_failed");
        }

        // Último release do canal do endpoint
        const { data: epRow } = await supabaseAdmin
          .from("endpoints").select("update_channel").eq("id", ep.id).maybeSingle();
        const channel = (epRow?.update_channel as string | null) ?? "stable";
        const { data: rel } = await supabaseAdmin.rpc("get_latest_agent_release", { _channel: channel });
        const latest = Array.isArray(rel) && rel.length > 0 ? rel[0] : null;

        return Response.json({
          ok: true,
          interval_seconds: 60,
          commands,
          latest_agent: latest ? {
            channel: latest.channel, version: latest.version,
            script_url: latest.script_url, sha256: latest.sha256,
          } : null,
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