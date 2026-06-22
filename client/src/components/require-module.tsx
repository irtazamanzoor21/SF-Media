import { type ReactNode } from "react";
import { usePermissions } from "@/hooks/use-permissions";
import { Shield, Loader2 } from "lucide-react";
import type { ModuleKey } from "@shared/schema";

/**
 * Gates a page on a specific permission module. Pair with the sidebar's
 * canAccess() filtering so that a user who types a URL directly also lands
 * on AccessDenied instead of rendering a page they shouldn't see.
 *
 * Admins and super-admins bypass the check (usePermissions handles that).
 * During the initial permissions load we render a spinner to avoid flashing
 * the denied screen before the user object resolves.
 *
 * The `adminOnly` opt-in additionally requires the user to be an org admin
 * (Team/Billing). Module grants alone don't qualify.
 */
export function RequireModule({
  module,
  adminOnly = false,
  children,
}: {
  module: ModuleKey;
  adminOnly?: boolean;
  children: ReactNode;
}) {
  const { canAccess, isAdmin, orgStatus, isLoading } = usePermissions();

  if (orgStatus === "loading" || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" data-testid="require-module-loading">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allowed = adminOnly ? isAdmin() : canAccess(module);
  if (!allowed) return <AccessDenied module={module} />;

  return <>{children}</>;
}

function AccessDenied({ module }: { module: ModuleKey }) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center"
      data-testid="access-denied"
    >
      <Shield className="w-16 h-16 text-muted-foreground" />
      <h2 className="text-xl font-semibold">Access Denied</h2>
      <p className="text-muted-foreground max-w-md text-sm">
        You don't have permission to view this page. Ask your organization
        admin to grant your role the <strong>{module.replace(/_/g, " ").toLowerCase()}</strong> permission.
      </p>
    </div>
  );
}
