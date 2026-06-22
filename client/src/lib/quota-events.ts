// Quotas have been removed — these are no-op stubs kept so existing importers
// (queryClient, campaign pages, etc.) keep compiling. No quota events are emitted.
export interface QuotaExceededDetail {
  action: string;
  limit: number;
  current: number;
  label: string;
  tier: string;
}

export function emitQuotaExceeded(_detail: QuotaExceededDetail) {
  // no-op
}

export function onQuotaExceeded(_handler: (detail: QuotaExceededDetail) => void): () => void {
  return () => {};
}
