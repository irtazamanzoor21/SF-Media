import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Check, ArrowLeft, Info } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isBlank } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { RichTextContent } from "@/components/rich-text-editor";
import type { CampaignPost, PlatformKey } from "@shared/schema";
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

type Phase = "input" | "processing" | "review";
type Target = "content" | "image" | "both";

type Preview = {
  newContent?: string;
  newImageBase64?: string;
  newImagePrompt?: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string | number;
  post: CampaignPost;
}

// Truthful step messages that map to what the server is actually doing.
// Cycled in the processing phase so the wait feels purposeful, not stuck.
const MESSAGES_BY_TARGET: Record<Target, string[]> = {
  content: [
    "Reading your campaign brief…",
    "Considering your feedback…",
    "Checking platform rules…",
    "Drafting the new caption…",
    "Polishing the result…",
  ],
  image: [
    "Fetching the current image…",
    "Applying your feedback to the composition…",
    "Generating the new image…",
    "Almost there…",
  ],
  both: [
    "Reading your campaign brief…",
    "Considering your feedback…",
    "Drafting the new caption…",
    "Generating the new image…",
  ],
};

function useRotatingMessage(messages: string[], intervalMs = 2000): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (messages.length <= 1) return;
    const id = setInterval(() => setI((x) => (x + 1) % messages.length), intervalMs);
    return () => clearInterval(id);
  }, [messages, intervalMs]);
  return messages[i] ?? messages[0] ?? "";
}

