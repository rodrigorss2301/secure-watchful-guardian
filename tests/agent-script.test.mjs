import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("../public/agent/install.ps1", import.meta.url));
const versionPath = fileURLToPath(new URL("../src/lib/agent-version.ts", import.meta.url));
const script = readFileSync(scriptPath, "utf8");

// A tarefa agendada roda `powershell.exe` (Windows PowerShell 5.1), que le um
// .ps1 sem BOM como ANSI. Um em-dash vira 'â€"' e o 0x94 final e tratado como
// aspas de fechamento, entao o arquivo inteiro deixa de compilar e o agente
// nunca mais bate heartbeat. Foi exatamente isso que derrubou todos os
// endpoints em 1.6.0/1.6.1 sem nenhum alarme: o instalador roda em pwsh 7
// (que le UTF-8), faz um heartbeat de sucesso, e a tarefa agendada em 5.1
// falha em silencio para sempre.
//
// Manter o script em ASCII puro elimina a dependencia de encoding em qualquer
// caminho (download, copia local, auto-update).
test("agent script is pure ASCII so PowerShell 5.1 can parse it", () => {
  const offenders = [];
  script.split(/\r?\n/).forEach((line, index) => {
    const match = /[^\x00-\x7F]/.exec(line);
    if (match) {
      offenders.push(
        `linha ${index + 1}: U+${match[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")} (${match[0]})`,
      );
    }
  });
  assert.deepEqual(
    offenders,
    [],
    `public/agent/install.ps1 precisa ser ASCII puro. Use '-' no lugar de em-dash e remova acentos:\n${offenders.join("\n")}`,
  );
});

test("agent version in the script matches LATEST_AGENT_VERSION", () => {
  const inScript = /^\s*\$AgentVersion\s*=\s*"([0-9]+(?:\.[0-9]+)*)"/m.exec(script)?.[1];
  const inApp = /LATEST_AGENT_VERSION\s*=\s*"([0-9]+(?:\.[0-9]+)*)"/.exec(
    readFileSync(versionPath, "utf8"),
  )?.[1];
  assert.ok(inScript, "nao achei $AgentVersion em install.ps1");
  assert.ok(inApp, "nao achei LATEST_AGENT_VERSION em agent-version.ts");
  assert.equal(inScript, inApp);
});

// Comentarios fora: senao uma assercao casa com o proprio texto que explica o
// que foi removido.
const code = script
  .split(/\r?\n/)
  .map((line) => line.replace(/(^|\s)#.*$/, "$1"))
  .join("\n");

const present = (pattern) => pattern.test(code);

test("agent fails closed on command signatures", () => {
  assert.ok(
    /function Verify-Command[\s\S]*?if \(-not \$keyHex\) \{ return \$false \}/.test(code),
    "Verify-Command deve recusar quando nao ha chave de assinatura",
  );
  assert.ok(
    present(/Compute-Hmac "\$\(\$cmd\.signed_payload\)" \$keyHex/),
    "o HMAC deve ser calculado sobre signed_payload, nao sobre um JSON remontado",
  );
  assert.ok(
    !present(/if \(\$cfg\.command_signing_key\) \{/),
    "a verificacao nao pode ser condicional a existir chave (era fail-open)",
  );
});

test("auto-update requires a hash and an HTTPS source", () => {
  assert.ok(present(/if \(-not \$latest\.sha256\)/), "release sem sha256 deve ser ignorada");
  assert.ok(
    !present(/-match "\^https\?:\/\/"/),
    "script_url por http:// nao pode ser aceito para codigo executado como SYSTEM",
  );
});

test("RDP is not opened on public networks nor enabled on every install", () => {
  assert.ok(!present(/-Profile Any/), "regra de firewall nao pode valer para perfil publico");
  assert.ok(
    !present(/^\s*Enable-RdpAccess \| Out-Null\s*$/m),
    "instalacao nao deve habilitar RDP automaticamente",
  );
});

test("install directory is locked down before secrets are written", () => {
  assert.ok(present(/function Protect-InstallDir/), "falta Protect-InstallDir");

  // Apenas o bloco de bootstrap: Apply-AutoUpdate tambem regrava o config.json,
  // mas ali o diretorio ja foi protegido na instalacao.
  const bootstrap = code.slice(code.indexOf('if ($Mode -eq "Heartbeat") {'));
  assert.ok(bootstrap.length > 0, "nao achei o bloco de bootstrap");

  const dirCreated = bootstrap.indexOf("New-Item -ItemType Directory -Path $InstallDir");
  const protectCall = bootstrap.indexOf("Protect-InstallDir");
  const configWrite = bootstrap.indexOf("Set-Content -Path $ConfigPath");
  assert.ok(dirCreated !== -1 && protectCall !== -1 && configWrite !== -1);
  assert.ok(dirCreated < protectCall, "proteja o diretorio depois de cria-lo");
  assert.ok(
    protectCall < configWrite,
    "as permissoes devem ser restritas antes de gravar o config.json com o agent_token",
  );
});

test("heartbeat re-applies the lockdown so old installs get fixed", () => {
  const heartbeat = code.slice(
    code.indexOf("function Invoke-Heartbeat"),
    code.indexOf("function Uninstall-AutotechsAgent"),
  );
  assert.ok(
    /Protect-InstallDir/.test(heartbeat),
    "o heartbeat deve reaplicar as permissoes nas maquinas ja instaladas",
  );
});

// Contrato de assinatura entre banco e agente. Dois defeitos independentes
// faziam a verificacao nunca passar:
//   1. o texto assinado (jsonb::text com espacos) != ConvertTo-Json -Compress;
//   2. o Postgres usava os 64 caracteres do hex como chave literal, enquanto o
//      agente decodificava o hex para 32 bytes.
// Vetor fixo gerado no Postgres com extensions.hmac(convert_to(payload,'UTF8'),
// decode(key,'hex'),'sha256') e conferido contra node:crypto e contra o
// Compute-Hmac do agente no PowerShell 5.1 e 7.
test("signing contract between Postgres and the agent", async () => {
  const { createHmac } = await import("node:crypto");
  const payload =
    '1f1d0f2e-0000-4000-8000-000000000001|shutdown|{"message": "", "delay_seconds": 30}|300';
  const keyHex = "00112233445566778899aabbccddeeff";
  const expected = "b63120d4b026f1394df85020ef35a59a98f592257be73b63ae591dfab52db86b";

  assert.equal(
    createHmac("sha256", Buffer.from(keyHex, "hex")).update(payload, "utf8").digest("hex"),
    expected,
    "a chave precisa ser decodificada de hex dos dois lados",
  );

  const migration = readFileSync(
    fileURLToPath(
      new URL("../supabase/migrations/20260918120100_command_signing_integrity.sql", import.meta.url),
    ),
    "utf8",
  );
  assert.match(
    migration,
    /extensions\.hmac\(\s*convert_to\(_payload, 'UTF8'\), decode\(_key, 'hex'\), 'sha256'\s*\)/,
    "o trigger precisa assinar com a chave decodificada de hex",
  );
  assert.match(migration, /NEW\.signed_payload := _payload;/, "o payload assinado precisa ser gravado");
});
