import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";

export function ProtectedRoute({
  path,
  component: Component,
  nest,
}: {
  path: string;
  component: () => React.JSX.Element;
  nest?: boolean;
}) {
  const { user, isLoading: authLoading } = useAuth();
  const { isBlocked, isLoading: permissionsLoading } = usePermissions();

  if (authLoading || (user && permissionsLoading)) {
    return (
      <Route path={path} nest={nest}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      </Route>
    );
  }

  if (!user) {
    return (
      <Route path={path} nest={nest}>
        <Redirect to="~/auth" />
      </Route>
    );
  }

  if (user.mustChangePassword && path !== "/change-password") {
    return (
      <Route path={path} nest={nest}>
        <Redirect to="~/change-password" />
      </Route>
    );
  }

  if (isBlocked) {
    return (
      <Route path={path} nest={nest}>
        <Redirect to="~/suspended" />
      </Route>
    );
  }

  return <Route path={path} nest={nest}><Component /></Route>;
}
