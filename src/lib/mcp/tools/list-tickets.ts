import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "../supabase";

export default defineTool({
  name: "list_tickets",
  title: "List tickets",
  description: "List support tickets in the tenant, optionally filtered by status, priority or client.",
  inputSchema: {
    status: z.enum(["open", "in_progress", "waiting", "resolved", "closed"]).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    client_id: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, priority, client_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    let q = supabaseForUser(ctx)
      .from("tickets")
      .select("id, number, title, description, status, priority, category, client_id, assignee_id, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (status) q = q.eq("status", status);
    if (priority) q = q.eq("priority", priority);
    if (client_id) q = q.eq("client_id", client_id);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { tickets: data ?? [] },
    };
  },
});