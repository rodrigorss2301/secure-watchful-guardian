import { z } from "zod";

export const DEFAULT_BRAND_COLOR = "#2563eb";

export const brandingSchema = z.object({
  portal_logo_url: z
    .string()
    .trim()
    .max(1000)
    .refine((value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password;
      } catch {
        return false;
      }
    }, "Use um endereço HTTPS válido para o logotipo, sem credenciais."),
  portal_primary_color: z.string().regex(/^#[0-9a-f]{6}$/i, "Use uma cor no formato #2563eb."),
  portal_title: z.string().trim().max(100),
  portal_message: z.string().trim().max(400),
});

export type ClientBranding = z.infer<typeof brandingSchema>;

export function normalizeBranding(
  value: Partial<ClientBranding> | null | undefined,
): ClientBranding {
  return {
    portal_logo_url: brandingSchema.shape.portal_logo_url.safeParse(value?.portal_logo_url).success
      ? value!.portal_logo_url!.trim()
      : "",
    portal_primary_color: /^#[0-9a-f]{6}$/i.test(value?.portal_primary_color ?? "")
      ? value!.portal_primary_color!
      : DEFAULT_BRAND_COLOR,
    portal_title: (value?.portal_title ?? "").slice(0, 100),
    portal_message: (value?.portal_message ?? "").slice(0, 400),
  };
}

export function brandForeground(color: string): string {
  const safe = normalizeBranding({ portal_primary_color: color }).portal_primary_color;
  const channels = [1, 3, 5].map((i) => {
    const channel = parseInt(safe.slice(i, i + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? "#000000" : "#ffffff";
}
