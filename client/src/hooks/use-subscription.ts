// Subscriptions/billing have been removed — the app is fully free and unlimited.
// This hook is kept as a constant stub so existing consumers keep working unchanged.
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "trial_expired" | "none" | "no_org";
export type TierType = "trial" | "founder" | "professional" | "enterprise";
export type AccountStatus = "active" | "expired" | "suspended" | "canceled";

export function useSubscription() {
  return {
    status: "active" as SubscriptionStatus,
    tier: "founder" as TierType,
    accountStatus: "active" as AccountStatus,
    billingCustomerId: null as string | null,
    trialDaysRemaining: 9999,
    trialMinutesRemaining: 9999 * 24 * 60,
    subscription: null as null,
    hasAccess: true,
    isTrialing: false,
    needsSubscription: false,
    isPastDue: false,
    isFounder: true,
    isPaid: true,
    isSuspended: false,
    isLoading: false,
    error: null as unknown,
    refetch: () => {},
  };
}
