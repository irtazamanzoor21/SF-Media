import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isBlank } from "@/lib/utils";
import { emitQuotaExceeded } from "@/lib/quota-events";
import { useQuota } from "@/hooks/use-quota";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor, RichTextContent } from "@/components/rich-text-editor";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowRight,
  Loader2,
  Sparkles,
  Pencil,
  Check,
  X,
  ImageIcon,
  Calendar as CalendarIcon,
  Briefcase,
  Coffee,
  Zap,
  Heart,
  Smile,
  ChevronDown,
  Plus,
} from "lucide-react";
import type { BrandProfile, Campaign, CampaignPost, PlatformKey, CampaignChatResponse } from "@shared/schema";
import { PLATFORMS, TONES, DEFAULT_CTAS, buildCtaOptions, PLATFORM_SETTINGS } from "@shared/schema";
import { CampaignChatInput, type ChatMessage } from "@/components/campaign-chat-input";
import { CampaignReviewCard } from "@/components/campaign-review-card";
import { Hash, Type, ImageIcon as ImgDimIcon } from "lucide-react";
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

const toneConfig: Record<string, { label: string; icon: typeof Briefcase }> = {
  professional: { label: "Professional", icon: Briefcase },
  casual: { label: "Casual", icon: Coffee },
  energetic: { label: "Energetic", icon: Zap },
  friendly: { label: "Friendly", icon: Heart },
  witty: { label: "Witty", icon: Smile },
};


