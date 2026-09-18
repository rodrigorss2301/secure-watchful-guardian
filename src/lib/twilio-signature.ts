// Validacao da assinatura X-Twilio-Signature.
//
// Twilio assina: a URL exata chamada, seguida de cada parametro do POST
// concatenado como <nome><valor>, com os nomes em ordem alfabetica. O resultado
// e um HMAC-SHA1 com o auth token da conta, em base64.
// https://www.twilio.com/docs/usage/security#validating-requests
//
// Sem isso o webhook aceita qualquer POST: basta conhecer o telefone de um
// contato para ler e abrir tickets no nome dele.

export function twilioSignatureBase(url: string, params: Record<string, string>): string {
  let base = url;
  for (const name of Object.keys(params).sort()) {
    base += name + params[name];
  }
  return base;
}

function toBase64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(twilioSignatureBase(url, params)),
  );
  return toBase64(signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidTwilioSignature(opts: {
  authToken: string;
  url: string;
  params: Record<string, string>;
  signature: string | null;
}): Promise<boolean> {
  if (!opts.authToken || !opts.signature) return false;
  const expected = await computeTwilioSignature(opts.authToken, opts.url, opts.params);
  return timingSafeEqual(expected, opts.signature);
}

// A URL que o Twilio assinou. Atras do proxy da Cloudflare o request chega em
// http interno, entao normalizamos para https; TWILIO_WEBHOOK_URL cobre setups
// em que o hostname configurado no console difere do que chega aqui.
export function twilioWebhookUrl(request: Request, override?: string | null): string {
  if (override) return override;
  const url = new URL(request.url);
  url.protocol = "https:";
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) url.host = forwardedHost;
  return url.toString();
}
