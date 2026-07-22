import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "../supabase";

export default defineTool({
  name: "list_alerts",
  title: "List alerts",
  description: "List monitoring alerts in the tenant, optionally filtered by status or severity.",
  inputSchema: {
    status: z.enum(["open", "acknowledged", "resolved"]).optional(),
    severity: z.enum(["info", "warning", "critical"]).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, severity, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    let q = supabaseForUser(ctx)
      .from("alerts")
      .select("id, metric, severity, status, value, threshold, message, endpoint_id, client_id, created_at, resolved_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (status) q = q.eq("status", status);
    if (severity) q = q.eq("severity", severity);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { alerts: data ?? [] },
    };
  },
});