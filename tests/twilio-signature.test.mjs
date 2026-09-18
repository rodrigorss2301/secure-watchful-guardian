import assert from "node:assert/strict";
import test from "node:test";
import {
  computeTwilioSignature,
  isValidTwilioSignature,
  twilioSignatureBase,
  twilioWebhookUrl,
} from "../src/lib/twilio-signature.ts";

// Vetor publicado pela Twilio na documentacao de "Validating Requests".
const TWILIO_DOC_VECTOR = {
  authToken: "12345",
  url: "https://mycompany.com/myapp.php?foo=1&bar=2",
  params: {
    CallSid: "CA1234567890ABCDE",
    Caller: "+14158675309",
    Digits: "1234",
    From: "+14158675309",
    To: "+18005551212",
  },
  signature: "RSOYDt4T1cUTdK1PDd93/VVr8B8=",
};

test("reproduces Twilio's documented signature", async () => {
  const signature = await computeTwilioSignature(
    TWILIO_DOC_VECTOR.authToken,
    TWILIO_DOC_VECTOR.url,
    TWILIO_DOC_VECTOR.params,
  );
  assert.equal(signature, TWILIO_DOC_VECTOR.signature);
});

test("parameters are concatenated in alphabetical order, regardless of input order", () => {
  const forward = twilioSignatureBase("https://x/y", { a: "1", b: "2", c: "3" });
  const shuffled = twilioSignatureBase("https://x/y", { c: "3", a: "1", b: "2" });
  assert.equal(forward, "https://x/ya1b2c3");
  assert.equal(forward, shuffled);
});

test("accepts a valid signature", async () => {
  assert.equal(await isValidTwilioSignature(TWILIO_DOC_VECTOR), true);
});

test("rejects tampering, wrong token and missing signature", async () => {
  // Um atacante que troca o remetente invalida a assinatura.
  const spoofed = {
    ...TWILIO_DOC_VECTOR,
    params: { ...TWILIO_DOC_VECTOR.params, From: "+15550000000" },
  };
  assert.equal(await isValidTwilioSignature(spoofed), false);

  // Parametro extra injetado.
  const extraParam = {
    ...TWILIO_DOC_VECTOR,
    params: { ...TWILIO_DOC_VECTOR.params, Body: "novo ticket" },
  };
  assert.equal(await isValidTwilioSignature(extraParam), false);

  assert.equal(await isValidTwilioSignature({ ...TWILIO_DOC_VECTOR, authToken: "54321" }), false);
  assert.equal(await isValidTwilioSignature({ ...TWILIO_DOC_VECTOR, signature: null }), false);
  assert.equal(await isValidTwilioSignature({ ...TWILIO_DOC_VECTOR, signature: "" }), false);
  // Sem token configurado o webhook nao valida nada.
  assert.equal(await isValidTwilioSignature({ ...TWILIO_DOC_VECTOR, authToken: "" }), false);
  // URL diferente da assinada (ex.: host errado atras do proxy).
  assert.equal(
    await isValidTwilioSignature({ ...TWILIO_DOC_VECTOR, url: "https://evil.example/myapp.php" }),
    false,
  );
});

test("webhook URL is normalised to https and honours the override", () => {
  const request = new Request("http://rmm.example/api/public/whatsapp/inbound");
  assert.equal(twilioWebhookUrl(request), "https://rmm.example/api/public/whatsapp/inbound");
  assert.equal(
    twilioWebhookUrl(request, "https://custom.example/hook"),
    "https://custom.example/hook",
  );
});
