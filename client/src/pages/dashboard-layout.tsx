import { Switch, Route, Redirect } from "wouter";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import DashboardPage from "@/pages/dashboard-page";
import CalendarPage from "@/pages/calendar-page";
import BrandVoicePage from "@/pages/brand-voice-page";
import MediaPage from "@/pages/media-page";
import CreateCampaignPage from "@/pages/create-campaign-page";
import CampaignDetailPage from "@/pages/campaign-detail-page";
import RolesPermissionsPage from "@/pages/roles-permissions-page";
import MarketIntelligencePage from "@/pages/market-intelligence-page";
import SocialAccountsPage from "@/pages/social-accounts-page";
import ScheduledPostsPage from "@/pages/scheduled-posts-page";
import SettingsPage from "@/pages/settings-page";
import { RequireModule } from "@/components/require-module";

export default function DashboardLayout() {
  const { user } = useAuth();

  if (user && !user.onboardingCompleted) {
    return <Redirect to="~/onboarding" />;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 p-2 border-b sticky top-0 z-50 bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-3">
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Switch>
              <Route path="/">
                <RequireModule module="CAMPAIGN"><DashboardPage /></RequireModule>
              </Route>
              <Route path="/campaigns/new">
                <RequireModule module="CAMPAIGN"><CreateCampaignPage /></RequireModule>
              </Route>
              <Route path="/campaigns/:id">
                {(params) => (
                  <RequireModule module="CAMPAIGN">
                    <CampaignDetailPage id={params.id} />
                  </RequireModule>
                )}
              </Route>
              <Route path="/calendar">
                <RequireModule module="CALENDAR"><CalendarPage /></RequireModule>
              </Route>
              <Route path="/brand-voice">
                <RequireModule module="BRAND_VOICE"><BrandVoicePage /></RequireModule>
              </Route>
              <Route path="/media">
                <RequireModule module="MEDIA_LIBRARY"><MediaPage /></RequireModule>
              </Route>
              <Route path="/market-intelligence">
                <RequireModule module="ANALYTICS"><MarketIntelligencePage /></RequireModule>
              </Route>
              <Route path="/social-accounts">
                <RequireModule module="CAMPAIGN"><SocialAccountsPage /></RequireModule>
              </Route>
              <Route path="/scheduled-posts">
                <RequireModule module="CAMPAIGN"><ScheduledPostsPage /></RequireModule>
              </Route>
              <Route path="/roles">
                <RequireModule module="TEAM_MANAGEMENT" adminOnly><RolesPermissionsPage /></RequireModule>
              </Route>
              <Route path="/settings" component={SettingsPage} />
              <Route>
                <RequireModule module="CAMPAIGN"><DashboardPage /></RequireModule>
              </Route>
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