export default function CreateCampaignPage() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const { canSchedule, aiPostsRemaining, isAtAiLimit, tier, aiQuota } = useQuota();

  type Phase = "chat" | "review" | "manual";
  const [phase, setPhase] = useState<Phase>("chat");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [defaultedFields, setDefaultedFields] = useState<string[]>([]);

  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [showGuidelines, setShowGuidelines] = useState(false);
  const [tone, setTone] = useState("");
  const [postsCount, setPostsCount] = useState(3);
  const [callToAction, setCallToAction] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [generatedResult, setGeneratedResult] = useState<{ campaign: Campaign; posts: CampaignPost[] } | null>(null);
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [ideaPrefilled, setIdeaPrefilled] = useState(false);
  const [addCtaOpen, setAddCtaOpen] = useState(false);
  const [newCtaValue, setNewCtaValue] = useState("");
  const [addingCta, setAddingCta] = useState(false);
  const [sessionCustomCtas, setSessionCustomCtas] = useState<string[]>([]);
  const newCtaInputRef = useRef<HTMLInputElement | null>(null);

  const { data: brandProfile } = useQuery<BrandProfile>({
    queryKey: ["/api/brand-profile"],
  });

  const ctaOptions = useMemo(
    () => buildCtaOptions([...(brandProfile?.customCtas ?? []), ...sessionCustomCtas]),
    [brandProfile?.customCtas, sessionCustomCtas],
  );

  useEffect(() => {
    if (brandProfile && !prefilled) {
      setCompanyName(brandProfile.companyName || "");
      setPrefilled(true);
    }
  }, [brandProfile, prefilled]);

  useEffect(() => {
    if (ideaPrefilled || !searchString) return;
    const params = new URLSearchParams(searchString);
    const ideaDesc = params.get("description");
    const ideaPlatforms = params.get("platforms");
    const ideaTone = params.get("tone");
    const ideaCta = params.get("cta");
    if (ideaDesc) setDescription(ideaDesc);
    if (ideaPlatforms) setSelectedPlatforms(ideaPlatforms.split(",").filter(Boolean));
    if (ideaTone && TONES.includes(ideaTone as any)) setTone(ideaTone);
    if (ideaCta) setCallToAction(ideaCta);
    if (ideaDesc || ideaPlatforms || ideaTone || ideaCta) {
      setIdeaPrefilled(true);
      // Skip chat — the user came from brainstorm with explicit fields already chosen.
      setPhase("manual");
    }
  }, [searchString, ideaPrefilled]);

  const [isCreating, setIsCreating] = useState(false);
  const [creationStatus, setCreationStatus] = useState("");

  const handleAddCustomCta = useCallback(async () => {
    const value = newCtaValue.trim();
    if (!value) return;
    if (value.length > 80) {
      toast({ title: "CTA too long", description: "Keep it under 80 characters.", variant: "destructive" });
      return;
    }
    const existing = brandProfile?.customCtas ?? [];
    const lower = value.toLowerCase();
    const isDuplicate =
      DEFAULT_CTAS.some((c) => c.toLowerCase() === lower) ||
      existing.some((c) => c.toLowerCase() === lower);
    if (isDuplicate) {
      setCallToAction(value);
      setAddCtaOpen(false);
      setNewCtaValue("");
      return;
    }
    setAddingCta(true);
    const nextCustomCtas = [...existing, value];
    setSessionCustomCtas((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setCallToAction(value);
    setAddCtaOpen(false);
    setNewCtaValue("");
    try {
      const res = await apiRequest("PATCH", "/api/brand-profile", { customCtas: nextCustomCtas });
      const updated = (await res.json()) as BrandProfile;
      const persistedCustoms = updated?.customCtas ?? [];
      const wasPersisted = persistedCustoms.some((c) => c.toLowerCase() === lower);
      queryClient.setQueryData<BrandProfile>(["/api/brand-profile"], updated);
      if (wasPersisted) {
        toast({ title: "Custom CTA added" });
      } else {
        toast({
          title: "CTA available for this session",
          description: "We couldn't save it to your brand profile. You can still use it for this campaign, but it won't appear next time.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "CTA available for this session",
        description: error?.message ?? "Couldn't reach the server. The CTA will not persist after reload.",
        variant: "destructive",
      });
    } finally {
      setAddingCta(false);
    }
  }, [newCtaValue, brandProfile?.customCtas, toast]);

  const updatePostMutation = useMutation({
    mutationFn: async ({ campaignId, postId, content }: { campaignId: number; postId: number; content: string }) => {
      const res = await apiRequest("PATCH", `/api/campaigns/${campaignId}/posts/${postId}`, { content });
      return res.json();
    },
    onSuccess: (updated) => {
      if (generatedResult) {
        setGeneratedResult({
          ...generatedResult,
          posts: generatedResult.posts.map((p) => (p.id === updated.id ? updated : p)),
        });
      }
      setEditingPostId(null);
      setEditContent("");
      toast({ title: "Post updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleChatReady = useCallback((data: CampaignChatResponse) => {
    setDescription(data.description || "Campaign");
    setSelectedPlatforms(data.platforms && data.platforms.length > 0 ? data.platforms : ["linkedin"]);
    setTone(data.tone || "professional");
    setPostsCount(data.postsCount || 3);
    setCallToAction(data.callToAction || "Learn More");
    setStartDate(data.startDate || "");
    setEndDate(data.endDate || "");
    setDefaultedFields(data.defaultedFields || []);
    setPhase("review");
  }, []);

  const handleGenerate = useCallback(async () => {
    setIsCreating(true);
    setCreationStatus("Creating campaign...");
    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyName,
          description,
          platforms: selectedPlatforms,
          tone,
          postsCount,
          callToAction,
          scheduledAt: scheduledAt || null,
          startDate: startDate || null,
          endDate: endDate || null,
        }),
      });

      if (!response.ok && response.headers.get("content-type")?.includes("application/json")) {
        const err = await response.json();
        if (err.quotaExceeded) {
          emitQuotaExceeded({
            action: err.action,
            limit: err.limit,
            current: err.current,
            label: err.label,
            tier: err.tier,
          });
          throw new Error(err.message || "Campaign limit reached. Upgrade your plan to create more campaigns.");
        }
        throw new Error(err.message || "Failed to create campaign");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));

              if (event.type === "status") {
                setCreationStatus(event.message);
              }

              if (event.type === "posts_created") {
                setGeneratedResult({ campaign: event.campaign, posts: event.posts });
              }

              if (event.type === "complete") {
                queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
                toast({ title: "Campaign created", description: "Posts generated successfully." });
              }

              if (event.type === "error") {
                throw new Error(event.message);
              }
            } catch (parseErr: any) {
              if (parseErr.message && !parseErr.message.includes("JSON")) throw parseErr;
            }
          }
        }
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsCreating(false);
      setCreationStatus("");
    }
  }, [companyName, description, selectedPlatforms, tone, postsCount, callToAction, scheduledAt, toast]);

  const isCompanyNameInvalid = isBlank(companyName);
  const isDescriptionInvalid = isBlank(description);
  const canProceedStep1 = companyName.trim() && description.trim() && selectedPlatforms.length > 0;
  const canProceedStep2 = tone && callToAction;

  if (generatedResult) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold mb-1" data-testid="text-campaign-title">
              {generatedResult.campaign.companyName}
            </h1>
            <p className="text-muted-foreground text-sm">{generatedResult.campaign.description}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(generatedResult.campaign.platforms || []).map((p: string) => (
              <Badge key={p} variant="secondary" data-testid={`badge-platform-${p}`}>
                {PLATFORM_SETTINGS[p as PlatformKey]?.label}
              </Badge>
            ))}
            <Badge
              variant={generatedResult.campaign.status === "scheduled" ? "default" : "outline"}
              data-testid="badge-status"
            >
              {generatedResult.campaign.status === "scheduled" ? "Scheduled" : "Draft"}
            </Badge>
          </div>
        </div>

        <div className="space-y-4">
          {generatedResult.posts.map((post, index) => (
            <Card key={post.id} className="p-5" data-testid={`card-post-${post.id}`}>
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Post {index + 1}</span>
                  <Badge variant="outline" className="text-xs">
                    {PLATFORM_SETTINGS[post.platform as PlatformKey]?.label}
                  </Badge>
                </div>
                {editingPostId === post.id ? (
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        updatePostMutation.mutate({
                          campaignId: generatedResult.campaign.id,
                          postId: post.id,
                          content: editContent,
                        });
                      }}
                      disabled={updatePostMutation.isPending}
                      data-testid={`button-save-post-${post.id}`}
                    >
                      {updatePostMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditingPostId(null);
                        setEditContent("");
                      }}
                      data-testid={`button-cancel-post-${post.id}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEditingPostId(post.id);
                      setEditContent(post.content);
                    }}
                    data-testid={`button-edit-post-${post.id}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {editingPostId === post.id ? (
                <div className="mb-3">
                  <RichTextEditor
                    content={editContent}
                    onChange={setEditContent}
                    data-testid={`editor-edit-post-${post.id}`}
                  />
                </div>
              ) : (
                <div className="text-sm whitespace-pre-wrap mb-3" data-testid={`text-post-content-${post.id}`}>
                  <RichTextContent html={post.content} />
                </div>
              )}

              {post.imageUrl && (
                <div className="mb-3 rounded-md overflow-hidden">
                  <img
                    src={post.imageUrl}
                    alt={`Generated image for post ${index + 1}`}
                    className="w-full max-h-80 object-cover"
                    data-testid={`img-post-${post.id}`}
                  />
                </div>
              )}

              {post.imagePrompt && !post.imageUrl && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50">
                  <ImageIcon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Image Prompt</p>
                    <p className="text-xs text-muted-foreground" data-testid={`text-image-prompt-${post.id}`}>
                      {post.imagePrompt}
                    </p>
                  </div>
                </div>
              )}

            </Card>
          ))}
        </div>

        <div className="flex gap-3 mt-6 flex-wrap">
          <Button variant="outline" onClick={() => navigate("/")} data-testid="button-back-campaigns">
            Back to Campaigns
          </Button>
          <Button
            onClick={() => {
              setGeneratedResult(null);
              setStep(1);
              setPrefilled(false);
            }}
            data-testid="button-create-another"
          >
            Create Another Campaign
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "chat") {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold mb-1">Create a campaign</h1>
          <p className="text-muted-foreground text-sm">Chat with your campaign assistant.</p>
        </div>
        <CampaignChatInput
          messages={chatMessages}
          setMessages={setChatMessages}
          onReady={handleChatReady}
          onSwitchToManual={() => setPhase("manual")}
        />
      </div>
    );
  }

  if (phase === "review") {
    const showSchedule = Boolean(startDate || endDate);
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold mb-1">Review your campaign</h1>
          <p className="text-muted-foreground text-sm">{companyName || "Your campaign"}</p>
        </div>
        <CampaignReviewCard
          description={description}
          setDescription={setDescription}
          selectedPlatforms={selectedPlatforms}
          setSelectedPlatforms={setSelectedPlatforms}
          tone={tone}
          setTone={setTone}
          postsCount={postsCount}
          setPostsCount={setPostsCount}
          callToAction={callToAction}
          setCallToAction={setCallToAction}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          defaultedFields={defaultedFields}
          showSchedule={showSchedule}
          tier={tier}
          aiPostsRemaining={aiPostsRemaining}
          aiQuotaLimit={aiQuota?.limit ?? null}
          isAtAiLimit={isAtAiLimit}
          onSubmit={handleGenerate}
          onEditPrompt={() => setPhase("chat")}
          onSwitchToManual={() => setPhase("manual")}
          isSubmitting={isCreating}
        />
        {isCreating && creationStatus && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-4" data-testid="rv-creation-status">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{creationStatus}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Create Campaign</h1>
          <p className="text-muted-foreground text-sm">Step {step} of 2</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPhase("chat")}
          className="gap-1.5 text-muted-foreground"
          data-testid="button-use-chat"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Use chat instead
        </Button>
      </div>

      <div className="flex gap-2 mb-6">
        <div className={`h-1 flex-1 rounded-full ${step >= 1 ? "bg-primary" : "bg-muted"}`} />
        <div className={`h-1 flex-1 rounded-full ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
      </div>

      {step === 1 && (
        <div className="space-y-5">
          <Card className="p-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Campaign Name</Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Your campaign name"
                aria-invalid={isCompanyNameInvalid}
                data-testid="input-company-name"
              />
              {isCompanyNameInvalid && (
                <p className="text-sm text-destructive" data-testid="error-campaign-name">
                  Campaign name cannot be empty or contain only spaces.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Campaign Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your campaign goals and key messages..."
                className="min-h-[100px]"
                aria-invalid={isDescriptionInvalid}
                data-testid="input-description"
              />
              {isDescriptionInvalid && (
                <p className="text-sm text-destructive" data-testid="error-campaign-description">
                  Campaign description cannot be empty or contain only spaces.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Target Platforms</Label>
              <p className="text-xs text-muted-foreground">Select one or more platforms. Posts will be generated for each.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {PLATFORMS.map((p) => {
                  const isSelected = selectedPlatforms.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setSelectedPlatforms((prev) =>
                          isSelected ? prev.filter((x) => x !== p) : [...prev, p]
                        );
                      }}
                      className={`relative flex flex-col items-center gap-2 p-4 rounded-md border-2 transition-colors cursor-pointer ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover-elevate"
                      }`}
                      data-testid={`button-platform-${p}`}
                    >
                      <img
                        src={platformIcons[p]}
                        alt={PLATFORM_SETTINGS[p as PlatformKey]?.label}
                        className="w-10 h-10 rounded-md object-contain"
                      />
                      <span className="text-sm font-medium">
                        {PLATFORM_SETTINGS[p as PlatformKey]?.label}
                      </span>
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5">
                          <Check className="w-4 h-4 text-primary" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedPlatforms.length > 0 && (
              <div className="pt-2 border-t" data-testid="platform-guidelines">
                <button
                  type="button"
                  onClick={() => setShowGuidelines(!showGuidelines)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-toggle-guidelines"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${showGuidelines ? "rotate-180" : ""}`} />
                  See Platform Guidelines
                </button>
                {showGuidelines && (
                  <div className="space-y-3 mt-3">
                    {selectedPlatforms.map((p) => {
                      const settings = PLATFORM_SETTINGS[p as PlatformKey];
                      return (
                        <div key={p} className="space-y-2">
                          <p className="text-sm font-medium">{settings?.label} Guidelines</p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50">
                              <Type className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Character Limit</p>
                                <p className="text-sm">{settings?.characterLimit.toLocaleString()} chars</p>
                                <p className="text-xs text-muted-foreground">{settings?.recommendedLength}</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50">
                              <Hash className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Hashtags</p>
                                <p className="text-sm">Max {settings?.hashtagLimit}</p>
                                <p className="text-xs text-muted-foreground">{settings?.hashtagTip}</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50">
                              <ImageIcon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Image Size</p>
                                <p className="text-sm">{settings?.imageLabel}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Button
            className="w-full gap-2"
            disabled={!canProceedStep1 || isCompanyNameInvalid || isDescriptionInvalid}
            onClick={() => setStep(2)}
            data-testid="button-next-step"
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <Card className="p-5 space-y-5">
            <div className="space-y-2">
              <Label>Communication Tone</Label>
              <div className="grid grid-cols-3 gap-2">
                {TONES.map((t) => {
                  const config = toneConfig[t];
                  const Icon = config?.icon;
                  return (
                    <Button
                      key={t}
                      variant={tone === t ? "default" : "outline"}
                      onClick={() => setTone(t)}
                      className="gap-2"
                      data-testid={`button-tone-${t}`}
                    >
                      {Icon && <Icon className="w-4 h-4" />}
                      {config?.label ?? t}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label>Posts per Platform</Label>
                <Badge variant="secondary">{postsCount}</Badge>
              </div>
              <Slider
                value={[postsCount]}
                onValueChange={(v) => setPostsCount(v[0])}
                min={1}
                max={5}
                step={1}
                data-testid="slider-posts-count"
              />
              {selectedPlatforms.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  Total: {postsCount * selectedPlatforms.length} posts ({postsCount} per platform × {selectedPlatforms.length} platforms)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Call To Action</Label>
              <Select
                value={callToAction}
                onValueChange={(value) => {
                  if (value === "__add_custom__") {
                    setAddCtaOpen(true);
                    return;
                  }
                  setCallToAction(value);
                }}
              >
                <SelectTrigger data-testid="select-cta">
                  <SelectValue placeholder="Select a CTA" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Defaults</SelectLabel>
                    {ctaOptions.defaults.map((cta) => (
                      <SelectItem key={cta} value={cta} data-testid={`option-cta-${cta}`}>
                        {cta}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  {ctaOptions.customs.length > 0 && (
                    <>
                      <SelectSeparator />
                      <SelectGroup>
                        <SelectLabel>Custom</SelectLabel>
                        {ctaOptions.customs.map((cta) => (
                          <SelectItem key={cta} value={cta} data-testid={`option-cta-${cta}`}>
                            {cta}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </>
                  )}
                  <SelectSeparator />
                  <SelectItem
                    value="__add_custom__"
                    data-testid="option-cta-add-custom"
                    className="text-primary focus:text-primary"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Add custom CTA
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Dialog
              open={addCtaOpen}
              onOpenChange={(open) => {
                setAddCtaOpen(open);
                if (!open) setNewCtaValue("");
              }}
            >
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add custom CTA</DialogTitle>
                  <DialogDescription>
                    Add a call-to-action that fits your brand. It will be saved for future campaigns.
                  </DialogDescription>
                </DialogHeader>
                <Input
                  ref={newCtaInputRef}
                  autoFocus
                  value={newCtaValue}
                  onChange={(e) => setNewCtaValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustomCta();
                    }
                  }}
                  placeholder="e.g. Book a Demo"
                  maxLength={80}
                  data-testid="input-custom-cta"
                />
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setAddCtaOpen(false)}
                    disabled={addingCta}
                    data-testid="button-custom-cta-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddCustomCta}
                    disabled={addingCta || !newCtaValue.trim()}
                    data-testid="button-custom-cta-save"
                  >
                    {addingCta ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {tier === "trial" && isAtAiLimit && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-3 py-2.5 text-sm text-red-800 dark:text-red-300" data-testid="banner-ai-limit-reached">
                <span className="shrink-0 mt-0.5">⚠️</span>
                <span>
                  <strong>AI post limit reached.</strong> You've used all 5 trial AI posts.{" "}
                  <a href="/subscribe" className="underline font-medium">Upgrade to Professional to continue.</a>
                </span>
              </div>
            )}
            {tier === "trial" && !isAtAiLimit && aiPostsRemaining != null && selectedPlatforms.length * postsCount > aiPostsRemaining && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-3 py-2.5 text-sm text-red-800 dark:text-red-300" data-testid="banner-ai-over-quota">
                <span className="shrink-0 mt-0.5">⚠️</span>
                <span>
                  <strong>Too many posts for your remaining quota.</strong> This campaign would create {selectedPlatforms.length * postsCount} posts, but you only have{" "}
                  <strong>{aiPostsRemaining} AI post{aiPostsRemaining !== 1 ? "s" : ""} remaining</strong>. Reduce the number of posts or platforms, or{" "}
                  <a href="/subscribe" className="underline font-medium">upgrade your plan</a>.
                </span>
              </div>
            )}
            {tier === "trial" && !isAtAiLimit && aiPostsRemaining != null && aiPostsRemaining < 5 && selectedPlatforms.length * postsCount <= aiPostsRemaining && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300" data-testid="banner-ai-budget-low">
                <span className="shrink-0 mt-0.5">ℹ️</span>
                <span>
                  You have <strong>{aiPostsRemaining} of 5 trial AI posts remaining</strong>. Each generated post with an image uses 1.{" "}
                  <a href="/subscribe" className="underline font-medium">Upgrade for unlimited access.</a>
                </span>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                <Label className={!canSchedule ? "text-muted-foreground" : ""}>
                  Schedule (optional)
                  {!canSchedule && <span className="ml-2 text-xs font-normal text-muted-foreground">(not available on Trial)</span>}
                </Label>
              </div>
              {canSchedule ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="startDate" className="text-xs text-muted-foreground">Start Date</Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        data-testid="input-start-date"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="endDate" className="text-xs text-muted-foreground">End Date</Label>
                      <Input
                        id="endDate"
                        type="date"
                        value={endDate}
                        min={startDate || undefined}
                        onChange={(e) => setEndDate(e.target.value)}
                        data-testid="input-end-date"
                      />
                    </div>
                  </div>
                  {(startDate || endDate) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setStartDate(""); setEndDate(""); }}
                      className="text-xs"
                      data-testid="button-clear-schedule"
                    >
                      Clear dates
                    </Button>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground" data-testid="scheduling-locked-notice">
                  <span>🔒</span>
                  <span>Scheduling is locked on the Trial plan. <a href="/subscribe" className="underline">Upgrade to Professional</a> to unlock date-based scheduling.</span>
                </div>
              )}
            </div>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1" data-testid="button-back-step">
              Back
            </Button>
            <Button
              className="flex-1 gap-2"
              disabled={!canProceedStep2 || isCreating || isAtAiLimit || (tier === "trial" && aiPostsRemaining != null && selectedPlatforms.length * postsCount > aiPostsRemaining)}
              onClick={handleGenerate}
              data-testid="button-generate-campaign"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {creationStatus || "Generating..."}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Campaign
                  {tier === "trial" && aiPostsRemaining != null && !isAtAiLimit && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {aiPostsRemaining} of {aiQuota?.limit} remaining
                    </Badge>
                  )}
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
