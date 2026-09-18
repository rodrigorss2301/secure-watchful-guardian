import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Publicacao de release do agente.
//
// Antes a UI inserava direto em agent_releases com a chave do usuario, e a
// policy so exigia has_role('admin') — sem tenant, porque a tabela e global.
// Como o agente baixa e executa o script da release como SYSTEM, qualquer admin
// de qualquer tenant executava codigo na frota inteira. Agora a escrita e
// exclusiva do service_role, passa por aqui, e:
//   - so o tenant dono da plataforma publica (is_platform_owner);
//   - a versao vem do proprio script, nao de um campo digitavel;
//   - o SHA-256 e calculado sobre o script realmente servido, nunca informado
//     a mao (as 4 releases em producao estavam sem hash).

const Body = z.object({
  channel: z.enum(["stable", "beta"]),
  notes: z.string().max(500).optional().nullable(),
});

const SCRIPT_PATH = "/agent/install.ps1";
const SCRIPT_MARKER = "Autotechs RMM - Agente Windows";

export const Route = createFileRoute("/api/admin/agent-release")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let json: unknown;
        try { json = await request.json(); } catch { return err(400, "invalid_json"); }
        const parsed = Body.safeParse(json);
        if (!parsed.success) return err(400, "invalid_body", parsed.error.flatten());

        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.startsWith("Bearer ")) return err(401, "unauthorized");
        const accessToken = authHeader.slice("Bearer ".length).trim();
        if (!accessToken) return err(401, "unauthorized");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
        if (userErr || !userData?.user) return err(401, "unauthorized");

        const { data: allowed, error: ownerErr } = await supabaseAdmin.rpc(
          "is_platform_owner" as never,
          { _user_id: userData.user.id } as never,
        );
        if (ownerErr) return err(500, "authorization_check_failed");
        if (allowed !== true) return err(403, "forbidden");

        // Le o script que o servidor realmente entrega aos agentes, para o hash
        // descrever o arquivo publicado e nao uma copia local.
        const scriptUrl = new URL(SCRIPT_PATH, request.url);
        let script: string;
        try {
          const res = await fetch(scriptUrl, { headers: { "Cache-Control": "no-cache" } });
          if (!res.ok) return err(502, "agent_script_unavailable", res.status);
          script = await res.text();
        } catch (e) {
          return err(502, "agent_script_unavailable", e instanceof Error ? e.message : String(e));
        }
        if (!script.includes(SCRIPT_MARKER)) return err(502, "agent_script_invalid");

        const version = /^\s*\$AgentVersion\s*=\s*"([0-9]+(?:\.[0-9]+)*)"/m.exec(script)?.[1];
        if (!version) return err(502, "agent_version_not_found");

        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(script));
        const sha256 = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        const row = {
          channel: parsed.data.channel,
          version,
          script_url: SCRIPT_PATH,
          sha256,
          notes: parsed.data.notes?.trim() || null,
          released_at: new Date().toISOString(),
          published_by: userData.user.id,
        };

        const { error: insertErr } = await supabaseAdmin
          .from("agent_releases")
          .upsert(row as never, { onConflict: "channel,version" });
        if (insertErr) return err(500, "publish_failed", insertErr.message);

        return Response.json({ channel: parsed.data.channel, version, sha256 });
      },
    },
  },
});

function err(status: number, code: string, detail?: unknown) {
  return new Response(JSON.stringify({ error: code, detail }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
