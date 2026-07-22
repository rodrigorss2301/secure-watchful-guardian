import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "../supabase";

export default defineTool({
  name: "create_ticket",
  title: "Create ticket",
  description: "Create a new support ticket for a client in the signed-in user's tenant.",
  inputSchema: {
    client_id: z.string().uuid().describe("Client UUID the ticket belongs to."),
    title: z.string().min(3).max(200),
    description: z.string().max(4000).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    category: z.enum(["incident", "request", "problem", "maintenance"]).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = supabaseForUser(ctx);
    const { data: client, error: cErr } = await sb
      .from("clients").select("tenant_id").eq("id", input.client_id).maybeSingle();
    if (cErr || !client) return { content: [{ type: "text", text: "Client not found or access denied" }], isError: true };
    const { data, error } = await sb
      .from("tickets")
      .insert({
        tenant_id: client.tenant_id,
        client_id: input.client_id,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? "medium",
        category: input.category ?? "request",
        source: "mcp",
      })
      .select("id, number, title, status, priority")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created ticket ${data.number}: ${data.title}` }],
      structuredContent: { ticket: data },
    };
  },
});