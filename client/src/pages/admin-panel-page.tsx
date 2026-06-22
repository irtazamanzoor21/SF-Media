import { useState, type ComponentType, type ReactNode, type FormEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Building2, Megaphone, FileText, CreditCard, Search, Ban, CheckCircle,
  Loader2, Clock, XCircle, UserX, LogOut, ShieldAlert, Lock, Eye, EyeOff,
  RefreshCw, Trash2, Mail, DollarSign, ChevronDown, AlertTriangle, ExternalLink,
  Shield, Info, ChevronRight, Copy, User, TrendingUp, Calendar, AlertCircle,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isBlank } from "@/lib/utils";

const TIERS = ["trial", "professional", "enterprise", "founder"] as const;
type TierType = typeof TIERS[number];

const TIER_COLORS: Record<string, string> = {
  trial: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  professional: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  enterprise: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  founder: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

type AdminStats = {
  totalUsers: number; totalOrganizations: number; totalCampaigns: number;
  totalPosts: number; activeSubscriptions: number; trialingOrgs: number; blockedUsers: number;
};

type AdminUser = {
  id: number; fullName: string; email: string; systemRole: string; blocked: boolean;
  onboardingCompleted: boolean; organizationName?: string; organizationRole?: string;
  organizationId?: number; tier: string; accountStatus: string; trialExpiresAt?: string;
  createdAt?: string;
};

type OrgTrialResetEntry = {
  resetAt: string; adminId: number; reason: string;
  previousExpiry: string | null; newExpiry: string; usageReset: boolean;
};

type AdminOrg = {
  id: number; name: string; slug: string; suspended: boolean; createdAt: string;
  tier: string; accountStatus: string; trialExpiresAt?: string;
  billingCustomerId: string | null;
  trialResetHistory: OrgTrialResetEntry[];
  memberCount: number; campaignCount: number; postCount: number;
  adminEmail: string | null; adminName: string | null;
  subscription: {
    status: string; billingInterval: string | null; trialEndsAt: string | null;
    currentPeriodEnd: string | null; planId: number | null;
    stripeSubscriptionId: string | null;
  } | null;
};

type SubscriptionPlan = {
  id: number; name: string; monthlyPrice: number; annualPrice: number;
  stripeMonthlyPriceId: string | null; stripeAnnualPriceId: string | null;
  isActive: boolean; createdAt: string;
};

type BillingData = {
  hasStripeSubscription: boolean;
  subscription?: { id: number; status: string; tier: string; billingInterval?: string | null } | null;
  stripeSubscription?: {
    id: string; stripeSubscriptionId?: string; status: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean;
    amount: number; currency: string; interval: string | null;
  } | null;
  recentInvoices?: Array<{
    id: string; amount: number; currency: string; status: string; date: string; hosted_invoice_url?: string;
  }>;
  paymentMethod?: {
    id: string; brand: string; last4: string; expMonth: number | null; expYear: number | null;
  } | null;
};

type OrgBillingSummary = {
  orgId: number;
  hasStripe: boolean;
  error?: boolean;
  subscriptionStatus: string | null;
  tier: string | null;
  interval: string | null;
  mrr: number | null;
  totalPaid: number | null;
  invoicesPaidCount: number;
  failedPaymentsCount: number;
  lastPaymentDate: string | null;
  lastPaymentAmount: number | null;
  nextRenewalDate: string | null;
  canceledAt: string | null;
};

type TierResetLogEntry = {
  resetAt: string; adminId: number; reason: string;
  previousExpiry: string | null; newExpiry: string; usageReset: boolean;
};

type UserDetailResponse = {
  id: number; fullName: string; email: string; systemRole: string; blocked: boolean;
  onboardingCompleted: boolean; tier: string; accountStatus: string;
  trialExpiresAt?: string | null; billingCustomerRef?: string | null;
  emailVerifiedAt?: string | null; createdAt?: string | null; lastLoginAt?: string | null; deletedAt?: string | null;
  trialResetHistory?: TierResetLogEntry[];
  membership?: {
    orgId: number; orgName: string; orgTier: string; orgStatus: string; orgSlug: string; systemRole: string;
  } | null;
  subscription?: {
    id: number; status: string; tier: string; billingInterval: string | null;
    trialEndsAt: string | null; currentPeriodEnd: string | null; canceledAt: string | null;
    stripeSubscriptionId: string | null; billingCustomerId: string | null;
    tierAssignedAt: string | null; trialResetHistory?: TierResetLogEntry[];
  } | null;
  tierResetHistory?: Array<{
    reason: string; newExpiry: string; usageReset: boolean; createdAt: string; adminId?: number;
  }>;
  usageStats?: {
    campaignCount: number; postCount: number; scheduledPostCount: number;
    aiImageEventCount: number; socialConnectionCount: number;
  };
  lastEmailDelivery?: { sentAt: string; used: boolean; expired: boolean } | null;
  tierAssignedAt?: string | null;
};

type TierQuotaConfig = {
  id: number; tier: string; resource: string; limit: number | null; enabled: boolean;
};

function TierBadge({ tier }: { tier: string }) {
  return (
    <Badge className={`capitalize ${TIER_COLORS[tier] ?? "bg-gray-100 text-gray-700"}`}>
      {tier}
    </Badge>
  );
}

function StatCard({ title, value, icon: Icon }: { title: string; value: number | string; icon: ComponentType<{ className?: string }> }) {
  return (
    <Card data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`stat-value-${title.toLowerCase().replace(/\s+/g, "-")}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function getSubStatusBadge(status?: string) {
  if (!status) return <Badge variant="outline" className="text-gray-500">No Plan</Badge>;
  switch (status) {
    case "active": return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Active</Badge>;
    case "trialing": return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Trial</Badge>;
    case "past_due": return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Past Due</Badge>;
    case "canceled": return <Badge variant="outline" className="text-gray-500">Canceled</Badge>;
    case "trial_expired": return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Trial Expired</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function fmt(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtCents(cents: number | null | undefined) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function OrgBillingStatsRow({ billing, loading }: { billing: OrgBillingSummary | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center gap-4 py-1.5 px-1">
        {[80, 64, 72, 88, 96].map((w, i) => (
          <div key={i} className={`h-3 rounded bg-muted animate-pulse`} style={{ width: w }} />
        ))}
      </div>
    );
  }

  if (!billing) {
    return <div className="py-1.5 px-1 text-xs text-muted-foreground">No billing data</div>;
  }

  if (billing.error) {
    return (
      <div className="flex items-center gap-1.5 py-1.5 px-1 text-xs text-amber-600">
        <AlertCircle className="h-3 w-3" />
        Billing data unavailable
      </div>
    );
  }

  if (!billing.hasStripe) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5 px-1">
        {billing.subscriptionStatus && getSubStatusBadge(billing.subscriptionStatus)}
        {billing.tier && (
          <span className="text-xs text-muted-foreground capitalize">
            Plan: <span className="font-medium text-foreground">{billing.tier}</span>
            {billing.interval ? ` · ${billing.interval === "year" ? "Annual" : billing.interval === "month" ? "Monthly" : billing.interval}` : ""}
          </span>
        )}
        {billing.nextRenewalDate && (
          <span className="text-xs text-muted-foreground">
            Renewal: <span className="font-medium text-foreground">{fmt(billing.nextRenewalDate)}</span>
          </span>
        )}
        <span className="text-xs text-muted-foreground/60 italic">No Stripe subscription linked</span>
      </div>
    );
  }

  const statItem = (icon: JSX.Element, label: string, value: string, highlight?: "green" | "red") => (
    <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${highlight === "green" ? "text-green-600" : highlight === "red" ? "text-red-600" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );

  const intervalLabel = billing.interval === "year" ? "Annual" : billing.interval === "month" ? "Monthly" : billing.interval ?? null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 py-1.5 px-1" data-testid={`billing-stats-${billing.orgId}`}>
      {/* Subscription status badge */}
      {getSubStatusBadge(billing.subscriptionStatus ?? undefined)}
      {/* Plan tier + interval */}
      {billing.tier && (
        <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
          <span className="text-muted-foreground">Plan</span>
          <span className="font-medium capitalize text-foreground">
            {billing.tier}{intervalLabel ? ` · ${intervalLabel}` : ""}
          </span>
        </div>
      )}
      {/* Divider */}
      <span className="text-muted-foreground/40 text-xs">|</span>
      {billing.mrr != null && statItem(
        <TrendingUp className="h-3 w-3" />,
        "MRR",
        fmtCents(billing.mrr) + "/mo",
        "green"
      )}
      {statItem(
        <DollarSign className="h-3 w-3" />,
        "Total paid",
        fmtCents(billing.totalPaid)
      )}
      {statItem(
        <CheckCircle className="h-3 w-3" />,
        "Invoices",
        `${billing.invoicesPaidCount} paid${billing.failedPaymentsCount > 0 ? ` · ${billing.failedPaymentsCount} failed` : ""}`,
        billing.failedPaymentsCount > 0 ? "red" : undefined
      )}
      {billing.lastPaymentDate && statItem(
        <CreditCard className="h-3 w-3" />,
        "Last payment",
        `${fmtCents(billing.lastPaymentAmount)} on ${fmt(billing.lastPaymentDate)}`
      )}
      {billing.canceledAt ? statItem(
        <XCircle className="h-3 w-3" />,
        "Canceled",
        fmt(billing.canceledAt),
        "red"
      ) : billing.nextRenewalDate ? statItem(
        <Calendar className="h-3 w-3" />,
        "Renewal",
        fmt(billing.nextRenewalDate)
      ) : null}
    </div>
  );
}

function LabelRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between py-1.5 border-b last:border-0">
      <span className="text-muted-foreground text-sm w-36 shrink-0">{label}</span>
      <span className="text-sm text-right">{children}</span>
    </div>
  );
}

// ─── User Detail Modal ────────────────────────────────────────────────────────
function UserDetailModal({ userId, onClose }: { userId: number; onClose: () => void }) {
  const { toast } = useToast();
  const { data: detail, isLoading, refetch } = useQuery<UserDetailResponse>({
    queryKey: [`/api/admin/users/${userId}`],
    retry: false,
  });

  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showRestore, setShowRestore] = useState(false);

  const verifyEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/verify-email`, {});
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: (d) => { toast({ title: "Email verified", description: d.message }); refetch(); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/deactivate`, {});
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User deleted", description: "Account has been soft-deleted. Data is preserved and can be restored." });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setShowDeactivate(false);
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/restore`, {});
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Account restored", description: "User's account has been restored and is now active." });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setShowRestore(false);
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const blockMutation = useMutation({
    mutationFn: async (blocked: boolean) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/block`, { blocked });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => { toast({ title: "User updated" }); refetch(); queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const onboardingMutation = useMutation({
    mutationFn: async (completed: boolean) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/mark-onboarding`, { onboardingCompleted: completed });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => { toast({ title: "Onboarding status updated" }); refetch(); queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const passwordResetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/email/password-reset", { email: detail?.email });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: (d: { message: string }) => toast({ title: "Email sent", description: d.message }),
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const sendVerificationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/email/send-verification", { email: detail?.email });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: (d: { message: string }) => toast({ title: "Verification email sent", description: d.message }),
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent><div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div></DialogContent>
      </Dialog>
    );
  }

  if (!detail) return null;

  const orgId = detail.membership?.orgId;

  const initials = (detail.fullName || detail.email)
    .split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  const accountStatusColor =
    detail.accountStatus === "active" && !detail.blocked ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
    : detail.blocked ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";

  const accountStatusLabel = detail.blocked ? "Blocked" : detail.accountStatus;

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-0">

          {/* ── Header ── */}
          <div className="px-6 pt-6 pb-4 border-b bg-muted/30">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-lg font-bold text-primary">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold truncate">{detail.fullName}</h2>
                <p className="text-sm text-muted-foreground truncate">{detail.email}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <Badge className={accountStatusColor + " capitalize"}>{accountStatusLabel}</Badge>
                  <TierBadge tier={detail.membership?.orgTier ?? detail.tier ?? "trial"} />
                  <Badge variant="outline" className="capitalize text-xs">{detail.systemRole.replace("_", " ")}</Badge>
                  {detail.emailVerifiedAt && (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs"><CheckCircle className="h-3 w-3 mr-1" />Email verified</Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Quick meta row */}
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-xs text-muted-foreground">
              <span>Joined <span className="text-foreground font-medium">{fmt(detail.createdAt)}</span></span>
              {detail.lastLoginAt && <span>Last login <span className="text-foreground font-medium">{fmt(detail.lastLoginAt)}</span></span>}
              {detail.deletedAt && (
                <span className="text-red-600 font-medium">Deleted {fmt(detail.deletedAt)} · 90-day retention</span>
              )}
            </div>
          </div>

          <div className="px-6 py-4 space-y-4">

            {/* ── Organization & Subscription side-by-side ── */}
            <div className="grid grid-cols-2 gap-3">
              {/* Organization */}
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="h-3 w-3" />Organization
                </p>
                {detail.membership ? (
                  <>
                    <p className="text-sm font-medium truncate">{detail.membership.orgName}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <TierBadge tier={detail.membership.orgTier ?? "trial"} />
                      <Badge variant="outline" className="capitalize text-xs">{detail.membership.orgStatus}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Role: <span className="text-foreground capitalize">{detail.membership.systemRole.replace("_", " ")}</span>
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No organization</p>
                )}
              </div>

              {/* Subscription */}
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <CreditCard className="h-3 w-3" />Subscription
                </p>
                {detail.subscription ? (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {getSubStatusBadge(detail.subscription.status)}
                      <TierBadge tier={detail.subscription.tier ?? "trial"} />
                    </div>
                    {detail.subscription.billingInterval && (
                      <p className="text-xs text-muted-foreground capitalize">{detail.subscription.billingInterval === "year" ? "Annual" : detail.subscription.billingInterval === "month" ? "Monthly" : detail.subscription.billingInterval}</p>
                    )}
                    {detail.subscription.trialEndsAt && (
                      <p className="text-xs text-muted-foreground">
                        Trial ends <span className="text-foreground">{fmt(detail.subscription.trialEndsAt)}</span>
                      </p>
                    )}
                    {detail.subscription.currentPeriodEnd && !detail.subscription.trialEndsAt && (
                      <p className="text-xs text-muted-foreground">
                        Renews <span className="text-foreground">{fmt(detail.subscription.currentPeriodEnd)}</span>
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No subscription</p>
                )}
              </div>
            </div>

            {/* ── Usage Stats ── */}
            {detail.usageStats && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <TrendingUp className="h-3 w-3" />Usage (org-wide)
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "Campaigns", value: detail.usageStats.campaignCount },
                    { label: "Posts", value: detail.usageStats.postCount },
                    { label: "Scheduled", value: detail.usageStats.scheduledPostCount },
                    { label: "Connections", value: detail.usageStats.socialConnectionCount },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg border p-2.5 text-center">
                      <p className="text-lg font-bold">{value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* ── Actions ── */}
            {detail.systemRole !== "super_admin" && (
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <Button
                    variant={detail.blocked ? "outline" : "outline"}
                    size="sm"
                    className={detail.blocked ? "border-green-200 text-green-600 hover:bg-green-50 hover:text-green-700" : "border-amber-200 text-amber-600 hover:bg-amber-50 hover:text-amber-700"}
                    onClick={() => blockMutation.mutate(!detail.blocked)}
                    disabled={blockMutation.isPending}
                    data-testid="button-user-detail-block"
                  >
                    {blockMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Ban className="h-3.5 w-3.5 mr-1.5" />}
                    {detail.blocked ? "Unblock User" : "Block User"}
                  </Button>
                  {(detail.accountStatus === "deleted" || !!detail.deletedAt) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-green-200 text-green-600 hover:bg-green-50 hover:text-green-700"
                      onClick={() => setShowRestore(true)}
                      disabled={restoreMutation.isPending}
                      data-testid="button-user-detail-restore"
                    >
                      {restoreMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle className="h-3.5 w-3.5 mr-1.5" />}
                      Restore Account
                    </Button>
                  )}
                </div>
                {detail.accountStatus !== "deleted" && !detail.deletedAt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setShowDeactivate(true)}
                    data-testid="button-user-detail-deactivate"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete User
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="px-6 pb-4 flex justify-end border-t pt-4">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {showDeactivate && (
        <Dialog open onOpenChange={() => setShowDeactivate(false)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-red-600">Delete User Account</DialogTitle></DialogHeader>
            <div className="py-2 space-y-3">
              <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400 flex gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>This will <strong>soft-delete</strong> the account. The user will lose access immediately but all data is preserved. You can restore this account at any time. This action is logged for audit.</span>
              </div>
              <p className="text-sm">User: <strong>{detail.email}</strong></p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeactivate(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => deactivateMutation.mutate()} disabled={deactivateMutation.isPending} data-testid="button-confirm-deactivate-user">
                {deactivateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Delete User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {showRestore && (
        <Dialog open onOpenChange={() => setShowRestore(false)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-green-600">Restore Account</DialogTitle></DialogHeader>
            <div className="py-2 space-y-3">
              <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-3 text-sm text-green-700 dark:text-green-400 flex gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>This will restore the account to <strong>active</strong> status. The user will regain access and their account will be unblocked. This action is logged for audit.</span>
              </div>
              <p className="text-sm">User: <strong>{detail.email}</strong></p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRestore(false)}>Cancel</Button>
              <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => restoreMutation.mutate()} disabled={restoreMutation.isPending} data-testid="button-confirm-restore-user">
                {restoreMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Restore Account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ─── Change Tier Modal ────────────────────────────────────────────────────────
function ChangeTierModal({ orgId, orgName, currentTier, onClose, onSuccess }: {
  orgId: number; orgName: string; currentTier: string;
  onClose: () => void; onSuccess: () => void;
}) {
  const [selectedTier, setSelectedTier] = useState<string>(currentTier);
  const { toast } = useToast();
  const isPaidToLower = ["professional", "enterprise", "founder"].includes(currentTier) &&
    selectedTier === "trial";

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/admin/organizations/${orgId}/tier`, { tier: selectedTier });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: `Tier changed to ${selectedTier}` });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/quota"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/permissions"] });
      onSuccess();
      onClose();
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Change Tier — {orgName}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">Current tier: <TierBadge tier={currentTier} /></p>
          <div className="space-y-2">
            <Label>New Tier</Label>
            <Select value={selectedTier} onValueChange={setSelectedTier}>
              <SelectTrigger data-testid="select-tier"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIERS.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {isPaidToLower && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400 flex gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span><strong>Downgrade warning:</strong> Changing from a paid tier to {selectedTier} will reduce quota limits. This does not cancel their Stripe subscription — cancel separately if needed.</span>
            </div>
          )}
          {!isPaidToLower && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-700 dark:text-amber-400 flex gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              This updates the org, subscription record, and all member users immediately.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || selectedTier === currentTier} data-testid="button-confirm-tier-change">
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Apply Tier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reset Trial Modal ────────────────────────────────────────────────────────
function ResetTrialModal({ orgId, orgName, onClose, onSuccess }: {
  orgId: number; orgName: string; onClose: () => void; onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const [usageReset, setUsageReset] = useState(false);
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/organizations/${orgId}/reset-trial`, { reason, usageReset });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Trial reset", description: `New expiry: ${fmt(data.newExpiry)}${data.usageReset ? " (usage cleared)" : ""}` });
      onSuccess();
      onClose();
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reset Trial — {orgName}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">Sets tier to <strong>trial</strong> and extends expiry 14 days from now.</p>
          <div className="space-y-2">
            <Label htmlFor="reset-reason">Reason (required)</Label>
            <Textarea
              id="reset-reason"
              placeholder="e.g. Customer support extension, sales request..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              data-testid="textarea-reset-reason"
            />
          </div>
          <div className="flex items-center gap-3">
            <Checkbox
              id="usage-reset"
              checked={usageReset}
              onCheckedChange={(v) => setUsageReset(!!v)}
              data-testid="checkbox-usage-reset"
            />
            <div>
              <Label htmlFor="usage-reset" className="font-medium cursor-pointer">Reset AI image quota</Label>
              <p className="text-xs text-muted-foreground">Clears tracked AI image generation events for this org's current period.</p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || reason.trim().length < 3} data-testid="button-confirm-reset-trial">
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Reset Trial
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Org Modal (soft delete) ──────────────────────────────────────────
function DeleteOrgModal({ org, onClose, onSuccess }: { org: AdminOrg; onClose: () => void; onSuccess: () => void }) {
  const [confirm, setConfirm] = useState("");
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/admin/organizations/${org.id}`, {});
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Organization soft-deleted", description: "Data will be retained for 90 days." });
      onSuccess();
      onClose();
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="text-red-600">Soft-Delete Organization</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300 flex gap-2">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>This performs a <strong>soft delete</strong>. The organization will be hidden from all views but data is retained for 90 days before permanent removal. Stripe subscriptions must be canceled separately.</span>
          </div>
          <div className="space-y-2">
            <Label>Type <strong>{org.name}</strong> to confirm</Label>
            <Input value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={org.name} data-testid="input-delete-confirm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => mutation.mutate()} disabled={mutation.isPending || confirm !== org.name} data-testid="button-confirm-delete-org">
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Soft Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Billing Modal (kept for external use) ────────────────────────────────────
function BillingModal({ org, onClose }: { org: AdminOrg; onClose: () => void }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<BillingData>({
    queryKey: [`/api/admin/organizations/${org.id}/billing`],
    retry: false,
  });

  const cancelMutation = useMutation({
    mutationFn: async (immediately: boolean) => {
      const res = await apiRequest("POST", `/api/admin/organizations/${org.id}/cancel-subscription`, { immediately });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Subscription canceled" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/organizations/${org.id}/billing`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations-details"] });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const refundMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await apiRequest("POST", `/api/admin/organizations/${org.id}/refund`, { invoiceId });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: (d) => {
      toast({ title: "Refund issued", description: `Refunded $${(d.amount / 100).toFixed(2)}` });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/organizations/${org.id}/billing`] });
    },
    onError: (e: Error) => toast({ title: "Refund failed", description: e.message, variant: "destructive" }),
  });

  const [creditAmount, setCreditAmount] = useState("");
  const [creditDescription, setCreditDescription] = useState("");
  const [showCreditForm, setShowCreditForm] = useState(false);
  const creditMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/organizations/${org.id}/billing/credit`, {
        amount: parseFloat(creditAmount), description: creditDescription || undefined
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: (d: { amount: number }) => {
      toast({ title: "Credit applied", description: `$${d.amount.toFixed(2)} customer balance credit applied` });
      setCreditAmount(""); setCreditDescription(""); setShowCreditForm(false);
      queryClient.invalidateQueries({ queryKey: [`/api/admin/organizations/${org.id}/billing`] });
    },
    onError: (e: Error) => toast({ title: "Credit failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Billing — {org.name}</DialogTitle></DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !data?.hasStripeSubscription ? (
          <div className="py-4 text-center text-muted-foreground text-sm space-y-2">
            <CreditCard className="h-8 w-8 mx-auto opacity-40" />
            <p>No Stripe subscription found.</p>
            {data?.subscription && (
              <div className="text-left rounded-lg border p-3 space-y-1 mt-3">
                <div className="text-xs font-medium">Local Record</div>
                <div className="text-xs">Status: {data.subscription.status} · Tier: {data.subscription.tier}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {data.paymentMethod && (
              <div className="rounded-lg border p-4 space-y-2 text-sm">
                <div className="font-medium flex items-center gap-2"><CreditCard className="h-4 w-4" />Payment Method</div>
                <div className="grid grid-cols-2 gap-y-1.5 text-muted-foreground">
                  <span>Card</span>
                  <span className="text-foreground font-medium capitalize">
                    {data.paymentMethod.brand} •••• {data.paymentMethod.last4}
                  </span>
                  <span>Expires</span>
                  <span className="text-foreground">
                    {data.paymentMethod.expMonth?.toString().padStart(2, "0")}/{data.paymentMethod.expYear}
                  </span>
                </div>
              </div>
            )}
            {data.stripeSubscription && (
              <div className="rounded-lg border p-4 space-y-2 text-sm">
                <div className="font-medium">Stripe Subscription</div>
                <div className="grid grid-cols-2 gap-y-1.5 text-muted-foreground">
                  <span>Stripe ID</span><span className="text-foreground font-mono text-xs break-all">{data.stripeSubscription.stripeSubscriptionId || "—"}</span>
                  <span>Status</span><span className="text-foreground font-medium capitalize">{data.stripeSubscription.status}</span>
                  <span>Amount</span><span className="text-foreground">${(data.stripeSubscription.amount / 100).toFixed(2)} / {data.stripeSubscription.interval}</span>
                  <span>Period End</span><span className="text-foreground">{fmt(data.stripeSubscription.currentPeriodEnd)}</span>
                  <span>Cancel at End</span><span className="text-foreground">{data.stripeSubscription.cancelAtPeriodEnd ? "Yes" : "No"}</span>
                </div>
                {!data.stripeSubscription.cancelAtPeriodEnd && data.stripeSubscription.status === "active" && (
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => cancelMutation.mutate(false)} disabled={cancelMutation.isPending} data-testid="button-cancel-period-end">
                      Cancel at Period End
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => cancelMutation.mutate(true)} disabled={cancelMutation.isPending} data-testid="button-cancel-immediately">
                      {cancelMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cancel Immediately"}
                    </Button>
                  </div>
                )}
              </div>
            )}
            {(data.recentInvoices?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <div className="font-medium text-sm">Recent Invoices</div>
                <div className="rounded-lg border divide-y text-sm">
                  {data.recentInvoices?.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between px-3 py-2 gap-2">
                      <div>
                        <div className="font-medium">${(inv.amount / 100).toFixed(2)} {inv.currency.toUpperCase()}</div>
                        <div className="text-xs text-muted-foreground">{fmt(inv.date)} · {inv.status}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {inv.hosted_invoice_url && (
                          <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="ghost" className="h-7 px-2" data-testid={`button-view-invoice-${inv.id}`}>
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </a>
                        )}
                        {inv.status === "paid" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => refundMutation.mutate(inv.id)} disabled={refundMutation.isPending} data-testid={`button-refund-invoice-${inv.id}`}>
                            Refund
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {data?.hasStripeSubscription && (
          <div className="border-t pt-3">
            {!showCreditForm ? (
              <Button size="sm" variant="outline" onClick={() => setShowCreditForm(true)} data-testid="button-show-credit-form">
                Apply Customer Balance Credit
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="text-sm font-medium">Apply Stripe Customer Balance Credit</div>
                <div className="flex gap-2">
                  <Input type="number" placeholder="Amount (USD)" min="0.01" step="0.01" value={creditAmount} onChange={e => setCreditAmount(e.target.value)} className="w-32" data-testid="input-credit-amount" />
                  <Input placeholder="Description (optional)" value={creditDescription} onChange={e => setCreditDescription(e.target.value)} data-testid="input-credit-description" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => creditMutation.mutate()} disabled={creditMutation.isPending || !creditAmount || parseFloat(creditAmount) <= 0} data-testid="button-apply-credit">
                    {creditMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Apply Credit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowCreditForm(false)} data-testid="button-cancel-credit">Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditQuotaRow({ config, onSaved }: { config: TierQuotaConfig; onSaved: () => void }) {
  const { toast } = useToast();
  const [unlimited, setUnlimited] = useState(config.limit === null);
  const [limitVal, setLimitVal] = useState(config.limit !== null ? String(config.limit) : "");
  const [enabled, setEnabled] = useState(config.enabled);
  const [editing, setEditing] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/admin/tier-quota-configs/${config.id}`, {
        limit: unlimited ? null : parseInt(limitVal) || 0,
        enabled,
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => { toast({ title: "Quota updated" }); onSaved(); setEditing(false); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const resourceLabel: Record<string, string> = {
    campaign: "Campaigns", ai_image: "AI Images", scheduled_post: "Scheduled Posts", social_connection: "Social Accounts"
  };

  if (!editing) {
    return (
      <tr className="border-b hover:bg-muted/30" data-testid={`row-quota-${config.tier}-${config.resource}`}>
        <td className="p-2.5"><TierBadge tier={config.tier} /></td>
        <td className="p-2.5 text-sm">{resourceLabel[config.resource] || config.resource}</td>
        <td className="p-2.5 text-center font-medium">{config.limit === null ? "∞" : config.limit}</td>
        <td className="p-2.5 text-center">
          {config.enabled ? <Badge className="bg-green-100 text-green-700 text-xs">Active</Badge> : <Badge variant="outline" className="text-gray-500 text-xs">Disabled</Badge>}
        </td>
        <td className="p-2.5 text-center">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(true)} data-testid={`button-edit-quota-${config.id}`}>Edit</Button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b bg-blue-50/50 dark:bg-blue-950/10" data-testid={`row-quota-editing-${config.id}`}>
      <td className="p-2.5"><TierBadge tier={config.tier} /></td>
      <td className="p-2.5 text-sm">{resourceLabel[config.resource] || config.resource}</td>
      <td className="p-2.5 text-center">
        <div className="flex items-center justify-center gap-2">
          <div className="flex items-center gap-1.5">
            <Checkbox checked={unlimited} onCheckedChange={(v) => { setUnlimited(!!v); if (v) setLimitVal(""); }} id={`unlimited-${config.id}`} data-testid={`checkbox-unlimited-${config.id}`} />
            <Label htmlFor={`unlimited-${config.id}`} className="text-xs cursor-pointer">∞</Label>
          </div>
          {!unlimited && (
            <Input
              type="number"
              min="0"
              value={limitVal}
              onChange={e => setLimitVal(e.target.value)}
              className="h-7 w-20 text-xs text-center"
              data-testid={`input-quota-limit-${config.id}`}
            />
          )}
        </div>
      </td>
      <td className="p-2.5 text-center">
        <div className="flex items-center justify-center gap-1.5">
          <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(!!v)} id={`enabled-${config.id}`} data-testid={`checkbox-quota-enabled-${config.id}`} />
          <Label htmlFor={`enabled-${config.id}`} className="text-xs cursor-pointer">Active</Label>
        </div>
      </td>
      <td className="p-2.5 text-center">
        <div className="flex gap-1 justify-center">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(false)}>Cancel</Button>
          <Button size="sm" className="h-7 text-xs" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid={`button-save-quota-${config.id}`}>
            {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ─── Plans Tab ────────────────────────────────────────────────────────────────
function PlansTab() {
  const { toast } = useToast();
  type PlanEditForm = { name?: string; monthlyPrice?: string; annualPrice?: string; stripeMonthlyPriceId?: string; stripeAnnualPriceId?: string; isActive?: boolean };
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [editForm, setEditForm] = useState<PlanEditForm>({});
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", monthlyPrice: "", annualPrice: "", stripeMonthlyPriceId: "", stripeAnnualPriceId: "" });

  const { data: plans, isLoading } = useQuery<SubscriptionPlan[]>({ queryKey: ["/api/admin/subscription-plans"] });
  const { data: quotaConfigs, refetch: refetchQuotas } = useQuery<TierQuotaConfig[]>({ queryKey: ["/api/admin/tier-quota-configs"] });

  type PlanUpdatePayload = { id: number; data: { name?: string; monthlyPrice?: number; annualPrice?: number; stripeMonthlyPriceId?: string | null; stripeAnnualPriceId?: string | null; isActive?: boolean } };
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: PlanUpdatePayload) => {
      const res = await apiRequest("PATCH", `/api/admin/subscription-plans/${id}`, data);
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Plan updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscription-plans"] });
      setEditingPlan(null);
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/subscription-plans", {
        name: createForm.name,
        monthlyPrice: Math.round(parseFloat(createForm.monthlyPrice) * 100),
        annualPrice: Math.round(parseFloat(createForm.annualPrice) * 100),
        stripeMonthlyPriceId: createForm.stripeMonthlyPriceId || null,
        stripeAnnualPriceId: createForm.stripeAnnualPriceId || null,
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Plan created" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscription-plans"] });
      setShowCreate(false);
      setCreateForm({ name: "", monthlyPrice: "", annualPrice: "", stripeMonthlyPriceId: "", stripeAnnualPriceId: "" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const isCreatePlanNameInvalid = isBlank(createForm.name);

  const startEdit = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setEditForm({
      name: plan.name,
      monthlyPrice: (plan.monthlyPrice / 100).toFixed(2),
      annualPrice: (plan.annualPrice / 100).toFixed(2),
      stripeMonthlyPriceId: plan.stripeMonthlyPriceId || "",
      stripeAnnualPriceId: plan.stripeAnnualPriceId || "",
      isActive: plan.isActive,
    });
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Tier Quota Config (editable) */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Shield className="h-4 w-4" />Tier Quota Limits</h3>
        <p className="text-xs text-muted-foreground mb-3">Click "Edit" on any row to update limits or disable a resource for a tier. Changes take effect immediately.</p>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2.5 font-medium">Tier</th>
                  <th className="text-left p-2.5 font-medium">Resource</th>
                  <th className="text-center p-2.5 font-medium">Limit</th>
                  <th className="text-center p-2.5 font-medium">Status</th>
                  <th className="text-center p-2.5 font-medium">Edit</th>
                </tr>
              </thead>
              <tbody>
                {quotaConfigs?.map(cfg => (
                  <EditQuotaRow key={cfg.id} config={cfg} onSaved={() => refetchQuotas()} />
                ))}
                {(!quotaConfigs || quotaConfigs.length === 0) && (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">Loading quota configuration...</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Subscription Plans */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4" />Subscription Plans</h3>
          <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-create-plan">+ New Plan</Button>
        </div>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Monthly (USD)</th>
                  <th className="text-left p-3 font-medium">Annual (USD)</th>
                  <th className="text-left p-3 font-medium">Stripe Monthly ID</th>
                  <th className="text-left p-3 font-medium">Stripe Annual ID</th>
                  <th className="text-left p-3 font-medium">Active</th>
                  <th className="text-center p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans?.map(plan => (
                  <tr key={plan.id} className="border-b hover:bg-muted/30" data-testid={`row-plan-${plan.id}`}>
                    <td className="p-3 font-medium">{plan.name}</td>
                    <td className="p-3">${(plan.monthlyPrice / 100).toFixed(2)}</td>
                    <td className="p-3">${(plan.annualPrice / 100).toFixed(2)}</td>
                    <td className="p-3 text-xs text-muted-foreground font-mono">{plan.stripeMonthlyPriceId || "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground font-mono">{plan.stripeAnnualPriceId || "—"}</td>
                    <td className="p-3">
                      {plan.isActive ? <Badge className="bg-green-100 text-green-700">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                    </td>
                    <td className="p-3 text-center">
                      <Button size="sm" variant="outline" onClick={() => startEdit(plan)} data-testid={`button-edit-plan-${plan.id}`}>Edit</Button>
                    </td>
                  </tr>
                ))}
                {(!plans || plans.length === 0) && (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No plans found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {editingPlan && (
        <Dialog open onOpenChange={() => setEditingPlan(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Plan — {editingPlan.name}</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              {([["name", "Plan Name", "text"], ["monthlyPrice", "Monthly Price ($)", "number"], ["annualPrice", "Annual Price ($)", "number"], ["stripeMonthlyPriceId", "Stripe Monthly Price ID", "text"], ["stripeAnnualPriceId", "Stripe Annual Price ID", "text"]] as [string, string, string][]).map(([field, label, type]) => (
                <div key={field} className="space-y-1">
                  <Label>{label}</Label>
                  <Input type={type} value={editForm[field as keyof PlanEditForm]?.toString() ?? ""} onChange={e => setEditForm(p => ({ ...p, [field]: e.target.value }))} data-testid={`input-plan-${field}`} />
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <Checkbox id="plan-isActive" checked={editForm.isActive ?? true} onCheckedChange={(v) => setEditForm(p => ({ ...p, isActive: !!v }))} data-testid="checkbox-plan-isactive" />
                <Label htmlFor="plan-isActive" className="cursor-pointer">Show in pricing / Active tier</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingPlan(null)}>Cancel</Button>
              <Button onClick={() => updateMutation.mutate({ id: editingPlan.id, data: { name: editForm.name, monthlyPrice: Math.round(parseFloat(editForm.monthlyPrice ?? "0") * 100), annualPrice: Math.round(parseFloat(editForm.annualPrice ?? "0") * 100), stripeMonthlyPriceId: editForm.stripeMonthlyPriceId || null, stripeAnnualPriceId: editForm.stripeAnnualPriceId || null, isActive: editForm.isActive ?? true } })} disabled={updateMutation.isPending} data-testid="button-save-plan">
                {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {showCreate && (
        <Dialog open onOpenChange={() => setShowCreate(false)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Create New Plan</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              {([["name", "Plan Name", "text"], ["monthlyPrice", "Monthly Price ($)", "number"], ["annualPrice", "Annual Price ($)", "number"], ["stripeMonthlyPriceId", "Stripe Monthly Price ID (optional)", "text"], ["stripeAnnualPriceId", "Stripe Annual Price ID (optional)", "text"]] as [string, string, string][]).map(([field, label, type]) => (
                <div key={field} className="space-y-1">
                  <Label>{label}</Label>
                  <Input type={type} value={createForm[field as keyof typeof createForm] ?? ""} onChange={e => setCreateForm(p => ({ ...p, [field]: e.target.value }))} aria-invalid={field === "name" ? isCreatePlanNameInvalid : undefined} data-testid={`input-create-plan-${field}`} />
                  {field === "name" && isCreatePlanNameInvalid && (
                    <p className="text-sm text-destructive" data-testid="error-plan-name">
                      Plan name cannot be empty or contain only spaces.
                    </p>
                  )}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !createForm.name || isCreatePlanNameInvalid || !createForm.monthlyPrice || !createForm.annualPrice} data-testid="button-save-new-plan">
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Create Plan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Email Tools Tab ──────────────────────────────────────────────────────────
function EmailToolsTab() {
  const { toast } = useToast();
  const [resetEmail, setResetEmail] = useState("");
  const [markEmail, setMarkEmail] = useState("");
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");

  const { data: allUsers } = useQuery<AdminUser[]>({ queryKey: ["/api/admin/users"] });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/email/password-reset", { email: resetEmail });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: (d) => { toast({ title: "Email sent", description: d.message }); setResetEmail(""); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const sendVerificationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/email/send-verification", { email: verificationEmail });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: (d) => { toast({ title: "Verification email sent", description: d.message }); setVerificationEmail(""); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const markVerifiedMutation = useMutation({
    mutationFn: async () => {
      const user = allUsers?.find(u => u.email.toLowerCase() === verifyEmail.toLowerCase());
      if (!user) throw new Error("No user found with that email");
      const res = await apiRequest("POST", `/api/admin/users/${user.id}/verify-email`, {});
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: (d) => {
      toast({ title: "Email marked as verified", description: d.message });
      setVerifyEmail("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const markCompleteMutation = useMutation({
    mutationFn: async () => {
      const user = allUsers?.find(u => u.email.toLowerCase() === markEmail.toLowerCase());
      if (!user) throw new Error("No user found with that email");
      const res = await apiRequest("PATCH", `/api/admin/users/${user.id}/mark-onboarding`, { onboardingCompleted: true });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Onboarding marked complete" });
      setMarkEmail("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6 max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" />Send Password Reset</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Send a password reset link to a user via SendGrid. The link expires in 1 hour.</p>
          <div className="space-y-2">
            <Label htmlFor="reset-email">User Email</Label>
            <Input id="reset-email" type="email" placeholder="user@example.com" value={resetEmail} onChange={e => setResetEmail(e.target.value)} data-testid="input-password-reset-email" />
          </div>
          <Button onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending || !resetEmail} data-testid="button-send-password-reset">
            {resetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
            Send Reset Email
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" />Send Verification Email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Send an account verification email with a secure link to a user.</p>
          <div className="space-y-2">
            <Label htmlFor="verification-email">User Email</Label>
            <Input id="verification-email" type="email" placeholder="user@example.com" value={verificationEmail} onChange={e => setVerificationEmail(e.target.value)} data-testid="input-verification-email" />
          </div>
          <Button onClick={() => sendVerificationMutation.mutate()} disabled={sendVerificationMutation.isPending || !verificationEmail} variant="outline" data-testid="button-send-verification">
            {sendVerificationMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
            Send Verification Email
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><CheckCircle className="h-4 w-4" />Mark Email Verified</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Manually mark a user's email as verified. Shows verified status in user detail panel.</p>
          <div className="space-y-2">
            <Label htmlFor="verify-email">User Email</Label>
            <Input id="verify-email" type="email" placeholder="user@example.com" value={verifyEmail} onChange={e => setVerifyEmail(e.target.value)} data-testid="input-mark-verified-email" />
          </div>
          <Button onClick={() => markVerifiedMutation.mutate()} disabled={markVerifiedMutation.isPending || !verifyEmail} variant="outline" data-testid="button-mark-email-verified">
            {markVerifiedMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
            Mark as Verified
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><CheckCircle className="h-4 w-4" />Mark Onboarding Complete</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Mark a user's onboarding as complete, granting full app access.</p>
          <div className="space-y-2">
            <Label htmlFor="mark-email">User Email</Label>
            <Input id="mark-email" type="email" placeholder="user@example.com" value={markEmail} onChange={e => setMarkEmail(e.target.value)} data-testid="input-mark-onboarding-email" />
          </div>
          <Button onClick={() => markCompleteMutation.mutate()} disabled={markCompleteMutation.isPending || !markEmail} variant="outline" data-testid="button-mark-onboarding-complete">
            {markCompleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
            Mark Complete
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function CopyIdRow({ label, value, onCopy }: { label: string; value: string | null | undefined; onCopy: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-1 min-w-0">
        <span className="font-mono text-xs text-muted-foreground truncate">{value || "—"}</span>
        {value && (
          <button
            type="button"
            onClick={() => onCopy(value)}
            className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={`Copy ${label}`}
            aria-label={`Copy ${label}`}
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Org Detail Drawer ────────────────────────────────────────────────────────
function OrgDetailDrawer({ org, onClose, onMutated, billing }: {
  org: AdminOrg; onClose: () => void; onMutated: () => void;
  billing?: OrgBillingSummary;
}) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [showDelete, setShowDelete] = useState(false);
  const { data: billingData, isLoading: billingDataLoading } = useQuery<BillingData>({
    queryKey: [`/api/admin/organizations/${org.id}/billing`],
    enabled: activeTab === "billing",
    retry: false,
  });

  const cancelMutation = useMutation({
    mutationFn: async (immediately: boolean) => {
      const res = await apiRequest("POST", `/api/admin/organizations/${org.id}/cancel-subscription`, { immediately });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Subscription canceled" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/organizations/${org.id}/billing`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations-details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/billing-overview"] });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const refundMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await apiRequest("POST", `/api/admin/organizations/${org.id}/refund`, { invoiceId });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: (d) => {
      toast({ title: "Refund issued", description: `Refunded $${(d.amount / 100).toFixed(2)}` });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/organizations/${org.id}/billing`] });
    },
    onError: (e: Error) => toast({ title: "Refund failed", description: e.message, variant: "destructive" }),
  });

  const suspendMutation = useMutation({
    mutationFn: async (suspended: boolean) => {
      const res = await apiRequest("PATCH", `/api/admin/organizations/${org.id}`, { suspended });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return { suspended };
    },
    onSuccess: ({ suspended }) => {
      toast({ title: suspended ? "Organization suspended" : "Organization unsuspended" });
      onMutated();
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const tabTriggerCls = "rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none h-9 px-4 text-sm font-medium";

  return (
    <>
      <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent side="right" className="w-[500px] sm:max-w-[500px] p-0 flex flex-col overflow-hidden">
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
              <div className="flex items-start justify-between gap-3 pr-6">
                <div>
                  <SheetTitle className="text-lg leading-tight" data-testid={`drawer-org-name-${org.id}`}>
                    {org.name}
                  </SheetTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">#{org.id} · {org.slug}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                  <TierBadge tier={org.tier} />
                  {org.suspended
                    ? <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Suspended</Badge>
                    : <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Active</Badge>
                  }
                </div>
              </div>
            </SheetHeader>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
              <div className="border-b shrink-0 px-2">
                <TabsList className="h-9 w-full justify-start gap-0 bg-transparent p-0 rounded-none">
                  <TabsTrigger value="overview" className={tabTriggerCls} data-testid="tab-drawer-overview">Overview</TabsTrigger>
                  <TabsTrigger value="actions" className={tabTriggerCls} data-testid="tab-drawer-actions">Actions</TabsTrigger>
                </TabsList>
              </div>

              {/* ── Overview Tab ── */}
              <TabsContent value="overview" className="flex-1 overflow-y-auto m-0 px-6 py-5 space-y-5 data-[state=inactive]:hidden">
                {(org.adminName || org.adminEmail) ? (
                  <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-semibold text-primary">
                        {(org.adminName || org.adminEmail || "?")[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight truncate">{org.adminName || "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{org.adminEmail || "—"}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5 text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span className="text-sm">No admin assigned</span>
                  </div>
                )}

                <div className="grid grid-cols-3 rounded-lg border divide-x text-center">
                  <div className="py-3 px-2">
                    <p className="text-xl font-bold tabular-nums">{org.memberCount}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Members</p>
                  </div>
                  <div className="py-3 px-2">
                    <p className="text-xl font-bold tabular-nums">{org.campaignCount}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Campaigns</p>
                  </div>
                  <div className="py-3 px-2">
                    <p className="text-xl font-bold tabular-nums">{org.postCount}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Posts</p>
                  </div>
                </div>

                <div className="rounded-lg border px-3 py-1">
                  <LabelRow label="Joined">{fmt(org.createdAt)}</LabelRow>
                  <LabelRow label="Account Status">
                    <Badge className={org.accountStatus === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}>
                      {org.accountStatus}
                    </Badge>
                  </LabelRow>
                </div>
              </TabsContent>

              {/* ── Billing Tab ── */}
              <TabsContent value="billing" className="flex-1 overflow-y-auto m-0 px-6 py-5 space-y-5 data-[state=inactive]:hidden">
                {/* Summary cards from billing-overview (no extra Stripe call) */}
                {billing && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Summary</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">MRR</p>
                        <p className="text-xl font-bold mt-0.5 text-green-600 dark:text-green-400">
                          {fmtCents(billing.mrr)}<span className="text-sm font-normal text-muted-foreground">/mo</span>
                        </p>
                        {billing.interval && (
                          <p className="text-xs text-muted-foreground capitalize mt-0.5">
                            {billing.interval === "year" ? "Annual plan" : "Monthly plan"}
                          </p>
                        )}
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Total Paid</p>
                        <p className="text-xl font-bold mt-0.5">{fmtCents(billing.totalPaid)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {billing.invoicesPaidCount} invoice{billing.invoicesPaidCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    {billing.failedPaymentsCount > 0 && (
                      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/10 p-3 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                        <p className="text-sm text-red-700 dark:text-red-400">
                          <strong>{billing.failedPaymentsCount}</strong> failed payment{billing.failedPaymentsCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                    )}
                    <div className="rounded-lg border px-3 py-1">
                      <LabelRow label="Status">{getSubStatusBadge(billing.subscriptionStatus ?? undefined)}</LabelRow>
                      {billing.lastPaymentDate && (
                        <LabelRow label="Last Payment">
                          {fmtCents(billing.lastPaymentAmount)} on {fmt(billing.lastPaymentDate)}
                        </LabelRow>
                      )}
                      {billing.nextRenewalDate && !billing.canceledAt && (
                        <LabelRow label="Next Renewal">{fmt(billing.nextRenewalDate)}</LabelRow>
                      )}
                      {billing.canceledAt && (
                        <LabelRow label="Canceled"><span className="text-red-600">{fmt(billing.canceledAt)}</span></LabelRow>
                      )}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Full Stripe details — loaded lazily when billing tab opens */}
                {billingDataLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : !billingData ? null : !billingData.hasStripeSubscription ? (
                  <div className="py-4 text-center text-muted-foreground text-sm space-y-2">
                    <CreditCard className="h-8 w-8 mx-auto opacity-40" />
                    <p>No Stripe subscription found.</p>
                    {billingData.subscription && (
                      <div className="text-left rounded-lg border p-3 space-y-1 mt-3">
                        <div className="text-xs font-medium">Local Record</div>
                        <div className="text-xs">Status: {billingData.subscription.status} · Tier: {billingData.subscription.tier}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {billingData.paymentMethod && (
                      <div className="rounded-lg border p-4 space-y-2 text-sm">
                        <div className="font-medium flex items-center gap-2"><CreditCard className="h-4 w-4" />Payment Method</div>
                        <div className="grid grid-cols-2 gap-y-1.5 text-muted-foreground">
                          <span>Card</span>
                          <span className="text-foreground font-medium capitalize">
                            {billingData.paymentMethod.brand} •••• {billingData.paymentMethod.last4}
                          </span>
                          <span>Expires</span>
                          <span className="text-foreground">
                            {billingData.paymentMethod.expMonth?.toString().padStart(2, "0")}/{billingData.paymentMethod.expYear}
                          </span>
                        </div>
                      </div>
                    )}
                    {billingData.stripeSubscription && (
                      <div className="rounded-lg border p-4 space-y-2 text-sm">
                        <div className="font-medium">Stripe Subscription</div>
                        <div className="grid grid-cols-2 gap-y-1.5 text-muted-foreground">
                          <span>Stripe ID</span>
                          <span className="text-foreground font-mono text-xs break-all">{billingData.stripeSubscription.stripeSubscriptionId || "—"}</span>
                          <span>Status</span>
                          <span className="text-foreground font-medium capitalize">{billingData.stripeSubscription.status}</span>
                          <span>Amount</span>
                          <span className="text-foreground">${(billingData.stripeSubscription.amount / 100).toFixed(2)} / {billingData.stripeSubscription.interval}</span>
                          <span>Period End</span>
                          <span className="text-foreground">{fmt(billingData.stripeSubscription.currentPeriodEnd)}</span>
                          <span>Cancel at End</span>
                          <span className="text-foreground">{billingData.stripeSubscription.cancelAtPeriodEnd ? "Yes" : "No"}</span>
                        </div>
                        {!billingData.stripeSubscription.cancelAtPeriodEnd && billingData.stripeSubscription.status === "active" && (
                          <div className="flex gap-2 pt-2">
                            <Button size="sm" variant="outline" onClick={() => cancelMutation.mutate(false)} disabled={cancelMutation.isPending} data-testid="button-cancel-period-end">
                              Cancel at Period End
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => cancelMutation.mutate(true)} disabled={cancelMutation.isPending} data-testid="button-cancel-immediately">
                              {cancelMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cancel Immediately"}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Invoices */}
                    {(billingData.recentInvoices?.length ?? 0) > 0 && (
                      <div className="space-y-2">
                        <div className="font-medium text-sm">Recent Invoices</div>
                        <div className="rounded-lg border divide-y text-sm">
                          {billingData.recentInvoices?.map((inv) => (
                            <div key={inv.id} className="flex items-center justify-between px-3 py-2 gap-2">
                              <div>
                                <div className="font-medium">${(inv.amount / 100).toFixed(2)} {inv.currency.toUpperCase()}</div>
                                <div className="text-xs text-muted-foreground">{fmt(inv.date)} · {inv.status}</div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {inv.hosted_invoice_url && (
                                  <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer">
                                    <Button size="sm" variant="ghost" className="h-7 px-2" data-testid={`button-view-invoice-${inv.id}`}>
                                      <ExternalLink className="h-3 w-3" />
                                    </Button>
                                  </a>
                                )}
                                {inv.status === "paid" && (
                                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => refundMutation.mutate(inv.id)} disabled={refundMutation.isPending} data-testid={`button-refund-invoice-${inv.id}`}>
                                    Refund
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* ── Actions Tab ── */}
              <TabsContent value="actions" className="flex-1 overflow-y-auto m-0 px-6 py-5 space-y-4 data-[state=inactive]:hidden">
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/10 p-3 space-y-2">
                  <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Danger Zone</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`w-full justify-start border-red-200 dark:border-red-800 ${org.suspended ? "text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/20" : "text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/20"}`}
                    onClick={() => suspendMutation.mutate(!org.suspended)}
                    disabled={suspendMutation.isPending}
                    data-testid={`button-drawer-suspend-${org.id}`}
                  >
                    {suspendMutation.isPending
                      ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : org.suspended ? <CheckCircle className="h-4 w-4 mr-2" /> : <Ban className="h-4 w-4 mr-2" />
                    }
                    {org.suspended ? "Unsuspend Organization" : "Suspend Organization"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-950/30 border-red-200 dark:border-red-800"
                    onClick={() => setShowDelete(true)}
                    data-testid={`button-drawer-delete-${org.id}`}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />Delete Organization
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      {showDelete && (
        <DeleteOrgModal
          org={org}
          onClose={() => setShowDelete(false)}
          onSuccess={() => { onMutated(); onClose(); }}
        />
      )}
    </>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function AdminDashboard() {
  const { toast } = useToast();
  const [userSearch, setUserSearch] = useState("");
  const [orgSearch, setOrgSearch] = useState("");
  const [userTierFilter, setUserTierFilter] = useState<string>("all");
  const [orgTierFilter, setOrgTierFilter] = useState<string>("all");

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);

  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const emptyCreateOrgForm = { orgName: "", adminFullName: "", adminEmail: "", tier: "trial" as typeof TIERS[number] };
  const [createOrgForm, setCreateOrgForm] = useState(emptyCreateOrgForm);

  const createOrgMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/organizations/create", createOrgForm);
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Create failed"); }
      return res.json() as Promise<{ emailSent: boolean }>;
    },
    onSuccess: (result) => {
      toast({
        title: "Organization created",
        description: result.emailSent
          ? `Welcome email sent to ${createOrgForm.adminEmail}.`
          : `Saved, but the welcome email could not be sent. Check SENDGRID_API_KEY.`,
        variant: result.emailSent ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations-details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setShowCreateOrg(false);
      setCreateOrgForm(emptyCreateOrgForm);
    },
    onError: (e: Error) => toast({ title: "Could not create organization", description: e.message, variant: "destructive" }),
  });

  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({ queryKey: ["/api/admin/dashboard-stats"] });
  const { data: allUsers, isLoading: usersLoading } = useQuery<AdminUser[]>({ queryKey: ["/api/admin/users"] });
  const { data: allOrgs, isLoading: orgsLoading } = useQuery<AdminOrg[]>({ queryKey: ["/api/admin/organizations-details"] });
  const { data: billingOverview } = useQuery<OrgBillingSummary[]>({
    queryKey: ["/api/admin/billing-overview"],
    staleTime: 2 * 60 * 1000,
  });
  const billingMap: Record<number, OrgBillingSummary> = {};
  (billingOverview ?? []).forEach(b => { billingMap[b.orgId] = b; });

  const blockUserMutation = useMutation({
    mutationFn: async ({ userId, blocked }: { userId: number; blocked: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/block`, { blocked });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard-stats"] });
      toast({ title: "User updated" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations-details"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/billing-overview"] });
  };

  const filteredUsers = (allUsers ?? []).filter(u => {
    const matchSearch = u.fullName.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.organizationName && u.organizationName.toLowerCase().includes(userSearch.toLowerCase())) ||
      String(u.id).includes(userSearch);
    const matchTier = userTierFilter === "all" || u.tier === userTierFilter;
    return matchSearch && matchTier;
  });

  const filteredOrgs = (allOrgs ?? []).filter(o => {
    const matchSearch = o.name.toLowerCase().includes(orgSearch.toLowerCase()) ||
      (o.adminEmail && o.adminEmail.toLowerCase().includes(orgSearch.toLowerCase())) ||
      String(o.id).includes(orgSearch);
    const matchTier = orgTierFilter === "all" || o.tier === orgTierFilter;
    return matchSearch && matchTier;
  });

  return (
    <div className="space-y-6">
      {statsLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <StatCard title="Total Users" value={stats.totalUsers} icon={Users} />
          <StatCard title="Organizations" value={stats.totalOrganizations} icon={Building2} />
          <StatCard title="Campaigns" value={stats.totalCampaigns} icon={Megaphone} />
          <StatCard title="Total Posts" value={stats.totalPosts} icon={FileText} />
          <StatCard title="Active Subs" value={stats.activeSubscriptions} icon={CreditCard} />
          <StatCard title="On Trial" value={stats.trialingOrgs} icon={Clock} />
          <StatCard title="Blocked Users" value={stats.blockedUsers} icon={UserX} />
        </div>
      ) : null}

      <Tabs defaultValue="organizations" className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <TabsList data-testid="tabs-admin">
            <TabsTrigger value="organizations" data-testid="tab-organizations">Organizations</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
            <TabsTrigger value="email" data-testid="tab-email">Email Tools</TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" onClick={refreshAll} data-testid="button-refresh-all">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh
          </Button>
        </div>

        {/* Organizations Tab */}
        <TabsContent value="organizations" className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name, email, ID..." value={orgSearch} onChange={e => setOrgSearch(e.target.value)} className="pl-9" data-testid="input-search-organizations" />
            </div>
            <Select value={orgTierFilter} onValueChange={setOrgTierFilter}>
              <SelectTrigger className="w-40" data-testid="select-org-tier-filter"><SelectValue placeholder="All Tiers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                {TIERS.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" className="ml-auto" onClick={() => setShowCreateOrg(true)} data-testid="button-create-organization">
              + Create Organization
            </Button>
          </div>

          {orgsLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <Card>
              <p className="text-xs text-muted-foreground px-4 pt-3 pb-1">Click any row to view full details and manage the organization.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Organization</th>
                      <th className="text-left p-3 font-medium">Admin Email</th>
                      <th className="text-left p-3 font-medium">Tier</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-center p-3 font-medium">Members · Campaigns</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrgs.map(org => (
                      <tr
                        key={org.id}
                        className="border-b hover:bg-muted/30 cursor-pointer"
                        onClick={() => setSelectedOrgId(org.id)}
                        data-testid={`row-org-${org.id}`}
                      >
                        <td className="p-3">
                          <div className="font-medium">{org.name}</div>
                          <div className="text-xs text-muted-foreground">#{org.id}</div>
                          {org.suspended && <Badge className="mt-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs">Suspended</Badge>}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">{org.adminEmail || "—"}</td>
                        <td className="p-3"><TierBadge tier={org.tier} /></td>
                        <td className="p-3">{getSubStatusBadge(org.subscription?.status)}</td>
                        <td className="p-3 text-center text-muted-foreground" data-testid={`text-counts-${org.id}`}>
                          {org.memberCount} · {org.campaignCount}
                        </td>
                        <td className="p-3 text-right text-muted-foreground">
                          <ChevronRight className="h-4 w-4 inline" />
                        </td>
                      </tr>
                    ))}
                    {filteredOrgs.length === 0 && (
                      <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No organizations found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {showCreateOrg && (
            <Dialog open onOpenChange={(open) => { if (!open) { setShowCreateOrg(false); setCreateOrgForm(emptyCreateOrgForm); } }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Organization</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    Creates a new organization and admin account. The admin receives an email with a temporary password and a login link. They'll be asked to change their password, then walked through onboarding.
                  </p>
                  <div className="space-y-1">
                    <Label>Organization Name</Label>
                    <Input
                      value={createOrgForm.orgName}
                      onChange={e => setCreateOrgForm(p => ({ ...p, orgName: e.target.value }))}
                      placeholder="Acme Corp"
                      data-testid="input-create-org-name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Admin Full Name</Label>
                    <Input
                      value={createOrgForm.adminFullName}
                      onChange={e => setCreateOrgForm(p => ({ ...p, adminFullName: e.target.value }))}
                      placeholder="Jane Doe"
                      data-testid="input-create-org-admin-name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Admin Email</Label>
                    <Input
                      type="email"
                      value={createOrgForm.adminEmail}
                      onChange={e => setCreateOrgForm(p => ({ ...p, adminEmail: e.target.value }))}
                      placeholder="jane@acme.com"
                      data-testid="input-create-org-admin-email"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Tier</Label>
                    <Select value={createOrgForm.tier} onValueChange={(v) => setCreateOrgForm(p => ({ ...p, tier: v as typeof TIERS[number] }))}>
                      <SelectTrigger data-testid="select-create-org-tier"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIERS.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setShowCreateOrg(false); setCreateOrgForm(emptyCreateOrgForm); }} data-testid="button-cancel-create-org">Cancel</Button>
                  <Button
                    onClick={() => createOrgMutation.mutate()}
                    disabled={
                      createOrgMutation.isPending ||
                      !createOrgForm.orgName.trim() ||
                      !createOrgForm.adminFullName.trim() ||
                      !createOrgForm.adminEmail.trim()
                    }
                    data-testid="button-submit-create-org"
                  >
                    {createOrgMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Create & Send Invite
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name, email, ID, org..." value={userSearch} onChange={e => setUserSearch(e.target.value)} className="pl-9" data-testid="input-search-users" />
            </div>
            <Select value={userTierFilter} onValueChange={setUserTierFilter}>
              <SelectTrigger className="w-40" data-testid="select-user-tier-filter"><SelectValue placeholder="All Tiers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                {TIERS.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">Click any user row to see full details and manage their account.</p>

          {usersLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">User</th>
                      <th className="text-left p-3 font-medium">Organization</th>
                      <th className="text-left p-3 font-medium">Tier</th>
                      <th className="text-left p-3 font-medium">Role</th>
                      <th className="text-center p-3 font-medium">Status</th>
                      <th className="text-center p-3 font-medium">Onboarding</th>
                      <th className="text-left p-3 font-medium">Joined</th>
                      <th className="text-center p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(u => (
                      <tr
                        key={u.id}
                        className="border-b hover:bg-muted/30 cursor-pointer"
                        onClick={() => setSelectedUserId(u.id)}
                        data-testid={`row-user-${u.id}`}
                      >
                        <td className="p-3">
                          <div className="font-medium">{u.fullName}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                          <div className="text-xs text-muted-foreground">#{u.id}</div>
                        </td>
                        <td className="p-3 text-sm">{u.organizationName || <span className="text-muted-foreground">—</span>}</td>
                        <td className="p-3"><TierBadge tier={u.tier ?? "trial"} /></td>
                        <td className="p-3">
                          <Badge variant="outline" className="capitalize">{u.systemRole || "creator"}</Badge>
                        </td>
                        <td className="p-3 text-center">
                          {(u.accountStatus === "deleted" || u.deletedAt) ? (
                            <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"><Trash2 className="h-3 w-3 mr-1" />Deleted</Badge>
                          ) : u.blocked ? (
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"><XCircle className="h-3 w-3 mr-1" />Blocked</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"><CheckCircle className="h-3 w-3 mr-1" />Active</Badge>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {u.onboardingCompleted ? (
                            <Badge variant="outline" className="text-green-600">Complete</Badge>
                          ) : (
                            <Badge variant="outline" className="text-amber-600">Pending</Badge>
                          )}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{u.createdAt ? fmt(u.createdAt) : "—"}</td>
                        <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                          {u.systemRole !== "super_admin" && (
                            <Button variant={u.blocked ? "outline" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => blockUserMutation.mutate({ userId: u.id, blocked: !u.blocked })} disabled={blockUserMutation.isPending} data-testid={`button-block-user-${u.id}`}>
                              {u.blocked ? <><CheckCircle className="h-3 w-3 mr-1" />Unblock</> : <><Ban className="h-3 w-3 mr-1" />Block</>}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No users found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="email"><EmailToolsTab /></TabsContent>
      </Tabs>

      {selectedUserId && (
        <UserDetailModal
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
        />
      )}
      {selectedOrgId != null && (() => {
        const liveOrg = (allOrgs ?? []).find(o => o.id === selectedOrgId);
        if (!liveOrg) return null;
        return (
          <OrgDetailDrawer
            org={liveOrg}
            billing={billingMap[liveOrg.id]}
            onClose={() => setSelectedOrgId(null)}
            onMutated={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations-details"] });
              queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard-stats"] });
              queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
            }}
          />
        );
      })()}
    </div>
  );
}

// ─── Admin Login ──────────────────────────────────────────────────────────────
function AdminLoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Login failed"); return; }
      onSuccess();
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <Card className="w-full max-w-md shadow-lg border-gray-200">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">
            <img src="/logo-icon.svg" alt="SF Media" className="h-10" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            <CardTitle className="text-xl font-semibold">Super Admin Panel</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Sign in with your administrator credentials.</p>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2.5" data-testid="text-admin-login-error">
              <XCircle className="h-4 w-4 flex-shrink-0" />{error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email address</Label>
              <Input id="admin-email" type="email" placeholder="admin@example.com" value={email} onChange={e => setEmail(e.target.value)} required className="h-11" data-testid="input-admin-email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <div className="relative flex items-center">
                <Input id="admin-password" type={showPassword ? "text" : "password"} placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required className="h-11 pr-11 w-full" data-testid="input-admin-password" />
                <button type="button" className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowPassword(!showPassword)} data-testid="button-toggle-admin-password">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full h-11 font-medium" disabled={loading} data-testid="button-admin-login">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminPanelPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const { isLoading } = useQuery({
    queryKey: ["/api/admin/me"],
    queryFn: async () => {
      const res = await fetch("/api/admin/me", { credentials: "include" });
      if (res.ok) { setIsAuthenticated(true); return res.json(); }
      setIsAuthenticated(false);
      return null;
    },
    retry: false,
    staleTime: 0,
  });

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
    setIsAuthenticated(false);
    queryClient.clear();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLoginForm onSuccess={() => { setIsAuthenticated(true); queryClient.invalidateQueries({ queryKey: ["/api/admin/me"] }); }} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/logo-icon.svg" alt="SF Media" className="h-8" />
            <div className="w-px h-6 bg-border" />
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-500" />
              <div>
                <h1 className="text-lg font-bold leading-tight">Super Admin Panel</h1>
                <p className="text-xs text-muted-foreground leading-tight">Platform overview and management</p>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} data-testid="button-admin-logout">
            <LogOut className="h-4 w-4 mr-2" />Logout
          </Button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-6">
        <AdminDashboard />
      </main>
    </div>
  );
}