export function RefinePostDialog({ open, onOpenChange, campaignId, post }: Props) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("input");
  const [feedback, setFeedback] = useState("");
  const [target, setTarget] = useState<Target>("content");
  const [preview, setPreview] = useState<Preview | null>(null);

  const hasImage = !!post.imageUrl;

  // Reset all internal state when the dialog closes, or when it's reopened
  // for a different post.
  useEffect(() => {
    if (!open) {
      setPhase("input");
      setFeedback("");
      setTarget("content");
      setPreview(null);
    }
  }, [open]);

  useEffect(() => {
    setPhase("input");
    setFeedback("");
    setTarget(hasImage ? "content" : "content");
    setPreview(null);
  }, [post.id, hasImage]);

  const refineMutation = useMutation({
    mutationFn: async (vars: { feedback: string; target: Target }) => {
      const res = await apiRequest(
        "POST",
        `/api/campaigns/${campaignId}/posts/${post.id}/refine`,
        vars,
      );
      return res.json() as Promise<Preview>;
    },
    onMutate: () => {
      setPhase("processing");
    },
    onSuccess: (data) => {
      setPreview(data);
      setPhase("review");
    },
    onError: (error: Error) => {
      setPhase("input");
      toast({ title: "Refine failed", description: error.message, variant: "destructive" });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (data: Preview) => {
      const res = await apiRequest(
        "POST",
        `/api/campaigns/${campaignId}/posts/${post.id}/refine/apply`,
        data,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", String(campaignId)] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/posts"] });
      toast({ title: "Post refined" });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const messages = MESSAGES_BY_TARGET[target];
  const currentMessage = useRotatingMessage(messages);

  const handleSubmit = () => {
    const trimmed = feedback.trim();
    if (!trimmed) return;
    refineMutation.mutate({ feedback: trimmed, target });
  };

  const handleApply = () => {
    if (!preview) return;
    applyMutation.mutate(preview);
  };

  const platformLabel = PLATFORM_SETTINGS[post.platform as PlatformKey]?.label || post.platform;
  const captionPreview = post.content.replace(/<[^>]*>/g, "").slice(0, 80);
  const isFeedbackInvalid = isBlank(feedback);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        data-testid="dialog-refine-post"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Refine with AI
          </DialogTitle>
          <DialogDescription>
            Tell the AI what to change — it sees the original brief, brand voice, and platform rules.
          </DialogDescription>
        </DialogHeader>

        {/* Post context strip — always visible so the user knows which post they're working on */}
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-3">
          <img
            src={platformIcons[post.platform]}
            alt={platformLabel}
            className="w-5 h-5 rounded flex-shrink-0"
          />
          <div className="text-xs text-muted-foreground flex-1 min-w-0">
            <span className="font-medium text-foreground">{post.postIdentifier || `Post ${post.id}`}</span>
            <span className="mx-2">·</span>
            <span>{platformLabel}</span>
            {captionPreview && (
              <>
                <span className="mx-2">·</span>
                <span className="truncate">{captionPreview}{captionPreview.length === 80 ? "…" : ""}</span>
              </>
            )}
          </div>
          {post.imageUrl && (
            <img
              src={post.imageUrl}
              alt="Current"
              className="w-10 h-10 rounded object-cover flex-shrink-0"
            />
          )}
        </div>

        {phase === "input" && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">What should the AI refine?</p>
              {hasImage ? (
                <div className="space-y-1.5" role="radiogroup" aria-label="What to refine">
                  {(
                    [
                      { value: "content", label: "Caption", desc: "Rewrites the post text. Keeps the image." },
                      { value: "image", label: "Image", desc: "Generates a new image. Keeps the text." },
                      { value: "both", label: "Both caption and image", desc: "Updates both at once." },
                    ] as const
                  ).map((opt) => {
                    const isOn = target === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={isOn}
                        onClick={() => setTarget(opt.value)}
                        className={`w-full text-left px-3 py-2.5 rounded-md border transition-colors flex items-start gap-3 ${
                          isOn
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40 hover:bg-muted/40"
                        }`}
                        data-testid={`refine-target-${opt.value}`}
                      >
                        <span
                          className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            isOn ? "border-primary" : "border-muted-foreground/40"
                          }`}
                          aria-hidden
                        >
                          {isOn && <span className="w-2 h-2 rounded-full bg-primary" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium">{opt.label}</span>
                          <span className="block text-xs text-muted-foreground mt-0.5">{opt.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  <div
                    className="w-full text-left px-3 py-2.5 rounded-md border border-primary bg-primary/5 flex items-start gap-3"
                    data-testid="refine-target-content"
                  >
                    <span className="mt-0.5 w-4 h-4 rounded-full border-2 border-primary flex items-center justify-center flex-shrink-0">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium">Caption</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        Rewrites the post text.
                      </span>
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5 px-1">
                    <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    This post has no image yet — generate one first to refine it.
                  </p>
                </div>
              )}
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Your feedback</p>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="e.g. shorter, add the stat 40%, drop the emojis, more energetic…"
                maxLength={1000}
                className="min-h-[96px]"
                aria-invalid={isFeedbackInvalid}
                data-testid="post-refine-feedback"
                autoFocus
              />
              {isFeedbackInvalid && (
                <p className="text-sm text-destructive" data-testid="error-refine-feedback">
                  Feedback cannot be empty or contain only spaces.
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1.5">
                {feedback.length}/1000
              </p>
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                data-testid="button-refine-cancel"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={feedback.trim().length === 0}
                className="gap-2"
                data-testid="button-refine-submit"
              >
                <Sparkles className="w-4 h-4" />
                Refine
              </Button>
            </DialogFooter>
          </div>
        )}

        {phase === "processing" && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center" data-testid="refine-processing">
            <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
            <p className="text-base font-medium mb-1">Refining your post…</p>
            <p
              className="text-sm text-muted-foreground transition-opacity duration-300"
              key={currentMessage}
              data-testid="refine-processing-message"
            >
              {currentMessage}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-6">
              This usually takes a few seconds.
            </p>
          </div>
        )}

        {phase === "review" && preview && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium">Review the change</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your feedback: <span className="italic">"{feedback}"</span>
              </p>
            </div>

            {preview.newContent !== undefined && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Caption</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded-md bg-muted/40 border border-border">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Current</p>
                    <div className="text-sm leading-relaxed" data-testid="refine-preview-current-content">
                      <RichTextContent html={post.content} />
                    </div>
                  </div>
                  <div className="p-3 rounded-md bg-primary/5 border border-primary/30">
                    <p className="text-[10px] uppercase tracking-wide text-primary/80 mb-1.5">After refinement</p>
                    <div
                      className="text-sm leading-relaxed whitespace-pre-wrap"
                      data-testid="refine-preview-new-content"
                    >
                      {preview.newContent}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {preview.newImageBase64 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Image</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded-md bg-muted/40 border border-border">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Current</p>
                    {post.imageUrl ? (
                      <img
                        src={post.imageUrl}
                        alt="Current"
                        className="w-full rounded-md object-cover max-h-80"
                        data-testid="refine-preview-current-image"
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">No current image.</p>
                    )}
                  </div>
                  <div className="p-3 rounded-md bg-primary/5 border border-primary/30">
                    <p className="text-[10px] uppercase tracking-wide text-primary/80 mb-1.5">After refinement</p>
                    <img
                      src={preview.newImageBase64}
                      alt="Refined preview"
                      className="w-full rounded-md object-cover max-h-80"
                      data-testid="refine-preview-new-image"
                    />
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="ghost"
                onClick={() => setPhase("input")}
                disabled={applyMutation.isPending}
                className="gap-1.5"
                data-testid="button-refine-try-again"
              >
                <ArrowLeft className="w-4 h-4" />
                Try different feedback
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={applyMutation.isPending}
                data-testid="button-refine-discard"
              >
                Discard
              </Button>
              <Button
                onClick={handleApply}
                disabled={applyMutation.isPending}
                className="gap-2"
                data-testid="button-refine-apply"
              >
                {applyMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Apply
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
