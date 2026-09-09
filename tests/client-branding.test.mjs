import assert from "node:assert/strict";
import test from "node:test";
import { brandingSchema, normalizeBranding, brandForeground } from "../src/lib/client-branding.ts";

test("existing clients render with safe defaults", () => {
  assert.equal(normalizeBranding(null).portal_primary_color, "#2563eb");
  assert.equal(
    normalizeBranding({ portal_primary_color: "red; background:url(x)" }).portal_primary_color,
    "#2563eb",
  );
});

test("logo URLs reject script, HTTP, credentials and malformed addresses", () => {
  for (const logo of [
    "javascript:alert(1)",
    "http://example.com/logo.png",
    "https://user:password@example.com/logo.png",
    "not a URL",
    "data:image/svg+xml,x",
  ]) {
    assert.equal(
      brandingSchema.safeParse({ ...normalizeBranding(null), portal_logo_url: logo }).success,
      false,
    );
    assert.equal(normalizeBranding({ portal_logo_url: logo }).portal_logo_url, "");
  }
});

test("branding accepts HTTPS logos and enforces text and color limits", () => {
  const brand = {
    ...normalizeBranding(null),
    portal_logo_url: "https://example.com/logo.png",
    portal_title: "Suporte da empresa",
  };
  assert.equal(brandingSchema.safeParse(brand).success, true);
  assert.equal(
    brandingSchema.safeParse({ ...brand, portal_title: "x".repeat(101) }).success,
    false,
  );
  assert.equal(
    brandingSchema.safeParse({ ...brand, portal_message: "x".repeat(401) }).success,
    false,
  );
  assert.equal(brandingSchema.safeParse({ ...brand, portal_primary_color: "#fff" }).success, false);
});

test("clients have independent branding and readable text on light and dark backgrounds", () => {
  const first = normalizeBranding({ portal_title: "Empresa A", portal_primary_color: "#ffffff" });
  const second = normalizeBranding({ portal_title: "Empresa B", portal_primary_color: "#000000" });
  assert.notEqual(first.portal_title, second.portal_title);
  assert.equal(brandForeground(first.portal_primary_color), "#000000");
  assert.equal(brandForeground(second.portal_primary_color), "#ffffff");
});
