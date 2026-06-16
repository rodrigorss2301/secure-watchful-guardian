// Versão mais recente do agente Windows publicada em /public/agent/install.ps1.
// Mantenha em sincronia com a variável $AgentVersion daquele script.
export const LATEST_AGENT_VERSION = "1.5.0";

function parse(v: string): number[] {
  return v.replace(/[^0-9.]/g, "").split(".").map((n) => parseInt(n, 10) || 0);
}

/** true se `installed` for menor que `latest` (ou desconhecida). */
export function isAgentOutdated(installed: string | null | undefined, latest = LATEST_AGENT_VERSION): boolean {
  if (!installed) return true;
  const a = parse(installed);
  const b = parse(latest);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai < bi) return true;
    if (ai > bi) return false;
  }
  return false;
}