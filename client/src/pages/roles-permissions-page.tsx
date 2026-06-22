import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { useQuota } from "@/hooks/use-quota";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Pencil,
  Trash2,
  Shield,
  Users,
  History,
  Building2,
  UserPlus,
  ShieldCheck,
  Lock,
  Ban,
  UserX,
  MailX,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { MODULES, ACTIONS, type ModuleKey, type ActionKey, type PermissionEntry } from "@shared/schema";
import { isBlank } from "@/lib/utils";

type RoleWithPermissions = {
  id: number;
  organizationId: number;
  name: string;
  description: string | null;
  isDefault: boolean;
  isProtected: boolean;
  permissions: { id: number; roleId: number; module: string; action: string; granted: boolean }[];
  memberCount: number;
};

type MemberWithRole = {
  id: number;
  userId: number;
  organizationId: number;
  roleId: number | null;
  systemRole: string;
  joinedAt: string;
  isBlocked: boolean;
  isPending: boolean;
  user: { id: number; fullName: string; email: string; profileImage: string | null };
  role: { id: number; name: string } | null;
};

type AuditLog = {
  id: number;
  organizationId: number;
  userId: number;
  targetUserId: number | null;
  action: string;
  previousValue: any;
  newValue: any;
  createdAt: string;
  user?: { id: number; fullName: string; email: string };
};

const MODULE_LABELS: Record<string, string> = {
  CAMPAIGN: "Campaign",
  CALENDAR: "Calendar",
  BRAND_VOICE: "Brand Voice",
  MEDIA_LIBRARY: "Media Library",
  TEAM_MANAGEMENT: "Team / User Management",
  BILLING: "Billing Details",
  ANALYTICS: "Analytics",
};

const ACTION_LABELS: Record<string, string> = {
  view: "View",
  customize: "Customize",
};

