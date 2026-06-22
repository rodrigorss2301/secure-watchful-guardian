import { createFileRoute } from "@tanstack/react-router";

// Helper to format Twilio TwiML response (works without sending via API)
function twiml(body: string) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(body)}</Message></Response>`;
  return new Response(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
function emptyTwiml() {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

const MENU = `🤖 Olá! Comandos:
• *tickets* — últimos 5 abertos
• *TKT-00012* — detalhes
• *novo <título>* — abrir ticket
• *comentar TKT-00012 <texto>* — comentar
• *menu* — esta ajuda`;

export const Route = createFileRoute("/api/public/whatsapp/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData();
        const from = (form.get("From") as string | null)?.replace(/^whatsapp:/, "").trim() ?? "";
        const bodyRaw = (form.get("Body") as string | null)?.trim() ?? "";
        if (!from) return emptyTwiml();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Resolve contato pelo telefone (tenta vários formatos)
        const phoneVariants = Array.from(new Set([from, from.replace(/\D/g, ""), "+" + from.replace(/\D/g, "")]));
        const { data: contact } = await supabaseAdmin
          .from("client_contacts")
          .select("id, tenant_id, client_id, name")
          .in("phone", phoneVariants)
          .maybeSingle();

        // Log mensagem inbound
        await supabaseAdmin.from("whatsapp_messages").insert({
          tenant_id: contact?.tenant_id ?? "00000000-0000-0000-0000-000000000000",
          direction: "inbound",
          from_number: from,
          to_number: (form.get("To") as string | null) ?? "",
          body: bodyRaw,
          client_id: contact?.client_id ?? null,
          status: "received",
          provider_sid: (form.get("MessageSid") as string | null) ?? null,
        });

        if (!contact) {
          return twiml("⚠️ Seu número não está cadastrado em nenhum cliente. Peça ao seu provedor de TI para adicionar você como contato com este número.");
        }

        const reply = await handleCommand(supabaseAdmin, contact, bodyRaw);

        // Log outbound
        await supabaseAdmin.from("whatsapp_messages").insert({
          tenant_id: contact.tenant_id,
          direction: "outbound",
          from_number: (form.get("To") as string | null) ?? "",
          to_number: from,
          body: reply,
          client_id: contact.client_id,
          status: "sent",
        });

        return twiml(reply);
      },
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});

async function handleCommand(db: any, contact: { tenant_id: string; client_id: string; name: string | null }, raw: string): Promise<string> {
  const text = raw.trim();
  const lower = text.toLowerCase();

  if (!text || /^(oi|ola|olá|menu|help|ajuda)$/i.test(lower)) return MENU;

  // ticket detail by id alone (TKT-xxxxx)
  const ticketMatch = text.match(/TKT-\d{4,6}/i);
  if (lower === "tickets") {
    const { data } = await db.from("tickets")
      .select("number, title, status, priority")
      .eq("client_id", contact.client_id)
      .in("status", ["open", "in_progress", "waiting"])
      .order("created_at", { ascending: false })
      .limit(5);
    if (!data?.length) return "Você não tem tickets abertos. 🎉";
    return "📋 Tickets abertos:\n" + data.map((t: any) => `• ${t.number} [${t.status}] ${t.title}`).join("\n");
  }

  if (lower.startsWith("novo ")) {
    const title = text.slice(5).trim();
    if (!title) return "Use: *novo <título do problema>*";
    const { data, error } = await db.from("tickets").insert({
      tenant_id: contact.tenant_id,
      client_id: contact.client_id,
      title, description: "Aberto via WhatsApp",
      priority: "medium", status: "open",
    }).select("number").single();
    if (error) return "❌ Não foi possível abrir o ticket: " + error.message;
    return `✅ Ticket ${data.number} criado.`;
  }

  if (lower.startsWith("comentar ") && ticketMatch) {
    const number = ticketMatch[0].toUpperCase();
    const body = text.replace(/^comentar\s+/i, "").replace(ticketMatch[0], "").trim();
    if (!body) return "Use: *comentar TKT-00001 <seu texto>*";
    const { data: tk } = await db.from("tickets").select("id, tenant_id").eq("number", number).eq("client_id", contact.client_id).maybeSingle();
    if (!tk) return `Ticket ${number} não encontrado.`;
    const { error } = await db.from("ticket_comments").insert({
      tenant_id: tk.tenant_id, ticket_id: tk.id, body, internal: false, author_id: null,
    });
    if (error) return "❌ Falhou: " + error.message;
    return `✅ Comentário adicionado em ${number}.`;
  }

  if (ticketMatch) {
    const number = ticketMatch[0].toUpperCase();
    const { data: tk } = await db.from("tickets")
      .select("id, number, title, status, priority, description")
      .eq("number", number).eq("client_id", contact.client_id).maybeSingle();
    if (!tk) return `Ticket ${number} não encontrado.`;
    const { data: cmts } = await db.from("ticket_comments")
      .select("body, created_at, internal").eq("ticket_id", tk.id).eq("internal", false)
      .order("created_at", { ascending: false }).limit(2);
    const lines = [
      `🎫 *${tk.number}* — ${tk.title}`,
      `Status: ${tk.status} · Prioridade: ${tk.priority}`,
      tk.description ? `\n${String(tk.description).slice(0, 200)}` : "",
    ];
    if (cmts?.length) {
      lines.push("\n💬 Últimos comentários:");
      for (const c of cmts.reverse()) lines.push(`— ${String(c.body).slice(0, 160)}`);
    }
    return lines.filter(Boolean).join("\n");
  }

  return "Não entendi. Digite *menu* para ver opções.";
}