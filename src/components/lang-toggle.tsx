import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n";

export function LangToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 gap-1.5 rounded-full px-3" aria-label={t("common.language")}>
          <Languages className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase">{lang}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        <DropdownMenuItem onClick={() => setLang("pt")} className={lang === "pt" ? "bg-accent font-medium" : ""} aria-current={lang === "pt" ? "true" : undefined}>
          <span aria-hidden="true" className="mr-2">🇧🇷</span>Português
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLang("en")} className={lang === "en" ? "bg-accent font-medium" : ""} aria-current={lang === "en" ? "true" : undefined}>
          <span aria-hidden="true" className="mr-2">🇺🇸</span>English
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}