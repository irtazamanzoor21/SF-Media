import { useState, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuota } from "@/hooks/use-quota";
import { Card } from "@/components/ui/card";
import { ScheduledPill } from "@/components/scheduled-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import {
  Pencil,
  Check,
  X,
  Loader2,
  ImageIcon,
  Sparkles,
  FolderOpen,
  Layers,
  Trash2,
  CalendarIcon,
  Clock,
  Lock,
} from "lucide-react";
import type { Campaign, CampaignPost, PlatformKey, MediaFolder, MediaFile } from "@shared/schema";
import { PLATFORM_SETTINGS } from "@shared/schema";
import { RichTextEditor, RichTextContent } from "@/components/rich-text-editor";
import { ImageCarousel } from "@/components/image-carousel";
import { ImageEditor } from "@/components/image-editor";
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

function getPostImages(post: CampaignPost): string[] {
  if (post.imageUrls && post.imageUrls.length > 0) return post.imageUrls;
  if (post.imageUrl) return [post.imageUrl];
  return [];
}

function MediaLibraryPickerInline({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}) {
  const [selectedFolderId, setSelectedFolderId] = useState<"all" | "uncategorized" | number>("all");

  const { data: folders = [] } = useQuery<MediaFolder[]>({
    queryKey: ["/api/media/folders"],
    enabled: open,
  });

  const { data: allFiles = [] } = useQuery<MediaFile[]>({
    queryKey: ["/api/media/files"],
    enabled: open,
  });

  const filteredFiles = allFiles.filter((f) => {
    if (selectedFolderId === "all") return true;
    if (selectedFolderId === "uncategorized") return f.folderId === null;
    return f.folderId === selectedFolderId;
  });

  const imageFiles = filteredFiles.filter((f) => f.mimeType.startsWith("image/"));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select from Media Library</DialogTitle>
          <DialogDescription>Choose an image from your media library to attach to this post.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-4 flex-1 min-h-0">
          <div className="w-48 flex-shrink-0 space-y-1 overflow-y-auto">
            <Button
              variant={selectedFolderId === "all" ? "secondary" : "ghost"}
              className="w-full justify-start gap-2"
              onClick={() => setSelectedFolderId("all")}
            >
              <Layers className="w-4 h-4" />
              All Files
            </Button>
            <Button
              variant={selectedFolderId === "uncategorized" ? "secondary" : "ghost"}
              className="w-full justify-start gap-2"
              onClick={() => setSelectedFolderId("uncategorized")}
            >
              <ImageIcon className="w-4 h-4" />
              Uncategorized
            </Button>
            {folders.map((folder) => (
              <Button
                key={folder.id}
                variant={selectedFolderId === folder.id ? "secondary" : "ghost"}
                className="w-full justify-start gap-2"
                onClick={() => setSelectedFolderId(folder.id)}
              >
                <FolderOpen className="w-4 h-4" style={{ color: folder.color }} />
                <span className="truncate">{folder.name}</span>
              </Button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {imageFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <ImageIcon className="w-10 h-10 mb-2 opacity-40" />
                <p className="text-sm">No images found</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {imageFiles.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => onSelect(file.url)}
                    className="group relative rounded-md overflow-hidden border-2 border-transparent hover:border-primary transition-colors cursor-pointer aspect-square"
                  >
                    <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-xs text-white truncate">{file.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SchedulePickerInline({
  postId,
  currentDate,
  onSchedule,
  onClear,
  isPending,
}: {
  postId: number;
  currentDate?: Date;
  onSchedule: (postId: number, date: Date) => void;
  onClear?: (postId: number) => void;
  isPending: boolean;
}) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(currentDate || new Date());
  const [time, setTime] = useState(() => {
    if (currentDate) {
      const h = currentDate.getHours().toString().padStart(2, "0");
      const m = currentDate.getMinutes().toString().padStart(2, "0");
      return `${h}:${m}`;
    }
    return "09:00";
  });

  const handleSchedule = () => {
    if (!selectedDate) return;
    const [hours, minutes] = time.split(":").map(Number);
    const scheduled = new Date(selectedDate);
    scheduled.setHours(hours, minutes, 0, 0);
    onSchedule(postId, scheduled);
  };

  return (
    <div className="p-3 space-y-3">
      <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} initialFocus />
      <div className="space-y-2 px-1">
        <Label className="text-xs font-medium">Time</Label>
        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9" />
      </div>
      <div className="flex gap-2 px-1">
        <Button size="sm" className="flex-1 gap-1.5" onClick={handleSchedule} disabled={!selectedDate || isPending}>
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {isPending ? "Saving..." : "Set Schedule"}
        </Button>
        {onClear && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onClear(postId)} disabled={isPending}>
            <X className="w-3.5 h-3.5" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

export function PostDetailDialog({
  open,
  onClose,
  post,
  campaign,
  postIndex,
  totalPosts,
  additionalInvalidateKeys,
  readOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  post: CampaignPost;
  campaign: Campaign;
  postIndex: number;
  totalPosts: number;
  additionalInvalidateKeys?: string[][];
  readOnly?: boolean;
}) {
  const { toast } = useToast();
  const { canSchedule, isAtAiLimit, aiPostsRemaining, aiQuota } = useQuota();
  const [editingContent, setEditingContent] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editingImagePrompt, setEditingImagePrompt] = useState(false);
  const [editImagePrompt, setEditImagePrompt] = useState("");
  const [generatingImage, setGeneratingImage] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [editingImageUrl, setEditingImageUrl] = useState<string | null>(null);

  const campaignId = campaign.id;

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/campaigns", String(campaignId)] });
    queryClient.invalidateQueries({ queryKey: ["/api/calendar/posts"] });
    if (additionalInvalidateKeys) {
      additionalInvalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    }
  }, [campaignId, additionalInvalidateKeys]);

  const updatePostMutation = useMutation({
    mutationFn: async ({ content, imagePrompt }: { content?: string; imagePrompt?: string }) => {
      const res = await apiRequest("PATCH", `/api/campaigns/${campaignId}/posts/${post.id}`, { content, imagePrompt });
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      setEditingContent(false);
      setEditContent("");
      toast({ title: "Post updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/campaigns/${campaignId}/posts/${post.id}`);
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Post deleted" });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const schedulePostMutation = useMutation({
    mutationFn: async ({ scheduledAt }: { scheduledAt: string | null }) => {
      const res = await apiRequest("PATCH", `/api/campaigns/${campaignId}/posts/${post.id}/schedule`, { scheduledAt });
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Schedule updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleGenerateImage = useCallback(async (imagePrompt: string) => {
    setGeneratingImage(true);
    try {
      const res = await apiRequest("POST", `/api/campaigns/${campaignId}/posts/${post.id}/regenerate-image`, { imagePrompt });
      await res.json();
      invalidateAll();
      toast({ title: "Image generated" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setGeneratingImage(false);
    }
  }, [campaignId, post.id, invalidateAll, toast]);

  const handleAttachMediaImage = useCallback(async (imageUrl: string) => {
    try {
      await apiRequest("PATCH", `/api/campaigns/${campaignId}/posts/${post.id}/attach-image`, { imageUrl });
      invalidateAll();
      setMediaPickerOpen(false);
      toast({ title: "Image added" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  }, [campaignId, post.id, invalidateAll, toast]);

  const handleRemoveImage = useCallback(async (imageIndex: number) => {
    try {
      await apiRequest("PATCH", `/api/campaigns/${campaignId}/posts/${post.id}/remove-image`, { imageIndex });
      invalidateAll();
      toast({ title: "Image removed" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  }, [campaignId, post.id, invalidateAll, toast]);

  const images = getPostImages(post);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <img
                src={platformIcons[post.platform]}
                alt={PLATFORM_SETTINGS[post.platform as PlatformKey]?.label}
                className="w-5 h-5 rounded"
              />
              Post {postIndex + 1} of {totalPosts} — {PLATFORM_SETTINGS[post.platform as PlatformKey]?.label}
            </DialogTitle>
            <DialogDescription>
              {campaign.companyName} &middot; {campaign.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {post.scheduledAt && (
              <ScheduledPill scheduledAt={post.scheduledAt} platform={post.platform} />
            )}

            <Card className="p-4">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <h3 className="text-sm font-semibold">Post Content</h3>
                <div className="flex items-center gap-1">
                  {!readOnly && (editingContent ? (
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => updatePostMutation.mutate({ content: editContent })}
                        disabled={updatePostMutation.isPending}
                        data-testid="button-save-content"
                      >
                        {updatePostMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => { setEditingContent(false); setEditContent(""); }} data-testid="button-cancel-content">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          if (window.confirm("Are you sure you want to delete this post?")) {
                            deletePostMutation.mutate();
                          }
                        }}
                        disabled={deletePostMutation.isPending}
                        data-testid="button-delete-post-dialog"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      {canSchedule ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button size="icon" variant="ghost" data-testid="button-schedule-post-dialog">
                              <CalendarIcon className="w-4 h-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="end">
                            <SchedulePickerInline
                              postId={post.id}
                              currentDate={post.scheduledAt ? new Date(post.scheduledAt) : undefined}
                              onSchedule={(_postId, date) => {
                                schedulePostMutation.mutate({ scheduledAt: date.toISOString() });
                              }}
                              onClear={post.scheduledAt ? () => {
                                schedulePostMutation.mutate({ scheduledAt: null });
                              } : undefined}
                              isPending={schedulePostMutation.isPending}
                            />
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button size="icon" variant="ghost" disabled data-testid="button-schedule-post-dialog">
                                  <Lock className="w-4 h-4 text-muted-foreground" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              Scheduling requires Professional or higher
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => { setEditingContent(true); setEditContent(post.content); }}
                        data-testid="button-edit-content"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </>
                  ))}
                </div>
              </div>
              {editingContent ? (
                <RichTextEditor content={editContent} onChange={setEditContent} />
              ) : (
                <div className="text-sm leading-relaxed">
                  <RichTextContent html={post.content} />
                </div>
              )}
            </Card>

            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3">
                Post Images
                {images.length > 0 && (
                  <span className="text-xs font-normal text-muted-foreground ml-2">
                    ({images.length} image{images.length !== 1 ? "s" : ""})
                  </span>
                )}
              </h3>
              {images.length > 0 && (
                <div className="space-y-3 mb-3">
                  <ImageCarousel images={images} showRemove={!readOnly} onRemove={!readOnly ? (index) => handleRemoveImage(index) : undefined} />
                  <div className="flex gap-1.5 flex-wrap">
                    {images.map((url, i) => (
                      <div key={i} className="relative group/thumb w-14 h-14 rounded-md overflow-hidden border border-border">
                        <img src={url} alt={`Image ${i + 1}`} className="w-full h-full object-cover" />
                        {!readOnly && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-1 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                            <button onClick={() => setEditingImageUrl(url)}>
                              <Pencil className="w-3 h-3 text-white" />
                            </button>
                            <button onClick={() => handleRemoveImage(i)}>
                              <X className="w-3.5 h-3.5 text-white" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-3">
                {images.length === 0 && post.imagePrompt && (
                  <div className="p-3 rounded-md bg-muted/50">
                    <p className="text-xs font-medium text-muted-foreground mb-1">AI Image Prompt</p>
                    <p className="text-xs text-muted-foreground">{post.imagePrompt}</p>
                  </div>
                )}
                {!readOnly && (
                  <div className="flex gap-2 flex-wrap">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex-1">
                            <Button
                              variant="outline"
                              className="gap-2 w-full"
                              onClick={() => handleGenerateImage(post.imagePrompt || "")}
                              disabled={generatingImage || !post.imagePrompt || isAtAiLimit}
                              data-testid="button-generate-ai-dialog"
                            >
                              {generatingImage ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                              ) : isAtAiLimit ? (
                                <><Lock className="w-4 h-4" /> AI Limit Reached</>
                              ) : (
                                <>
                                  <Sparkles className="w-4 h-4" /> Generate with AI
                                  {aiPostsRemaining != null && (
                                    <Badge variant="secondary" className="ml-1 text-xs">
                                      {aiPostsRemaining} of {aiQuota?.limit} remaining
                                    </Badge>
                                  )}
                                </>
                              )}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {isAtAiLimit && (
                          <TooltipContent side="top">
                            You've used all your AI posts. Upgrade to get more.
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                    <Button
                      variant="outline"
                      className="gap-2 flex-1"
                      onClick={() => setMediaPickerOpen(true)}
                      data-testid="button-media-picker-dialog"
                    >
                      <FolderOpen className="w-4 h-4" />
                      Select from Library
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <h3 className="text-sm font-semibold">Image Prompt</h3>
                {!readOnly && (!editingImagePrompt ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => { setEditingImagePrompt(true); setEditImagePrompt(post.imagePrompt || ""); }}
                    data-testid="button-edit-image-prompt-dialog"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        updatePostMutation.mutate({ imagePrompt: editImagePrompt });
                        setEditingImagePrompt(false);
                      }}
                      disabled={updatePostMutation.isPending}
                      data-testid="button-save-image-prompt-dialog"
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => { setEditingImagePrompt(false); setEditImagePrompt(""); }}
                      data-testid="button-cancel-image-prompt-dialog"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              {editingImagePrompt ? (
                <Textarea
                  value={editImagePrompt}
                  onChange={(e) => setEditImagePrompt(e.target.value)}
                  className="min-h-[100px]"
                  data-testid="textarea-edit-image-prompt-dialog"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {post.imagePrompt || "No image prompt"}
                </p>
              )}
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      <MediaLibraryPickerInline
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={(url) => handleAttachMediaImage(url)}
      />

      {editingImageUrl && (
        <ImageEditor
          imageUrl={editingImageUrl}
          open={!!editingImageUrl}
          onClose={() => setEditingImageUrl(null)}
          onSave={() => {
            invalidateAll();
            setEditingImageUrl(null);
          }}
          context="campaign"
          campaignId={campaignId}
          postId={post.id}
        />
      )}
    </>
  );
}
