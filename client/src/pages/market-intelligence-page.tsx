import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw,
  Globe,
  TrendingUp,
  Target,
  AlertCircle,
  Clock,
  Sparkles,
  Loader2,
  ExternalLink,
  Pencil,
  Check,
  ChevronDown,
  ChevronRight,
  Search,
  DollarSign,
  Gauge,
  Link2,
  HelpCircle,
  Users,
  ArrowUpRight,
  Tag,
  Flame,
} from "lucide-react";
import type { MarketIntelligence, BrandProfile } from "@shared/schema";
import { isBlank } from "@/lib/utils";

interface CompetitorDomain {
  domain: string;
  score: number;
  sharedKeywords?: number;
  avgPosition?: number;
  sharedKeywordList?: string[];
}

interface KeywordInsight {
  keyword: string;
  searchVolume: number;
  difficulty: number;
  cpc: number;
  intent: string;
  relatedKeywords: string[];
  competitorCount?: number;
  competitorDomains?: string[];
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeDomainInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
}

function formatSearchVolume(vol: number): string {
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(vol >= 10_000 ? 0 : 1)}K`;
  return vol.toString();
}

function formatKeywordCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function getDifficultyLabel(score: number): { label: string; className: string } {
  if (score <= 30) return { label: "Easy", className: "text-green-600 dark:text-green-400" };
  if (score <= 60) return { label: "Medium", className: "text-yellow-600 dark:text-yellow-400" };
  return { label: "Hard", className: "text-red-600 dark:text-red-400" };
}

function getDifficultyBarClass(score: number): string {
  if (score <= 30) return "bg-green-500";
  if (score <= 60) return "bg-yellow-500";
  return "bg-red-500";
}

function getDifficultyBadgeClass(score: number): string {
  if (score <= 30) return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
  if (score <= 60) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
  return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
}

function getIntentBadgeVariant(intent: string): string {
  const normalized = intent.toLowerCase().trim();
  if (normalized === "transactional") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
  if (normalized === "commercial" || normalized === "commercial investigation") return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
  if (normalized === "informational") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  return "bg-muted text-muted-foreground";
}


function KeywordInsightCard({ insight, index, maxCompetitorCount }: { insight: KeywordInsight; index: number; maxCompetitorCount: number }) {
  const [expanded, setExpanded] = useState(false);
  const diff = getDifficultyLabel(insight.difficulty);
  const hasRelated = insight.relatedKeywords.length > 0;
  const count = insight.competitorCount ?? 0;

  return (
    <div
      className="border border-border rounded-lg p-3 space-y-2.5 hover:border-primary/30 transition-colors"
      data-testid={`card-keyword-${index}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-mono text-muted-foreground w-4 shrink-0 text-right">{index + 1}</span>
          <p className="text-sm font-medium capitalize truncate" data-testid={`text-keyword-${index}`}>
            {decodeHtmlEntities(insight.keyword)}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {count > 1 && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary"
              title={`Ranked by ${count} of your competitors`}
              data-testid={`badge-competitor-count-${index}`}
            >
              {count} competitors
            </span>
          )}
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getIntentBadgeVariant(insight.intent)}`}
            data-testid={`badge-intent-${index}`}>
            {insight.intent}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground pl-6">
        <div className="flex items-center gap-1" title="Monthly search volume">
          <Search className="w-3 h-3" />
          <span className="font-medium text-foreground" data-testid={`text-volume-${index}`}>
            {insight.searchVolume > 0 ? formatSearchVolume(insight.searchVolume) : "—"}
          </span>
          <span>/mo</span>
        </div>
        <div className="flex items-center gap-1" title="Cost per click">
          <DollarSign className="w-3 h-3" />
          <span data-testid={`text-cpc-${index}`}>
            {insight.cpc > 0 ? `$${insight.cpc.toFixed(2)}` : "—"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-1" title="Keyword difficulty">
          <Gauge className="w-3 h-3 shrink-0" />
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden max-w-[48px]">
            <div
              className={`h-full rounded-full ${getDifficultyBarClass(insight.difficulty)}`}
              style={{ width: `${insight.difficulty}%` }}
            />
          </div>
          <span className={`text-[11px] font-medium ${diff.className}`} data-testid={`text-difficulty-${index}`}>
            {insight.difficulty > 0 ? `${insight.difficulty}` : "—"}
          </span>
        </div>
      </div>

      {hasRelated && (
        <div className="pl-6">
          <button
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setExpanded(!expanded)}
            data-testid={`button-expand-related-${index}`}
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {expanded ? "Hide" : "Show"} related keywords
          </button>
          {expanded && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {insight.relatedKeywords.map((rk, ri) => (
                <span
                  key={ri}
                  className="text-[11px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground capitalize"
                  data-testid={`badge-related-${index}-${ri}`}
                >
                  {decodeHtmlEntities(rk)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CompetitorCard({ competitor, index, targetDomain }: { competitor: CompetitorDomain; index: number; targetDomain: string }) {
  const [expanded, setExpanded] = useState(false);
  const shared = competitor.sharedKeywords ?? competitor.score ?? 0;
  const avgPos = competitor.avgPosition ?? 0;
  const sharedKeywordList = competitor.sharedKeywordList ?? [];
  const hasKeywords = sharedKeywordList.length > 0;

  return (
    <div
      className="border border-border rounded-lg overflow-hidden hover:border-primary/30 transition-colors"
      data-testid={`row-competitor-${index}`}
    >
      <div className="p-3.5 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-mono text-muted-foreground w-4 shrink-0 text-right">{index + 1}</span>
            <div className="w-6 h-6 rounded bg-muted flex items-center justify-center shrink-0">
              <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <a
              href={`https://${competitor.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold hover:text-primary transition-colors truncate flex items-center gap-1 group"
              data-testid={`link-competitor-${index}`}
            >
              <span data-testid={`text-competitor-domain-${index}`}>{competitor.domain}</span>
              <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-primary shrink-0 opacity-60" />
            </a>
          </div>
          {hasKeywords && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors shrink-0 border border-border rounded px-2 py-0.5"
              data-testid={`button-expand-keywords-${index}`}
            >
              <Tag className="w-3 h-3" />
              <span>{sharedKeywordList.length} shared</span>
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-6 sm:pl-12 text-xs text-muted-foreground">
          {shared > 0 && (
            <div className="flex items-center gap-1" title={`Search results pages shared with ${targetDomain}`}>
              <Link2 className="w-3 h-3 text-primary" />
              <span className="font-medium text-foreground" data-testid={`text-shared-keywords-${index}`}>
                {formatKeywordCount(shared)}
              </span>
              <span>shared search results</span>
            </div>
          )}
          {avgPos > 0 && (
            <div className="flex items-center gap-1" title="Their average position in shared search results">
              <ArrowUpRight className="w-3 h-3" />
              <span data-testid={`text-avg-position-${index}`}>Avg. rank #{Math.round(avgPos)}</span>
            </div>
          )}
          {!hasKeywords && index < 5 && (
            <span className="text-muted-foreground/50 italic text-[11px]" data-testid={`text-no-keyword-data-${index}`}>
              No matching keywords found
            </span>
          )}
          {!hasKeywords && index >= 5 && (
            <span className="text-muted-foreground/50 italic text-[11px]" data-testid={`text-no-keyword-data-${index}`}>
              Keyword analysis not run for this domain
            </span>
          )}
        </div>
      </div>

      {expanded && hasKeywords && (
        <div className="px-3.5 pb-3.5 border-t border-border/50 pt-2.5 bg-muted/20">
          <p className="text-[10px] font-medium text-muted-foreground mb-2 pl-6 sm:pl-12 uppercase tracking-wide">
            Keywords both you and {competitor.domain} rank for
          </p>
          <div className="pl-6 sm:pl-12 flex flex-wrap gap-1.5">
            {sharedKeywordList.map((kw, ki) => (
              <span
                key={ki}
                className="text-[11px] bg-background border border-border px-2 py-0.5 rounded-full text-foreground capitalize hover:border-primary/40 transition-colors cursor-default"
                data-testid={`badge-shared-keyword-${index}-${ki}`}
              >
                {decodeHtmlEntities(kw)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MostContestedTable({ keywords, maxCount }: { keywords: KeywordInsight[]; maxCount: number }) {
  const top = keywords
    .filter(k => (k.competitorCount ?? 0) >= 2)
    .sort((a, b) => (b.competitorCount ?? 0) - (a.competitorCount ?? 0))
    .slice(0, 8);

  if (top.length < 3) return null;

  return (
    <div className="mb-4 border border-border rounded-lg overflow-hidden" data-testid="table-most-contested">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
        <Flame className="w-3.5 h-3.5 text-orange-500" />
        <p className="text-xs font-semibold">Highest-Overlap Keywords</p>
        <span className="hidden sm:inline text-[10px] text-muted-foreground ml-auto">Shared by you + multiple competitors</span>
      </div>
      <div className="divide-y divide-border">
        {top.map((kw, i) => {
          const count = kw.competitorCount ?? 0;
          const diff = getDifficultyLabel(kw.difficulty);
          return (
            <div
              key={kw.keyword}
              className="flex items-center gap-3 px-3 py-2 hover:bg-muted/20 transition-colors"
              data-testid={`row-contested-${i}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium capitalize truncate" data-testid={`text-contested-keyword-${i}`}>
                  {decodeHtmlEntities(kw.keyword)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary"
                  data-testid={`text-contested-count-${i}`}
                >
                  {count} competitors
                </span>
                <span className="text-[10px] text-muted-foreground w-14 text-right">
                  {kw.searchVolume > 0 ? formatSearchVolume(kw.searchVolume) : "—"}/mo
                </span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${getDifficultyBadgeClass(kw.difficulty)}`}>
                  {diff.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MarketIntelligencePage() {
  const { organizationId: orgId, orgStatus } = usePermissions();
  const { toast } = useToast();
  const [domainInput, setDomainInput] = useState("");
  const [isEditingDomain, setIsEditingDomain] = useState(false);
  const isDomainInvalid = isBlank(domainInput);

  const { data: brandProfile, isLoading: isBrandProfileLoading } = useQuery<BrandProfile | null>({
    queryKey: ["/api/brand-profile"],
    queryFn: async () => {
      const res = await fetch("/api/brand-profile", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: intel, isLoading } = useQuery<MarketIntelligence | null>({
    queryKey: ["/api/organizations", orgId, "market-intelligence"],
    queryFn: async () => {
      if (!orgId) return null;
      const res = await fetch(`/api/organizations/${orgId}/market-intelligence`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load market intelligence");
      return res.json();
    },
    enabled: !!orgId,
    refetchInterval: (query) => {
      return query.state.data?.status === "running" ? 3000 : false;
    },
  });

  const savedDomain = intel?.targetDomain || (intel?.seedKeywords?.[0] && intel.seedKeywords[0].includes(".") ? intel.seedKeywords[0] : null);

  const brandProfileDomain = brandProfile?.websiteUrl ? normalizeDomainInput(brandProfile.websiteUrl) : null;

  useEffect(() => {
    if (savedDomain && !domainInput) {
      setDomainInput(savedDomain);
    } else if (!savedDomain && brandProfileDomain && !domainInput) {
      setDomainInput(brandProfileDomain);
    }
  }, [savedDomain, brandProfileDomain]);

  const analyzeMutation = useMutation({
    mutationFn: async (domain: string) => {
      if (!orgId) throw new Error("No organization");
      return apiRequest("POST", `/api/organizations/${orgId}/market-intelligence/analyze`, { domain });
    },
    onSuccess: () => {
      toast({ title: "Analysis started", description: "Discovering your competitors by keyword overlap. This takes about a minute." });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", orgId, "market-intelligence"] });
      setIsEditingDomain(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to start analysis", description: err.message, variant: "destructive" });
    },
  });

  const handleRunAnalysis = () => {
    const normalized = normalizeDomainInput(domainInput);
    if (!normalized || !normalized.includes(".")) {
      toast({ title: "Invalid domain", description: "Please enter a valid website domain (e.g., example.com)", variant: "destructive" });
      return;
    }
    setDomainInput(normalized);
    analyzeMutation.mutate(normalized);
  };

  if (orgStatus === "loading") {
    return (
      <div className="p-8 flex items-center justify-center h-full" data-testid="market-intel-loading">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (orgStatus === "no_org") {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-center text-muted-foreground">
          <Globe className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Join an organization to view market intelligence.</p>
        </div>
      </div>
    );
  }

  const isRunning = intel?.status === "running";
  const isCompleted = intel?.status === "completed";
  const isFailed = intel?.status === "failed";
  const hasData = isCompleted && intel;
  const hasDomain = !!savedDomain;
  const hasPrefilledDomain = !hasDomain && !!domainInput;

  const competitors = (intel?.discoveredCompetitors as CompetitorDomain[] | null) || [];
  const keywordInsights = (intel?.keywordInsights as KeywordInsight[] | null) || [];

  const nonNavKeywords = keywordInsights.filter(k => k.intent !== "navigational");

  const displayKeywords = [...nonNavKeywords]
    .sort((a, b) => {
      const countDiff = (b.competitorCount ?? 0) - (a.competitorCount ?? 0);
      if (countDiff !== 0) return countDiff;
      return b.searchVolume - a.searchVolume;
    })
    .slice(0, 15);

  const maxCompetitorCount = Math.max(1, ...keywordInsights.map(k => k.competitorCount ?? 0));

  const totalSharedKeywords = competitors.reduce((sum, c) => sum + (c.sharedKeywords ?? c.score ?? 0), 0);

  const mostContestedKeyword = nonNavKeywords.length > 0
    ? [...nonNavKeywords].sort((a, b) => (b.competitorCount ?? 0) - (a.competitorCount ?? 0))[0]
    : null;

  const lastRefreshed = intel?.lastRefreshedAt
    ? new Date(intel.lastRefreshedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight" data-testid="heading-market-intelligence">
            Market Intelligence
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            See which domains compete with yours, and exactly which keywords you both rank for.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {lastRefreshed && (
            <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid="text-last-refreshed">
              <Clock className="w-3 h-3" />
              {lastRefreshed}
            </span>
          )}
          {hasDomain && (
            <Button
              onClick={handleRunAnalysis}
              disabled={isRunning || analyzeMutation.isPending}
              data-testid="button-refresh-insights"
              size="sm"
            >
              {isRunning || analyzeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {isRunning ? "Analyzing..." : "Refresh Insights"}
            </Button>
          )}
        </div>
      </div>

      {!isLoading && !isBrandProfileLoading && !hasDomain && !isRunning && (
        <Card className={isFailed ? "border-destructive/30" : "border-dashed"} data-testid="card-enter-domain">
          <CardContent className="py-12 flex flex-col items-center text-center gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isFailed ? "bg-destructive/10" : "bg-primary/10"}`}>
              {isFailed ? (
                <AlertCircle className="w-6 h-6 text-destructive" />
              ) : (
                <Globe className="w-6 h-6 text-primary" />
              )}
            </div>
            <div>
              <p className="font-medium text-lg">
                {isFailed
                  ? "Analysis didn't complete"
                  : hasPrefilledDomain
                    ? "Ready to analyze your website"
                    : "Enter your website to get started"}
              </p>
              <p className="text-sm text-muted-foreground max-w-md mt-1">
                {isFailed
                  ? "Something went wrong with the previous attempt. Check that your domain is correct and try again."
                  : hasPrefilledDomain
                    ? `We'll discover the businesses competing with ${domainInput} for the same search keywords.`
                    : "We'll analyze your domain and find the businesses that compete with you for the same search keywords."}
              </p>
            </div>
            <div className="w-full max-w-sm mt-2">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="yourcompany.com"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRunAnalysis()}
                  aria-invalid={isDomainInvalid}
                  data-testid="input-domain"
                  className="flex-1"
                />
                <Button
                  onClick={handleRunAnalysis}
                  disabled={analyzeMutation.isPending || !domainInput.trim() || isDomainInvalid}
                  data-testid="button-start-analysis"
                >
                  {analyzeMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  {isFailed ? "Try Again" : hasPrefilledDomain ? "Run Analysis" : "Analyze"}
                </Button>
              </div>
              {isDomainInvalid && (
                <p className="text-sm text-destructive mt-2" data-testid="error-domain">
                  Domain cannot be empty or contain only spaces.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {hasDomain && !isEditingDomain && (
        <div className="flex items-center gap-2 text-sm" data-testid="text-analyzing-domain">
          <Target className="w-4 h-4 text-primary" />
          <span className="text-muted-foreground">Analyzing:</span>
          <span className="font-medium">{savedDomain}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setIsEditingDomain(true)}
            data-testid="button-edit-domain"
          >
            <Pencil className="w-3 h-3" />
          </Button>
        </div>
      )}

      {isEditingDomain && (
        <div data-testid="card-edit-domain">
          <div className="flex flex-wrap items-center gap-2">
            <Target className="w-4 h-4 text-primary shrink-0" />
            <Input
              placeholder="yourcompany.com"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRunAnalysis();
                if (e.key === "Escape") setIsEditingDomain(false);
              }}
              aria-invalid={isDomainInvalid}
              data-testid="input-edit-domain"
              className="flex-1 min-w-0 sm:max-w-xs"
              autoFocus
            />
            <Button
              size="sm"
              onClick={handleRunAnalysis}
              disabled={analyzeMutation.isPending || !domainInput.trim() || isDomainInvalid}
              data-testid="button-save-domain"
            >
              {analyzeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDomainInput(savedDomain || "");
                setIsEditingDomain(false);
              }}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
          </div>
          {isDomainInvalid && (
            <p className="text-sm text-destructive mt-2" data-testid="error-edit-domain">
              Domain cannot be empty or contain only spaces.
            </p>
          )}
        </div>
      )}

      {isRunning && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
          <CardContent className="py-6 flex items-center gap-4">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin shrink-0" />
            <div>
              <p className="font-medium text-blue-700 dark:text-blue-300">Analysis in progress</p>
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-0.5">
                Discovering competitors by keyword overlap with your domain. This usually takes 30-60 seconds.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isFailed && hasDomain && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-6 flex items-center gap-4">
            <AlertCircle className="w-6 h-6 text-destructive shrink-0" />
            <div>
              <p className="font-medium">Analysis failed</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Something went wrong. Make sure the DataForSEO API credentials are configured, then try refreshing.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <Card className="lg:col-span-3">
            <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
            <CardContent className="space-y-3">
              {[1, 2, 3, 4, 5].map((j) => (
                <Skeleton key={j} className="h-20 w-full" />
              ))}
            </CardContent>
          </Card>
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
              <CardContent className="space-y-3">
                {[1, 2, 3, 4, 5].map((j) => (
                  <Skeleton key={j} className="h-16 w-full" />
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {hasData && (
        <>
          <div className="space-y-2" data-testid="banner-summary-stats">
            <p className="text-sm text-muted-foreground" data-testid="text-summary-context">
              These domains compete with <strong>{savedDomain}</strong> for the same Google search terms — ranked by keyword overlap.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-muted/50 rounded-lg px-4 py-3 text-center">
                <p className="text-2xl font-bold" data-testid="text-stat-competitors">{competitors.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Competing domains</p>
              </div>
              <div className="bg-muted/50 rounded-lg px-4 py-3 text-center">
                <p className="text-2xl font-bold" data-testid="text-stat-shared-keywords">
                  {totalSharedKeywords > 0 ? formatKeywordCount(totalSharedKeywords) : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Total keyword overlaps</p>
              </div>
              <div className="bg-muted/50 rounded-lg px-4 py-3 text-center">
                <p className="text-2xl font-bold" data-testid="text-stat-keywords-tracked">
                  {nonNavKeywords.length}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Keywords tracked</p>
              </div>
              {mostContestedKeyword && (mostContestedKeyword.competitorCount ?? 0) >= 2 && (
                <div className="bg-muted/50 rounded-lg px-4 py-3 text-center">
                  <p className="text-sm font-bold capitalize truncate" data-testid="text-stat-top-keyword">
                    {decodeHtmlEntities(mostContestedKeyword.keyword)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Most competitive · {mostContestedKeyword.competitorCount} competitors
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <Card className="lg:col-span-3" data-testid="card-competitors">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base">Competing Domains</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  These sites compete with <strong>{savedDomain}</strong> for the same Google search results — ranked by how many searches you share. Click <strong>N shared</strong> on any of the top 5 to see the exact keywords both you and that domain rank for.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {competitors.length === 0 ? (
                  <div className="py-6 text-center space-y-2" data-testid="text-no-competitors">
                    <p className="text-sm font-medium">No competitors found for this domain</p>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      This domain may not have enough search visibility in our database yet. Try a more established domain, or check back later as our data updates regularly.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {competitors.map((c, i) => (
                      <CompetitorCard
                        key={c.domain}
                        competitor={c}
                        index={i}
                        targetDomain={savedDomain || ""}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="lg:col-span-2 space-y-6">
              <Card data-testid="card-keyword-insights">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    <CardTitle className="text-base">Content Opportunity Keywords</CardTitle>
                  </div>
                  <CardDescription className="text-xs">
                    Keywords that both <strong>{savedDomain}</strong> and its competitors rank for in Google — filtered of business names and branded terms. The more competitors share a keyword, the more contested (and valuable) it is.
                  </CardDescription>
                  <div className="flex items-center gap-3 pt-1">
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Easy
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Moderate
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Competitive
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  {displayKeywords.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      {competitors.length === 0
                        ? "No keyword data available — competitor data is needed first."
                        : "No shared keywords found yet — try running a fresh analysis."}
                    </p>
                  ) : (
                    <>
                      <MostContestedTable keywords={nonNavKeywords} maxCount={maxCompetitorCount} />
                      <div className="space-y-2">
                        {displayKeywords.map((insight, i) => (
                          <KeywordInsightCard
                            key={`${insight.keyword}-${i}`}
                            insight={insight}
                            index={i}
                            maxCompetitorCount={maxCompetitorCount}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  {displayKeywords.length === 15 && nonNavKeywords.length > 15 && (
                    <p className="text-xs text-muted-foreground mt-3 text-center">
                      Showing top 15 of {nonNavKeywords.length} keywords
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="bg-muted/30 border-muted" data-testid="card-how-it-works">
            <CardContent className="py-5">
              <div className="flex items-start gap-3">
                <HelpCircle className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">How this analysis works</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    We find every domain that shows up alongside yours in Google search results — these are your real competitors. For each of the top 5, we then look at the <strong>exact keywords both you and that domain rank for</strong>. These shared keywords appear when you click the <strong>N shared</strong> button on each competitor row. The <strong>Content Opportunity Keywords</strong> card collects all those matched keywords across competitors, strips out brand names and business names, and surfaces the actual topical terms worth targeting in your content.
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    When you create a new campaign, the AI uses these opportunity keywords to generate posts with angles matched to what your market is actively searching for.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
