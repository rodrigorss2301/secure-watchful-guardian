import { Bell, LogOut, User as UserIcon } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { ThemeToggle } from "@/components/theme-toggle";
import { LangToggle } from "@/components/lang-toggle";
import { Separator } from "@/components/ui/separator";

function initials(name: string | null | undefined, fallback: string) {
  const src = name?.trim() || fallback;
  const parts = src.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function AppHeader() {
  const { profile, user, signOut } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/10 bg-background/70 px-4 shadow-sm shadow-black/5 backdrop-blur-xl backdrop-saturate-150 md:px-6">
      <SidebarTrigger aria-label={t("nav.menu")} title={t("nav.menu")} className="h-10 w-10 rounded-2xl border border-border/50 bg-background/70 text-foreground transition hover:bg-accent/15" />
      <Separator orientation="vertical" className="mx-1 h-5" />

      <div className="ml-auto flex items-center gap-2">
        <LangToggle />
        <ThemeToggle />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full" aria-label={t("common.notifications")}>
              <Bell className="h-4 w-4" aria-hidden="true" />
                          </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">{t("common.notifications")}</span>
            </div>
            <p className="py-6 text-center text-sm text-muted-foreground">{t("common.notifications.empty")}</p>
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-10 gap-2 rounded-full pl-1 pr-3" aria-label={profile?.full_name ?? user?.email ?? t("auth.profile")}>
              <Avatar className="h-7 w-7 border border-border">
                <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
                <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                  {initials(profile?.full_name, user?.email ?? "U")}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[140px] truncate text-sm font-medium md:inline-block">
                {profile?.full_name ?? user?.email}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col">
              <span className="text-sm font-semibold">{profile?.full_name ?? "—"}</span>
              <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <UserIcon className="mr-2 h-4 w-4" /> {t("auth.profile")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> {t("auth.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}