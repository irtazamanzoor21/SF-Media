import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useLocation, Link } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Megaphone, Calendar, Mic2, Image, LogOut, Shield, BarChart2, Share2, Clock, Settings } from "lucide-react";
import type { ModuleKey } from "@shared/schema";

type MenuItem = {
  title: string;
  url: string;
  icon: any;
  module?: ModuleKey;
  adminOnly?: boolean;
};

const menuItems: MenuItem[] = [
  { title: "Campaigns", url: "/", icon: Megaphone, module: "CAMPAIGN" },
  { title: "Calendar", url: "/calendar", icon: Calendar, module: "CALENDAR" },
  { title: "Brand Voice", url: "/brand-voice", icon: Mic2, module: "BRAND_VOICE" },
  { title: "Market Intelligence", url: "/market-intelligence", icon: BarChart2, module: "ANALYTICS" },
  { title: "Media Library", url: "/media", icon: Image, module: "MEDIA_LIBRARY" },
  { title: "Social Accounts", url: "/social-accounts", icon: Share2, module: "CAMPAIGN" },
  { title: "Scheduled Posts", url: "/scheduled-posts", icon: Clock, module: "CAMPAIGN" },
  { title: "Team", url: "/roles", icon: Shield, module: "TEAM_MANAGEMENT", adminOnly: true },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { user, logoutMutation } = useAuth();
  const { canAccess, isAdmin, hasOrg, orgStatus } = usePermissions();
  const [location] = useLocation();

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const visibleItems = menuItems.filter((item) => {
    if (orgStatus === "loading") return true;
    if (item.adminOnly) {
      return hasOrg && isAdmin();
    }
    if (item.module && hasOrg) {
      return canAccess(item.module);
    }
    return true;
  });

  return (
    <Sidebar
      className="border-none"
      style={{
        background: "linear-gradient(180deg, hsl(168 58% 16%) 0%, hsl(168 55% 11%) 55%, hsl(170 52% 8%) 100%)",
      }}
    >
      <SidebarHeader className="p-5 pb-6">
        <div className="flex items-center gap-3">
          <img src="/logo-full.svg" alt="SF Media" className="h-9" />
        </div>
      </SidebarHeader>
      <SidebarContent className="px-3">
        <SidebarGroup className="p-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40 px-3 mb-2">Menu</p>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {visibleItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={
                        isActive
                          ? "bg-[#8AE464]/20 text-white font-medium"
                          : "text-white/65 hover:text-white hover:bg-white/10"
                      }
                    >
                      <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 mt-auto">
        <div className="rounded-md bg-white/8 p-3">
          <div className="flex items-center gap-3">
            <Avatar className="w-8 h-8 border border-white/20">
              <AvatarFallback className="text-xs bg-white/15 text-white">
                {user ? getInitials(user.fullName) : "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-white">{user?.fullName}</p>
              <p className="text-xs truncate text-white/50">{user?.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logoutMutation.mutate()}
              className="text-white/50 hover:text-white hover:bg-white/10 no-default-hover-elevate"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
