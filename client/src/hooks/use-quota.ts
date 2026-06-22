// Quotas have been removed — the app is fully free and unlimited.
// Kept as a constant stub so existing consumers keep working unchanged.
interface QuotaItem {
  action: string;
  label: string;
  current: number;
  limit: number | null;
}

const UNLIMITED: QuotaItem = { action: "", label: "", current: 0, limit: null };

export function useQuota() {
  return {
    isLoading: false,
    quotas: [] as QuotaItem[],
    tier: "founder",
    canSchedule: true,
    aiPostsRemaining: null as number | null,
    isAtAiLimit: false,
    canCreateCompany: true,
    canInviteMember: true,
    aiQuota: UNLIMITED,
    seatQuota: UNLIMITED,
    companyQuota: UNLIMITED,
  };
}
