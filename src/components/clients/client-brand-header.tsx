import { useState } from "react";
import { LifeBuoy } from "lucide-react";
import { brandForeground, normalizeBranding, type ClientBranding } from "@/lib/client-branding";

export function ClientBrandHeader({
  name,
  branding,
}: {
  name: string;
  branding?: Partial<ClientBranding> | null;
}) {
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
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl bg-white p-2 shadow-sm">
            {brand.portal_logo_url && failedUrl !== brand.portal_logo_url ? (
              <img
                src={brand.portal_logo_url}
                alt={`Logo de ${name}`}
                referrerPolicy="no-referrer"
                className="max-h-full max-w-full object-contain"
                onError={() => setFailedUrl(brand.portal_logo_url)}
              />
            ) : (
              <span className="text-xl font-bold text-slate-800" aria-label={name}>
                {name.trim().slice(0, 2).toUpperCase() || "TI"}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest opacity-80">
              <LifeBuoy className="h-4 w-4" /> Central de suporte
            </p>
            <p className="mt-1 break-words text-lg font-semibold">{name || "Sua empresa"}</p>
          </div>
        </div>
        <div>
          <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">
            {brand.portal_title || "Como podemos ajudar?"}
          </h1>
          <p className="mt-3 max-w-2xl whitespace-pre-line break-words text-sm leading-relaxed opacity-90">
            {brand.portal_message ||
              "Conte com nossa equipe de TI. Descreva o que você precisa e registre sua solicitação de suporte abaixo."}
          </p>
        </div>
      </div>
    </header>
  );
}
