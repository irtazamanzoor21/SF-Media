import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, ArrowLeft, Wand2, Check } from "lucide-react";
import { PLATFORMS, PLATFORM_SETTINGS, TONES, type PlatformKey } from "@shared/schema";
import { isBlank } from "@/lib/utils";
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

interface Props {
  description: string;
  setDescription: (s: string) => void;
  selectedPlatforms: string[];
  setSelectedPlatforms: (s: string[]) => void;
  tone: string;
  setTone: (s: string) => void;
  postsCount: number;
  setPostsCount: (n: number) => void;
  callToAction: string;
  setCallToAction: (s: string) => void;
  startDate: string;
  setStartDate: (s: string) => void;
  endDate: string;
  setEndDate: (s: string) => void;
  defaultedFields: string[];
  showSchedule: boolean;
  tier: string;
  aiPostsRemaining: number | null;
  aiQuotaLimit: number | null;
  isAtAiLimit: boolean;
  onSubmit: () => void;
  onEditPrompt: () => void;
  onSwitchToManual: () => void;
  isSubmitting: boolean;
}

function AutoFilledBadge({ when }: { when: boolean }) {
  if (!when) return null;
  return (
    <Badge variant="secondary" className="ml-2 text-[10px] py-0 px-1.5 font-normal text-muted-foreground" data-testid="auto-filled-badge">
      Auto-filled
    </Badge>
  );
}