export default function RolesPermissionsPage() {
  const { isAdmin, organizationName, orgStatus } = usePermissions();
  const { toast } = useToast();
  const { canInviteMember, canCreateCompany } = useQuota();

  const [showCreateRole, setShowCreateRole] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleWithPermissions | null>(null);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<RoleWithPermissions | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [assignRoleTarget, setAssignRoleTarget] = useState<MemberWithRole | null>(null);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [cancelInviteTarget, setCancelInviteTarget] = useState<MemberWithRole | null>(null);
  const [blockTarget, setBlockTarget] = useState<MemberWithRole | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MemberWithRole | null>(null);

  const { data: orgData } = useQuery<{ organization: any; membership: any }>({
    queryKey: ["/api/organizations/current"],
  });

  const { data: rolesData, isLoading: rolesLoading } = useQuery<RoleWithPermissions[]>({
    queryKey: ["/api/roles"],
  });

  const { data: membersData, isLoading: membersLoading } = useQuery<MemberWithRole[]>({
    queryKey: ["/api/organization/members"],
  });

  const { data: auditLogs, isLoading: logsLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/roles/audit-logs"],
  });

  const currentUserId = orgData?.membership?.userId;

  const cancelInviteMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("DELETE", `/api/organization/members/invite/${userId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organization/members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/roles/audit-logs"] });
      setCancelInviteTarget(null);
      toast({ title: "Invitation cancelled" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to cancel invite", description: error.message, variant: "destructive" });
    },
  });

  const blockMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("PATCH", `/api/organization/members/${userId}/block`);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/organization/members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/roles/audit-logs"] });
      setBlockTarget(null);
      toast({ title: data.isBlocked ? "Member blocked" : "Member unblocked" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update member status", description: error.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("DELETE", `/api/organization/members/${userId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organization/members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/roles/audit-logs"] });
      setRemoveTarget(null);
      toast({ title: "Member removed from organization" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove member", description: error.message, variant: "destructive" });
    },
  });

  if (orgStatus === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[400px]" data-testid="roles-loading">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (orgStatus === "no_org") {
    return <NoOrganizationView showCreateOrg={showCreateOrg} setShowCreateOrg={setShowCreateOrg} />;
  }

  if (!isAdmin()) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Shield className="w-16 h-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold" data-testid="text-access-denied">Access Denied</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Only administrators can manage roles and permissions.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-page-title">Roles & Permissions</h1>
          <p className="text-muted-foreground text-sm sm:text-base" data-testid="text-org-name">{organizationName}</p>
        </div>
      </div>

      <Tabs defaultValue="roles">
        <TabsList data-testid="tabs-roles-permissions">
          <TabsTrigger value="roles" data-testid="tab-roles">
            <Shield className="w-4 h-4 mr-2" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="members" data-testid="tab-members">
            <Users className="w-4 h-4 mr-2" />
            Members
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">
            <History className="w-4 h-4 mr-2" />
            Audit Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowCreateRole(true)} data-testid="button-create-role">
              <Plus className="w-4 h-4 mr-2" />
              Create Role
            </Button>
          </div>
          {rolesLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <div className="space-y-3">
              {(rolesData || []).map((role) => (
                <RoleCard
                  key={role.id}
                  role={role}
                  onEdit={() => setEditingRole(role)}
                  onDelete={() => setDeleteRoleTarget(role)}
                />
              ))}
              {(!rolesData || rolesData.length === 0) && (
                <p className="text-center text-muted-foreground py-8">No roles yet. Create one to get started.</p>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="members" className="space-y-4">
          <div className="flex justify-end">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      onClick={() => canInviteMember && setShowInvite(true)}
                      disabled={!canInviteMember}
                      data-testid="button-invite-member"
                    >
                      {canInviteMember ? (
                        <><UserPlus className="w-4 h-4 mr-2" /> Invite Member</>
                      ) : (
                        <><Lock className="w-4 h-4 mr-2" /> Invite Member</>
                      )}
                    </Button>
                  </span>
                </TooltipTrigger>
                {!canInviteMember && (
                  <TooltipContent>
                    Seat limit reached. Upgrade to Enterprise / Agency to add more team members.
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
          {membersLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <MembersTable
              members={membersData || []}
              currentUserId={currentUserId}
              onAssignRole={(member) => setAssignRoleTarget(member)}
              onCancelInvite={(member) => setCancelInviteTarget(member)}
              onBlock={(member) => setBlockTarget(member)}
              onRemove={(member) => setRemoveTarget(member)}
            />
          )}
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          {logsLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <AuditLogTable logs={auditLogs || []} />
          )}
        </TabsContent>
      </Tabs>

      {showCreateRole && (
        <RoleDialog
          open={showCreateRole}
          onClose={() => setShowCreateRole(false)}
          role={null}
        />
      )}
      {editingRole && (
        <RoleDialog
          open={!!editingRole}
          onClose={() => setEditingRole(null)}
          role={editingRole}
        />
      )}
      {deleteRoleTarget && (
        <DeleteRoleDialog
          open={!!deleteRoleTarget}
          onClose={() => setDeleteRoleTarget(null)}
          role={deleteRoleTarget}
        />
      )}
      {showInvite && (
        <InviteDialog
          open={showInvite}
          onClose={() => setShowInvite(false)}
          roles={rolesData || []}
        />
      )}
      {assignRoleTarget && (
        <AssignRoleDialog
          open={!!assignRoleTarget}
          onClose={() => setAssignRoleTarget(null)}
          member={assignRoleTarget}
          roles={rolesData || []}
        />
      )}

      <AlertDialog open={!!cancelInviteTarget} onOpenChange={() => setCancelInviteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke the invitation for <strong>{cancelInviteTarget?.user.email}</strong>. They will no longer be able to use their invite link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-revoke">Keep invitation</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelInviteTarget && cancelInviteMutation.mutate(cancelInviteTarget.userId)}
              disabled={cancelInviteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-cancel-invite"
            >
              {cancelInviteMutation.isPending ? "Cancelling..." : "Cancel Invite"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!blockTarget} onOpenChange={() => setBlockTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {blockTarget?.isBlocked ? "Unblock member?" : "Block member?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {blockTarget?.isBlocked
                ? `${blockTarget.user.fullName} will regain access to the organization.`
                : `${blockTarget?.user.fullName} will immediately lose access to the organization. You can unblock them at any time.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-block">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => blockTarget && blockMutation.mutate(blockTarget.userId)}
              disabled={blockMutation.isPending}
              className={blockTarget?.isBlocked ? "" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
              data-testid="button-confirm-block"
            >
              {blockMutation.isPending ? "Updating..." : blockTarget?.isBlocked ? "Unblock" : "Block"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!removeTarget} onOpenChange={() => setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{removeTarget?.user.fullName}</strong> will be removed from the organization. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeTarget && removeMutation.mutate(removeTarget.userId)}
              disabled={removeMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-remove"
            >
              {removeMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NoOrganizationView({
  showCreateOrg,
  setShowCreateOrg,
}: {
  showCreateOrg: boolean;
  setShowCreateOrg: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const { canCreateCompany } = useQuota();
  const [orgName, setOrgName] = useState("");
  const isOrgNameInvalid = isBlank(orgName);

  const createOrgMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/organizations", { name });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/permissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      setShowCreateOrg(false);
      toast({ title: "Organization created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create organization", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      <Building2 className="w-16 h-16 text-muted-foreground" />
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2" data-testid="text-no-org">No Organization</h2>
        <p className="text-muted-foreground max-w-md">
          Create an organization to start managing teams, roles, and permissions.
        </p>
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                onClick={() => canCreateCompany && setShowCreateOrg(true)}
                disabled={!canCreateCompany}
                data-testid="button-create-org"
              >
                {canCreateCompany ? (
                  <><Plus className="w-4 h-4 mr-2" /> Create Organization</>
                ) : (
                  <><Lock className="w-4 h-4 mr-2" /> Company Limit Reached</>
                )}
              </Button>
            </span>
          </TooltipTrigger>
          {!canCreateCompany && (
            <TooltipContent>
              You've reached your company (workspace) limit. Upgrade to Enterprise / Agency to manage up to 3 companies.
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>

      <Dialog open={showCreateOrg} onOpenChange={setShowCreateOrg}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Organization</DialogTitle>
            <DialogDescription>Give your organization a name to get started.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="org-name">Organization Name</Label>
              <Input
                id="org-name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="My Company"
                aria-invalid={isOrgNameInvalid}
                data-testid="input-org-name"
              />
              {isOrgNameInvalid && (
                <p className="text-sm text-destructive" data-testid="error-org-name">
                  Organization name cannot be empty or contain only spaces.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateOrg(false)} data-testid="button-cancel-org">
              Cancel
            </Button>
            <Button
              onClick={() => createOrgMutation.mutate(orgName)}
              disabled={!orgName.trim() || isOrgNameInvalid || createOrgMutation.isPending}
              data-testid="button-submit-org"
            >
              {createOrgMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoleCard({
  role,
  onEdit,
  onDelete,
}: {
  role: RoleWithPermissions;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const grantedModules = [...new Set(role.permissions.filter(p => p.granted).map(p => p.module))];

  return (
    <Card data-testid={`card-role-${role.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
            <CardTitle className="text-lg">{role.name}</CardTitle>
            {role.isDefault && <Badge variant="secondary">Default</Badge>}
            {role.isProtected && <Badge variant="outline">Protected</Badge>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="gap-1">
              <Users className="w-3 h-3" />
              {role.memberCount}
            </Badge>
            <Button variant="ghost" size="icon" onClick={onEdit} data-testid={`button-edit-role-${role.id}`}>
              <Pencil className="w-4 h-4" />
            </Button>
            {!role.isProtected && (
              <Button variant="ghost" size="icon" onClick={onDelete} data-testid={`button-delete-role-${role.id}`}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            )}
          </div>
        </div>
        {role.description && <CardDescription>{role.description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1.5">
          {grantedModules.map((mod) => (
            <Badge key={mod} variant="outline" className="text-xs">
              {MODULE_LABELS[mod] || mod}
            </Badge>
          ))}
          {grantedModules.length === 0 && (
            <span className="text-xs text-muted-foreground">No permissions granted</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RoleDialog({
  open,
  onClose,
  role,
}: {
  open: boolean;
  onClose: () => void;
  role: RoleWithPermissions | null;
}) {
  const { toast } = useToast();
  const isEdit = !!role;
  const [name, setName] = useState(role?.name || "");
  const [description, setDescription] = useState(role?.description || "");
  const isNameInvalid = isBlank(name);
  const [permMatrix, setPermMatrix] = useState<Record<string, Record<string, boolean>>>(() => {
    const matrix: Record<string, Record<string, boolean>> = {};
    for (const mod of MODULES) {
      matrix[mod] = {};
      for (const act of ACTIONS) {
        matrix[mod][act] = false;
      }
    }
    if (role) {
      for (const p of role.permissions) {
        if (matrix[p.module]) {
          matrix[p.module][p.action] = p.granted;
        }
      }
    }
    return matrix;
  });

  const togglePerm = (mod: string, act: string) => {
    setPermMatrix((prev) => ({
      ...prev,
      [mod]: { ...prev[mod], [act]: !prev[mod][act] },
    }));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const permissions: PermissionEntry[] = [];
      for (const mod of MODULES) {
        for (const act of ACTIONS) {
          if (permMatrix[mod]?.[act]) {
            permissions.push({ module: mod, action: act, granted: true });
          }
        }
      }
      if (isEdit) {
        const res = await apiRequest("PATCH", `/api/roles/${role!.id}`, {
          name,
          description,
          permissions,
        });
        return await res.json();
      } else {
        const res = await apiRequest("POST", "/api/roles", {
          name,
          description,
          permissions,
        });
        return await res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/roles/audit-logs"] });
      onClose();
      toast({ title: isEdit ? "Role updated" : "Role created" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredModules = MODULES.filter(m => m !== "SUPER_ADMIN");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Role" : "Create Role"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the role name and permissions." : "Define a new role with specific module access."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="role-name">Role Name</Label>
              <Input
                id="role-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Junior Creator"
                aria-invalid={isNameInvalid}
                data-testid="input-role-name"
              />
              {isNameInvalid && (
                <p className="text-sm text-destructive" data-testid="error-role-name">
                  Role name cannot be empty or contain only spaces.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="role-desc">Description</Label>
              <Input
                id="role-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description"
                data-testid="input-role-description"
              />
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="font-medium mb-3">Permission Matrix</h3>
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px]">Module</TableHead>
                    {ACTIONS.map((act) => (
                      <TableHead key={act} className="text-center text-xs min-w-[70px]">
                        {ACTION_LABELS[act]}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredModules.map((mod) => (
                    <TableRow key={mod}>
                      <TableCell className="font-medium text-sm">
                        {MODULE_LABELS[mod] || mod}
                      </TableCell>
                      {ACTIONS.map((act) => (
                        <TableCell key={act} className="text-center">
                          <Switch
                            checked={permMatrix[mod]?.[act] || false}
                            onCheckedChange={() => togglePerm(mod, act)}
                            data-testid={`switch-perm-${mod}-${act}`}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-role">
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || isNameInvalid || createMutation.isPending}
            data-testid="button-submit-role"
          >
            {createMutation.isPending ? "Saving..." : isEdit ? "Update Role" : "Create Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRoleDialog({
  open,
  onClose,
  role,
}: {
  open: boolean;
  onClose: () => void;
  role: RoleWithPermissions;
}) {
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/roles/${role.id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/roles/audit-logs"] });
      onClose();
      toast({ title: "Role deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Cannot delete role", description: error.message, variant: "destructive" });
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Role "{role.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            {role.memberCount > 0
              ? `This role is currently assigned to ${role.memberCount} member(s). You must reassign them before deleting.`
              : "This action cannot be undone. The role will be permanently removed."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="button-confirm-delete"
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MembersTable({
  members,
  currentUserId,
  onAssignRole,
  onCancelInvite,
  onBlock,
  onRemove,
}: {
  members: MemberWithRole[];
  currentUserId: number | undefined;
  onAssignRole: (member: MemberWithRole) => void;
  onCancelInvite: (member: MemberWithRole) => void;
  onBlock: (member: MemberWithRole) => void;
  onRemove: (member: MemberWithRole) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>System Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const isSelf = member.userId === currentUserId;
              return (
                <TableRow key={member.id} data-testid={`row-member-${member.userId}`}>
                  <TableCell className="font-medium">{member.user.fullName}</TableCell>
                  <TableCell className="text-muted-foreground">{member.user.email}</TableCell>
                  <TableCell>
                    <Badge variant={member.systemRole === "admin" ? "default" : "secondary"}>
                      {member.systemRole === "admin" && <ShieldCheck className="w-3 h-3 mr-1" />}
                      {member.systemRole}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {member.isPending ? (
                      <Badge variant="outline" className="text-yellow-600 border-yellow-400">
                        Invite Pending
                      </Badge>
                    ) : member.isBlocked ? (
                      <Badge variant="destructive">
                        <Ban className="w-3 h-3 mr-1" />
                        Blocked
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-green-600">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(member.joinedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {member.isPending ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onCancelInvite(member)}
                          className="text-destructive hover:text-destructive"
                          data-testid={`button-cancel-invite-${member.userId}`}
                        >
                          <MailX className="w-3.5 h-3.5 mr-1" />
                          Cancel Invite
                        </Button>
                      ) : (
                        <>
                          {!isSelf && member.systemRole !== "admin" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onAssignRole(member)}
                              data-testid={`button-assign-role-${member.userId}`}
                            >
                              Change Role
                            </Button>
                          )}
                          {!isSelf && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onBlock(member)}
                              title={member.isBlocked ? "Unblock member" : "Block member"}
                              data-testid={`button-block-${member.userId}`}
                            >
                              {member.isBlocked ? (
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                              ) : (
                                <Ban className="w-4 h-4 text-yellow-600" />
                              )}
                            </Button>
                          )}
                          {!isSelf && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onRemove(member)}
                              title="Remove from organization"
                              data-testid={`button-remove-${member.userId}`}
                            >
                              <UserX className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {members.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No members yet. Invite someone to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function InviteDialog({
  open,
  onClose,
  roles,
}: {
  open: boolean;
  onClose: () => void;
  roles: RoleWithPermissions[];
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [systemRole, setSystemRole] = useState<"admin" | "creator">("creator");
  const [roleId, setRoleId] = useState<string>("");
  const isEmailInvalid = isBlank(email);

  const inviteMutation = useMutation({
    mutationFn: async () => {
      // "default" is a sentinel value from the "Use default role" SelectItem (line ~1036);
      // anything else should be a numeric role id. Sending parseInt("default") → NaN
      // would serialize to null in JSON and fail the server's numeric schema.
      const customRoleId =
        roleId && roleId !== "default" ? parseInt(roleId, 10) : undefined;
      const res = await apiRequest("POST", "/api/organization/members/invite", {
        email,
        systemRole,
        ...(customRoleId !== undefined && !Number.isNaN(customRoleId)
          ? { roleId: customRoleId }
          : {}),
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organization/members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/roles/audit-logs"] });
      onClose();
      toast({ title: "Member invited successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to invite", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Member</DialogTitle>
          <DialogDescription>Add a team member to your organization.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="invite-email">Email Address</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@company.com"
              aria-invalid={isEmailInvalid}
              data-testid="input-invite-email"
            />
            {isEmailInvalid && (
              <p className="text-sm text-destructive" data-testid="error-invite-email">
                Email address cannot be empty or contain only spaces.
              </p>
            )}
          </div>
          <div>
            <Label>System Role</Label>
            <Select value={systemRole} onValueChange={(v) => setSystemRole(v as "admin" | "creator")}>
              <SelectTrigger data-testid="select-system-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="creator">Creator</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {systemRole === "creator" && (
            <div>
              <Label>Custom Role (optional)</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger data-testid="select-custom-role">
                  <SelectValue placeholder="Use default role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Use default role</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id.toString()}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-invite">
            Cancel
          </Button>
          <Button
            onClick={() => inviteMutation.mutate()}
            disabled={!email.trim() || isEmailInvalid || inviteMutation.isPending}
            data-testid="button-submit-invite"
          >
            {inviteMutation.isPending ? "Inviting..." : "Invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignRoleDialog({
  open,
  onClose,
  member,
  roles,
}: {
  open: boolean;
  onClose: () => void;
  member: MemberWithRole;
  roles: RoleWithPermissions[];
}) {
  const { toast } = useToast();
  const [selectedRoleId, setSelectedRoleId] = useState<string>(
    member.roleId ? member.roleId.toString() : "none"
  );

  const assignMutation = useMutation({
    mutationFn: async () => {
      const roleId = selectedRoleId === "none" ? null : parseInt(selectedRoleId);
      const res = await apiRequest("PATCH", `/api/organization/members/${member.userId}/role`, {
        roleId,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organization/members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/roles/audit-logs"] });
      onClose();
      toast({ title: "Role updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to assign role", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Role for {member.user.fullName}</DialogTitle>
          <DialogDescription>Select a new role for this team member.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label>Role</Label>
            <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
              <SelectTrigger data-testid="select-assign-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No custom role (default permissions)</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id.toString()}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-assign">
            Cancel
          </Button>
          <Button
            onClick={() => assignMutation.mutate()}
            disabled={assignMutation.isPending}
            data-testid="button-submit-assign"
          >
            {assignMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AuditLogTable({ logs }: { logs: AuditLog[] }) {
  const formatAction = (action: string) => {
    return action
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id} data-testid={`row-audit-${log.id}`}>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString()}
                </TableCell>
                <TableCell className="font-medium">
                  {log.user?.fullName || "Unknown"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{formatAction(log.action)}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                  {log.newValue
                    ? typeof log.newValue === "object"
                      ? JSON.stringify(log.newValue).slice(0, 100)
                      : String(log.newValue)
                    : "-"}
                </TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No audit logs yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </CardContent>
    </Card>
  );
}
