import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "@/components/theme-provider";
import { ProtectedRoute } from "@/lib/protected-route";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import OnboardingPage from "@/pages/onboarding-page";
import DashboardLayout from "@/pages/dashboard-layout";
import PrivacyPolicyPage from "@/pages/privacy-policy-page";
import TermsOfServicePage from "@/pages/terms-of-service-page";
import HomePage from "@/pages/home-page";
import AcceptInvitePage from "@/pages/accept-invite-page";
import AdminPanelPage from "@/pages/admin-panel-page";
import ResetPasswordPage from "@/pages/reset-password-page";
import ChangePasswordPage from "@/pages/change-password-page";
import ForgotPasswordPage from "@/pages/forgot-password-page";
import VerifyEmailPage from "@/pages/verify-email-page";
import SetupPage from "@/pages/setup-page";

function Router() {
  return (
    <Switch>
      <Route path="/setup" component={SetupPage} />
      <Route path="/home" component={HomePage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/accept-invite" component={AcceptInvitePage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/privacy-policy" component={PrivacyPolicyPage} />
      <Route path="/terms-of-service" component={TermsOfServicePage} />
      <Route path="/admin-panel" component={AdminPanelPage} />
      <ProtectedRoute path="/change-password" component={ChangePasswordPage} />
      <ProtectedRoute path="/onboarding" component={OnboardingPage} />
      <ProtectedRoute path="/dashboard" nest component={DashboardLayout} />
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <Router />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
