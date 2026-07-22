import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "../supabase";

export default defineTool({
  name: "list_endpoints",
  title: "List endpoints",
  description: "List monitored endpoints for the signed-in user's tenant, optionally filtered by status or client.",
  inputSchema: {
    status: z.enum(["online", "offline", "warning", "critical"]).optional().describe("Filter by endpoint status."),
    client_id: z.string().uuid().optional().describe("Filter by client UUID."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, client_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    let q = supabaseForUser(ctx)
      .from("endpoints")
      .select("id, hostname, display_name, type, status, os, os_version, ip_address, cpu_usage, ram_usage, disk_usage, last_heartbeat, client_id, agent_version")
      .order("last_heartbeat", { ascending: false, nullsFirst: false })
      .limit(limit ?? 50);
    if (status) q = q.eq("status", status);
    if (client_id) q = q.eq("client_id", client_id);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { endpoints: data ?? [] },
    };
  },
});