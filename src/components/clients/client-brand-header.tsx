import { useState } from "react";
import { LifeBuoy } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { brandForeground, normalizeBranding, type ClientBranding } from "@/lib/client-branding";

export function ClientBrandHeader({
  name,
  branding,
}: {
  name: string;
  branding?: Partial<ClientBranding> | null;
}) {
  const { t } = useI18n();
  const brand = normalizeBranding(branding);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <header
      className="relative overflow-hidden rounded-2xl p-6 sm:p-9"
      style={{
        backgroundColor: brand.portal_primary_color,
        color: brandForeground(brand.portal_primary_color),
      }}
    >
      <div className="relative flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-4">
          {brand.portal_logo_url && failedUrl !== brand.portal_logo_url ? (
            // Logo sem moldura: altura fixa e largura proporcional. Logos horizontais (ex.: 4:1)
            // ficavam minúsculos numa caixa branca 96x64, e logos com fundo escuro ou texto
            // branco viravam uma faixa escura ou sumiam sobre o branco.
            <img
              src={brand.portal_logo_url}
              alt={`${t("clients.brand.logoAlt")}: ${name}`}
              referrerPolicy="no-referrer"
              className="block h-12 w-auto max-w-[min(240px,70vw)] shrink-0 rounded-lg object-contain sm:h-14"
              onError={() => setFailedUrl(brand.portal_logo_url)}
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
              <span className="text-xl font-bold text-slate-800" aria-label={name}>
                {name.trim().slice(0, 2).toUpperCase() || "TI"}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest opacity-80">
              <LifeBuoy aria-hidden="true" className="h-4 w-4" /> {t("clients.brand.supportCenter")}
            </p>
            <p className="mt-1 break-words text-lg font-semibold">{name || t("clients.brand.defaultCompany")}</p>
          </div>
        </div>
        <div>
          <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">
            {brand.portal_title || t("clients.brand.defaultTitle")}
          </h1>
          <p className="mt-3 max-w-2xl whitespace-pre-line break-words text-sm leading-relaxed opacity-90">
            {brand.portal_message || t("clients.brand.defaultMessage")}
          </p>
        </div>
      </div>
    </header>
  );
}
