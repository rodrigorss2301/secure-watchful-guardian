import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Server, TicketCheck, Workflow, BarChart3, Settings, Building2, Bell, ScrollText } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/brand/logo";
import { useI18n, type TKey } from "@/lib/i18n";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";

type NavItem = { titleKey: TKey; url: string; icon: typeof LayoutDashboard; roles?: AppRole[] };

const operations: NavItem[] = [
  { titleKey: "nav.dashboard", url: "/dashboard", icon: LayoutDashboard },
  { titleKey: "nav.clients", url: "/clients", icon: Building2 },
  { titleKey: "nav.endpoints", url: "/endpoints", icon: Server },
  { titleKey: "nav.tickets", url: "/tickets", icon: TicketCheck },
  { titleKey: "nav.alerts", url: "/alerts", icon: Bell },
  { titleKey: "nav.automations", url: "/automations", icon: Workflow, roles: ["admin", "technician"] },
];

const management: NavItem[] = [
  { titleKey: "nav.reports", url: "/reports", icon: BarChart3 },
  { titleKey: "nav.audit", url: "/audit", icon: ScrollText, roles: ["admin"] },
  { titleKey: "nav.settings", url: "/settings", icon: Settings, roles: ["admin"] },
];

function NavSection({ labelKey, items }: { labelKey: TKey; items: NavItem[] }) {
  const { t } = useI18n();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { hasAnyRole } = useAuth();

  const visible = items.filter((i) => !i.roles || hasAnyRole(i.roles));
  if (visible.length === 0) return null;

  return (
    <SidebarGroup>
      {!collapsed && (
        <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          {t(labelKey)}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {visible.map((item) => {
            const active = pathname === item.url || pathname.startsWith(item.url + "/");
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={t(item.titleKey)}
                  className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-foreground data-[active=true]:font-semibold"
                >
                  <Link to={item.url}>
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{t(item.titleKey)}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { tenant, roles } = useAuth();
  const { t } = useI18n();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const primaryRole = roles[0];

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-3">
        <Logo withWordmark={!collapsed} size={collapsed ? 28 : 32} />
      </SidebarHeader>
      <SidebarContent className="bg-gradient-surface">
        <NavSection labelKey="nav.operations" items={operations} />
        <NavSection labelKey="nav.management" items={management} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed && tenant && (
          <div className="flex flex-col gap-1.5 rounded-lg bg-sidebar-accent/50 p-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Tenant</span>
            <span className="truncate text-sm font-semibold">{tenant.name}</span>
            {primaryRole && (
              <Badge variant="outline" className="w-fit gap-1 border-primary/40 bg-primary/10 text-primary text-[10px] uppercase">
                {t(`role.${primaryRole}` as TKey)}
              </Badge>
            )}
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}