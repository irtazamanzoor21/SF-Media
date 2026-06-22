import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Megaphone, Plus, Calendar, Lightbulb, ArrowRight, Loader2, RefreshCw, Trash2, MoreVertical, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import type { Campaign, CampaignWithPublishState, PlatformKey } from "@shared/schema";
import { PLATFORM_SETTINGS } from "@shared/schema";
import fbIcon from "@assets/fb_1771492183119.png";
import instIcon from "@assets/inst_1771492183120.png";
import linkedinIcon from "@assets/linkedin_1771492183122.png";
import xIcon from "@assets/x_1771492183122.png";

const platformIcons: Record<string, string> = {
  linkedin: linkedinIcon,
  x: xIcon,
  instagram: instIcon,
  facebook: fbIcon,
};

type StatusKey = "published" | "scheduled" | "draft";

const STATUS: Record<StatusKey, { label: string; dot: string; badge: string }> = {
  published: { label: "Published", dot: "bg-primary", badge: "border-transparent bg-primary/10 text-primary" },
  scheduled: { label: "Scheduled", dot: "bg-blue-500", badge: "border-transparent bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  draft: { label: "Draft", dot: "bg-muted-foreground/50", badge: "border-transparent bg-muted text-muted-foreground" },
};

const getStatus = (c: CampaignWithPublishState): StatusKey =>
  (c.publishedPostsCount ?? 0) > 0 ? "published" : c.status === "scheduled" ? "scheduled" : "draft";

interface BrainstormIdea {
  title: string;
  description: string;
  platforms: string[];
  tone: string;
  cta: string;
}

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const [brainstormOpen, setBrainstormOpen] = useState(false);
  const [ideas, setIdeas] = useState<BrainstormIdea[]>([]);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const [filter, setFilter] = useState<"all" | StatusKey>("all");
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canCustomize = hasPermission("CAMPAIGN", "customize");

  const { data: campaigns, isLoading } = useQuery<CampaignWithPublishState[]>({
    queryKey: ["/api/campaigns"],
  });

  const stats = useMemo(() => {
    const list = campaigns ?? [];
    let published = 0, scheduled = 0, draft = 0;
    for (const c of list) {
      const s = getStatus(c);
      if (s === "published") published++;
      else if (s === "scheduled") scheduled++;
      else draft++;
    }
    return { total: list.length, published, scheduled, draft };
  }, [campaigns]);

  const visibleCampaigns = useMemo(() => {
    const list = campaigns ?? [];
    return filter === "all" ? list : list.filter((c) => getStatus(c) === filter);
  }, [campaigns, filter]);

  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/campaigns/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: "Campaign deleted", description: "The campaign and all its posts have been removed." });
      setCampaignToDelete(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete campaign. Please try again.", variant: "destructive" });
    },
  });

  const brainstormMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/brainstorm");
      return res.json();
    },
    onSuccess: (data) => {
      setIdeas(data.ideas || []);
    },
  });

  const handleBrainstorm = () => {
    setBrainstormOpen(true);
    brainstormMutation.mutate();
  };

  const handleUseIdea = (idea: BrainstormIdea) => {
    const params = new URLSearchParams({
      description: idea.description,
      platforms: idea.platforms.join(","),
      tone: idea.tone,
      cta: idea.cta,
    });
    setBrainstormOpen(false);
    navigate(`/campaigns/new?${params.toString()}`);
  };

  const filterTabs: { key: "all" | StatusKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: stats.total },
    { key: "published", label: "Published", count: stats.published },
    { key: "scheduled", label: "Scheduled", count: stats.scheduled },
    { key: "draft", label: "Draft", count: stats.draft },
  ];

  const statCards = [
    { label: "Total", value: stats.total, dot: "bg-foreground/30" },
    { label: "Published", value: stats.published, dot: "bg-primary" },
    { label: "Scheduled", value: stats.scheduled, dot: "bg-blue-500" },
    { label: "Drafts", value: stats.draft, dot: "bg-muted-foreground/50" },
  ];

  const hasCampaigns = !!campaigns && campaigns.length > 0;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mb-1">Campaigns</h1>
          <p className="text-muted-foreground text-sm">Manage your social media campaigns</p>
        </div>
        {canCustomize && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={handleBrainstorm}
              className="gap-2 flex-1 sm:flex-initial"
              data-testid="button-brainstorm"
            >
              <Lightbulb className="w-4 h-4" />
              Brainstorm Ideas
            </Button>
            <Button onClick={() => navigate("/campaigns/new")} className="gap-2 flex-1 sm:flex-initial" data-testid="button-new-campaign">
              <Plus className="w-4 h-4" />
              New Campaign
            </Button>
          </div>
        )}
      </div>

      {/* stats strip */}
      {hasCampaigns && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {statCards.map((s) => (
            <div key={s.label} className="rounded-xl border bg-card p-4" data-testid={`stat-${s.label.toLowerCase()}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
                <span className={cn("h-2 w-2 rounded-full", s.dot)} />
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-tight">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* filter tabs */}
      {hasCampaigns && (
        <div className="mb-5 inline-flex flex-wrap gap-1 rounded-lg border bg-muted/60 p-1">
          {filterTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                filter === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              data-testid={`filter-${t.key}`}
            >
              {t.label}
              <span className="ml-1.5 text-xs opacity-60">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* loading */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* empty: no campaigns at all */}
      {!isLoading && !hasCampaigns && (
        <Card className="flex flex-col items-center justify-center py-20 px-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Megaphone className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight mb-2">No campaigns yet</h2>
          <p className="text-muted-foreground text-center max-w-md text-sm mb-4">
            {canCustomize
              ? "Create your first AI-powered campaign to generate platform-specific posts tailored to your brand voice."
              : "No campaigns have been created in your organization yet."}
          </p>
          {canCustomize && (
            <div className="flex gap-2 flex-wrap justify-center">
              <Button variant="outline" onClick={handleBrainstorm} className="gap-2" data-testid="button-brainstorm-empty">
                <Lightbulb className="w-4 h-4" />
                Brainstorm Ideas
              </Button>
              <Button onClick={() => navigate("/campaigns/new")} className="gap-2" data-testid="button-create-first">
                <Plus className="w-4 h-4" />
                Create Campaign
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* empty: filter has no matches */}
      {!isLoading && hasCampaigns && visibleCampaigns.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-16 px-6">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
            <Megaphone className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            No {filter !== "all" ? STATUS[filter].label.toLowerCase() : ""} campaigns to show.
          </p>
          <Button variant="outline" size="sm" onClick={() => setFilter("all")} data-testid="button-clear-filter">
            Clear filter
          </Button>
        </Card>
      )}

      {/* campaign grid */}
      {!isLoading && visibleCampaigns.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleCampaigns.map((campaign) => {
            const status = getStatus(campaign);
            const total = campaign.postsCount || 0;
            const published = campaign.publishedPostsCount ?? 0;
            const pct = total > 0 ? Math.min(100, Math.round((published / total) * 100)) : 0;
            return (
              <Card
                key={campaign.id}
                className="group flex h-full flex-col p-5 hover-elevate cursor-pointer"
                onClick={() => navigate(`/campaigns/${campaign.id}`)}
                data-testid={`card-campaign-${campaign.id}`}
              >
                {/* top: status + actions */}
                <div className="mb-3 flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className={cn("gap-1.5 text-xs font-medium", STATUS[status].badge)}
                    data-testid={`badge-campaign-status-${campaign.id}`}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", STATUS[status].dot)} />
                    {STATUS[status].label}
                  </Badge>
                  {canCustomize && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 -mr-1.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                          data-testid={`button-campaign-menu-${campaign.id}`}
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setCampaignToDelete(campaign)}
                          data-testid={`button-delete-campaign-${campaign.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Campaign
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* platforms */}
                {(campaign.platforms || []).length > 0 && (
                  <div className="mb-2.5 flex items-center gap-1.5">
                    {(campaign.platforms || []).map((p: string) => (
                      <img
                        key={p}
                        src={platformIcons[p]}
                        alt={PLATFORM_SETTINGS[p as PlatformKey]?.label}
                        title={PLATFORM_SETTINGS[p as PlatformKey]?.label}
                        className="w-5 h-5 rounded object-contain"
                      />
                    ))}
                  </div>
                )}

                {/* title + description */}
                <h3 className="font-semibold tracking-tight truncate" data-testid={`text-campaign-name-${campaign.id}`}>
                  {campaign.companyName}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2" data-testid={`text-campaign-desc-${campaign.id}`}>
                  {campaign.description}
                </p>

                {/* footer */}
                <div className="mt-auto pt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground/80">
                      {published > 0 ? `${published}/${total} published` : `${total} post${total !== 1 ? "s" : ""}`}
                    </span>
                    <Badge variant="secondary" className="text-[11px] capitalize">{campaign.tone}</Badge>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" />
                    {campaign.startDate && campaign.endDate ? (
                      <span>
                        {new Date(campaign.startDate).toLocaleDateString()} – {new Date(campaign.endDate).toLocaleDateString()}
                      </span>
                    ) : (
                      <span>Created {new Date(campaign.createdAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={brainstormOpen} onOpenChange={setBrainstormOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-primary" />
              Campaign Ideas
            </DialogTitle>
            <DialogDescription>
              AI-generated campaign ideas based on your brand voice. Click the arrow to start creating.
            </DialogDescription>
          </DialogHeader>

          {brainstormMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-muted" />
                <div
                  className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"
                  style={{ animationDuration: "1.2s" }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Lightbulb className="w-6 h-6 text-primary" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Brainstorming ideas for your brand...</p>
            </div>
          )}

          {brainstormMutation.isError && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <p className="text-sm text-destructive">Something went wrong generating ideas.</p>
              <Button variant="outline" onClick={() => brainstormMutation.mutate()} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>
            </div>
          )}

          {!brainstormMutation.isPending && !brainstormMutation.isError && ideas.length > 0 && (
            <div className="space-y-3">
              {ideas.map((idea, index) => (
                <Card
                  key={index}
                  className="p-4 hover-elevate cursor-pointer group"
                  onClick={() => handleUseIdea(idea)}
                  data-testid={`card-idea-${index}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm mb-1" data-testid={`text-idea-title-${index}`}>
                        {idea.title}
                      </h3>
                      <p className="text-muted-foreground text-xs mb-2" data-testid={`text-idea-desc-${index}`}>
                        {idea.description}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {idea.platforms.map((p) => (
                          <Badge key={p} variant="secondary" className="text-xs">
                            {PLATFORM_SETTINGS[p as PlatformKey]?.label || p}
                          </Badge>
                        ))}
                        <Badge variant="outline" className="text-xs capitalize">
                          {idea.tone}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="flex-shrink-0 mt-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUseIdea(idea);
                      }}
                      data-testid={`button-use-idea-${index}`}
                    >
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              ))}

              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  onClick={() => brainstormMutation.mutate()}
                  disabled={brainstormMutation.isPending}
                  className="gap-2"
                  data-testid="button-regenerate-ideas"
                >
                  {brainstormMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Generate More Ideas
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!campaignToDelete} onOpenChange={(open) => !open && setCampaignToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Delete Campaign
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-semibold text-foreground">"{campaignToDelete?.companyName}"</span>? This will permanently delete the campaign and all {campaignToDelete?.postsCount} post{campaignToDelete?.postsCount !== 1 ? "s" : ""} associated with it. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              disabled={deleteCampaignMutation.isPending}
              onClick={() => setCampaignToDelete(null)}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteCampaignMutation.isPending}
              onClick={() => campaignToDelete && deleteCampaignMutation.mutate(campaignToDelete.id)}
              data-testid="button-confirm-delete"
            >
              {deleteCampaignMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                "Delete Campaign"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
