import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "../lib/queryClient";
import type { ModuleKey, ActionKey, PermissionEntry } from "@shared/schema";

type PermissionsData = {
  permissions: PermissionEntry[];
  systemRole: string;
  hasOrg: boolean;
  organizationId?: number;
  organizationName?: string;
  isBlocked: boolean;
};

export type OrgStatus = "loading" | "has_org" | "no_org";

/**
 * Reads the current user's permissions and org membership.
 *
 * IMPORTANT: When gating UI on org membership, prefer `orgStatus`
 * (loading | has_org | no_org) over the legacy `hasOrg` boolean. Treating
 * `hasOrg === false` as "no org" without first handling `loading` will flash
 * an empty state during initial load or cache invalidation — historical bug.
 */
export function usePermissions() {
  const { data, isLoading, isFetching } = useQuery<PermissionsData>({
    queryKey: ["/api/user/permissions"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const orgStatus: OrgStatus =
    !data && isLoading ? "loading" :
    data?.hasOrg ? "has_org" :
    "no_org";

  const hasPermission = (module: ModuleKey, action: ActionKey): boolean => {
    if (!data) return true;
    if (!data.hasOrg) return true;
    if (data.systemRole === "super_admin" || data.systemRole === "admin") return true;
    return data.permissions.some(
      (p) => p.module === module && p.action === action && p.granted
    );
  };

  const canAccess = (module: ModuleKey): boolean => {
    if (!data) return true;
    if (!data.hasOrg) return true;
    if (data.systemRole === "super_admin" || data.systemRole === "admin") return true;
    return data.permissions.some((p) => p.module === module && p.granted);
  };

  const isAdmin = (): boolean => {
    if (!data) return false;
    return data.systemRole === "admin" || data.systemRole === "super_admin";
  };

  const isSuperAdmin = (): boolean => {
    if (!data) return false;
    return data.systemRole === "super_admin";
  };

  return {
    permissions: data?.permissions || [],
    systemRole: data?.systemRole || "creator",
    hasOrg: data?.hasOrg === true,
    organizationId: data?.organizationId,
    organizationName: data?.organizationName,
    isBlocked: data?.isBlocked ?? false,
    isLoading,
    isFetching,
    orgStatus,
    hasPermission,
    canAccess,
    isAdmin,
    isSuperAdmin,
  };
}