export function CampaignReviewCard(props: Props) {
  const {
    description, setDescription,
    selectedPlatforms, setSelectedPlatforms,
    tone, setTone,
    postsCount, setPostsCount,
    callToAction, setCallToAction,
    startDate, setStartDate,
    endDate, setEndDate,
    defaultedFields,
    showSchedule,
    tier,
    aiPostsRemaining,
    aiQuotaLimit,
    isAtAiLimit,
    onSubmit,
    onEditPrompt,
    onSwitchToManual,
    isSubmitting,
  } = props;

  const wasDefaulted = (field: string) => defaultedFields.includes(field);

  // Quota: a campaign generates postsCount × platforms AI posts. Surface the
  // problem here on the review card instead of letting the user hit a 403 at
  // generate-time. aiPostsRemaining === null means an unlimited tier (founder).
  const requiredPosts = postsCount * selectedPlatforms.length;
  const overQuota = aiPostsRemaining != null && requiredPosts > aiPostsRemaining;
  const quotaBlocks = isAtAiLimit || overQuota;
  const lowBudget = aiPostsRemaining != null && !quotaBlocks && aiPostsRemaining <= 5;

  const isDescriptionInvalid = isBlank(description);
  const isCtaInvalid = isBlank(callToAction);
  const canSubmit = description.trim().length > 0 && selectedPlatforms.length > 0 && tone && callToAction.trim().length > 0 && !quotaBlocks;

  const togglePlatform = (p: string) => {
    setSelectedPlatforms(
      selectedPlatforms.includes(p)
        ? selectedPlatforms.filter((x) => x !== p)
        : [...selectedPlatforms, p],
    );
  };

  return (
    <Card className="p-6 space-y-6" data-testid="campaign-review-card">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-primary" />
          Here's what I understood — looks right?
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tweak anything before generating. Fields marked <span className="italic">Auto-filled</span> were inferred — give them a second look.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rv-description" className="text-sm font-medium flex items-center">
          What's it about
          <AutoFilledBadge when={wasDefaulted("description")} />
        </Label>
        <Textarea
          id="rv-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-[80px]"
          aria-invalid={isDescriptionInvalid}
          data-testid="rv-description"
        />
        {isDescriptionInvalid && (
          <p className="text-sm text-destructive" data-testid="error-rv-description">
            This field cannot be empty or contain only spaces.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium flex items-center">
          Platforms
          <AutoFilledBadge when={wasDefaulted("platforms")} />
        </Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PLATFORMS.map((p) => {
            const isSelected = selectedPlatforms.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePlatform(p)}
                className={`relative flex items-center gap-2 p-2.5 rounded-md border-2 transition-colors cursor-pointer ${
                  isSelected ? "border-primary bg-primary/5" : "border-border hover-elevate"
                }`}
                data-testid={`rv-platform-${p}`}
              >
                <img
                  src={platformIcons[p]}
                  alt={PLATFORM_SETTINGS[p as PlatformKey]?.label}
                  className="w-5 h-5 rounded object-contain flex-shrink-0"
                />
                <span className="text-sm leading-tight text-left">{PLATFORM_SETTINGS[p as PlatformKey]?.label}</span>
                {isSelected && (
                  <span
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-sm ring-2 ring-background"
                    data-testid={`rv-platform-${p}-check`}
                  >
                    <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <Label className="text-sm font-medium flex items-center">
            Tone
            <AutoFilledBadge when={wasDefaulted("tone")} />
          </Label>
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors capitalize ${
                  tone === t ? "border-primary bg-primary/10 text-primary" : "border-border hover-elevate"
                }`}
                data-testid={`rv-tone-${t}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium flex items-center">
            Posts per platform: <span className="ml-1 font-semibold text-foreground">{postsCount}</span>
            <AutoFilledBadge when={wasDefaulted("postsCount")} />
          </Label>
          <Slider
            value={[postsCount]}
            onValueChange={(v) => setPostsCount(v[0])}
            min={1}
            max={5}
            step={1}
            data-testid="rv-posts-count"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rv-cta" className="text-sm font-medium flex items-center">
          Call to action
          <AutoFilledBadge when={wasDefaulted("callToAction")} />
        </Label>
        <Input
          id="rv-cta"
          value={callToAction}
          onChange={(e) => setCallToAction(e.target.value)}
          maxLength={80}
          aria-invalid={isCtaInvalid}
          data-testid="rv-cta"
        />
        {isCtaInvalid && (
          <p className="text-sm text-destructive" data-testid="error-rv-cta">
            Call to action cannot be empty or contain only spaces.
          </p>
        )}
      </div>

      {showSchedule && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="rv-start" className="text-sm font-medium flex items-center">
              Start date
              <AutoFilledBadge when={wasDefaulted("startDate")} />
            </Label>
            <Input
              id="rv-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              data-testid="rv-start-date"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rv-end" className="text-sm font-medium flex items-center">
              End date
              <AutoFilledBadge when={wasDefaulted("endDate")} />
            </Label>
            <Input
              id="rv-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              data-testid="rv-end-date"
            />
          </div>
        </div>
      )}

      {quotaBlocks && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-3 py-2.5 text-sm text-red-800 dark:text-red-300" data-testid="rv-banner-quota-block">
          <span className="shrink-0 mt-0.5">⚠️</span>
          <span>
            {isAtAiLimit ? (
              <><strong>You've used all your AI posts on the {tier} plan.</strong>{" "}</>
            ) : (
              <><strong>Not enough AI posts for this campaign.</strong> It would generate {requiredPosts} post{requiredPosts !== 1 ? "s" : ""} ({postsCount} × {selectedPlatforms.length} platform{selectedPlatforms.length !== 1 ? "s" : ""}), but you have <strong>{aiPostsRemaining} left</strong>.{" "}</>
            )}
            Reduce the number of posts or platforms, or{" "}
            <a href="/subscribe" className="underline font-medium">upgrade your plan</a>.
          </span>
        </div>
      )}
      {lowBudget && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300" data-testid="rv-banner-quota-low">
          <span className="shrink-0 mt-0.5">ℹ️</span>
          <span>
            You have <strong>{aiPostsRemaining}{aiQuotaLimit != null ? ` of ${aiQuotaLimit}` : ""} AI post{aiPostsRemaining !== 1 ? "s" : ""} remaining</strong>. This campaign will use {requiredPosts}.{" "}
            <a href="/subscribe" className="underline font-medium">Upgrade for more.</a>
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onEditPrompt} className="gap-1.5" data-testid="button-rv-edit-prompt">
            <ArrowLeft className="w-3.5 h-3.5" />
            Edit prompt
          </Button>
          <button
            type="button"
            onClick={onSwitchToManual}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            data-testid="button-rv-switch-to-manual"
          >
            Switch to form
          </button>
        </div>
        <Button onClick={onSubmit} disabled={!canSubmit || isSubmitting} className="gap-2" data-testid="button-rv-generate">
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          {isSubmitting ? "Generating…" : "Generate campaign"}
        </Button>
      </div>
    </Card>
  );
}
