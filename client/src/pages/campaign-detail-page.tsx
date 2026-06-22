import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { emitQuotaExceeded } from "@/lib/quota-events";
import { usePermissions } from "@/hooks/use-permissions";
import { SiFacebook, SiInstagram, SiX } from "react-icons/si";
import { FaLinkedin } from "react-icons/fa6";
import { Card } from "@/components/ui/card";
import { ScheduledPill } from "@/components/scheduled-pill";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { useQuota } from "@/hooks/use-quota";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ToastAction } from "@/components/ui/toast";
import {
  ArrowLeft,
  Pencil,
  Check,
  X,
  Loader2,
  ImageIcon,
  Sparkles,
  Plus,
  Clock,
  CalendarIcon,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MoreHorizontal,
  ThumbsUp,
  Send,
  Repeat2,
  FolderOpen,
  Layers,
  Download,
  FileSpreadsheet,
  FileJson,
  ChevronDown,
  Trash2,
  Upload,
  BarChart3,
  TrendingUp,
  MousePointer,
  Users,
  RefreshCw,
  Link,
  ExternalLink,
  Lock,
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  Campaign,
  CampaignPost,
  PlatformKey,
  MediaFolder,
  MediaFile,
} from "@shared/schema";
import { PLATFORMS, PLATFORM_SETTINGS } from "@shared/schema";
import {
  RichTextEditor,
  RichTextContent,
  stripHtml,
} from "@/components/rich-text-editor";
import { ImageCarousel } from "@/components/image-carousel";
import { ImageEditor } from "@/components/image-editor";
import { RefinePostDialog } from "@/components/refine-post-dialog";
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

// Build a datetime-local string for the schedule dialogs.
// If the post already has a scheduledAt, prefill with that exact time so the
// user is rescheduling from their current value; otherwise default to now + 1h.
function prefillScheduleTime(scheduledAt: Date | string | null | undefined): string {
  const target = scheduledAt ? new Date(scheduledAt) : (() => {
    const t = new Date();
    t.setHours(t.getHours() + 1, 0, 0, 0);
    return t;
  })();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportPostsToCsv(campaign: Campaign, posts: CampaignPost[]) {
  const header =
    "Platform,Scheduled Date,Scheduled Time,Post Text,Media URL,Hashtags,Link URL,Campaign Name";

  const rows = posts.map((post) => {
    const platform = post.platform || "";

    let scheduledDate = "";
    let scheduledTime = "";
    if (post.scheduledAt) {
      const d = new Date(post.scheduledAt);
      scheduledDate = d.toISOString().split("T")[0];
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      scheduledTime = `${hours}:${minutes}`;
    }

    const content = stripHtml(post.content || "");

    const images = getPostImages(post);
    const mediaUrl = images.join(";");

    const hashtagMatches = content.match(/#\w+/g);
    const hashtags = hashtagMatches ? hashtagMatches.join(" ") : "";

    const urlMatches = content.match(/https?:\/\/[^\s)]+/g);
    const linkUrl = urlMatches ? urlMatches[0] : "";

    const campaignName = campaign.description || campaign.companyName || "";

    return [
      escapeCsvField(platform),
      escapeCsvField(scheduledDate),
      escapeCsvField(scheduledTime),
      escapeCsvField(content),
      escapeCsvField(mediaUrl),
      escapeCsvField(hashtags),
      escapeCsvField(linkUrl),
      escapeCsvField(campaignName),
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const filename = `${(campaign.description || campaign.companyName || "campaign").replace(/[^a-zA-Z0-9]/g, "_")}_agorapulse.csv`;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportPostsToFullCsv(campaign: Campaign, posts: CampaignPost[]) {
  const header =
    "Post #,Platform,Content,Image Prompt,Image URLs,Scheduled Date,Scheduled Time,Campaign,Company,Tone,CTA,Hashtags,Links";

  const rows = posts.map((post, index) => {
    const content = stripHtml(post.content || "");
    const images = getPostImages(post);

    let scheduledDate = "";
    let scheduledTime = "";
    if (post.scheduledAt) {
      const d = new Date(post.scheduledAt);
      scheduledDate = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      scheduledTime = d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }

    const hashtagMatches = content.match(/#\w+/g);
    const hashtags = hashtagMatches ? hashtagMatches.join(" ") : "";
    const urlMatches = content.match(/https?:\/\/[^\s)]+/g);
    const links = urlMatches ? urlMatches.join(" ") : "";

    return [
      index + 1,
      escapeCsvField(post.platform || ""),
      escapeCsvField(content),
      escapeCsvField(post.imagePrompt || ""),
      escapeCsvField(images.join("; ")),
      escapeCsvField(scheduledDate),
      escapeCsvField(scheduledTime),
      escapeCsvField(campaign.description || ""),
      escapeCsvField(campaign.companyName || ""),
      escapeCsvField(campaign.tone || ""),
      escapeCsvField(campaign.callToAction || ""),
      escapeCsvField(hashtags),
      escapeCsvField(links),
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const filename = `${(campaign.companyName || "campaign").replace(/[^a-zA-Z0-9]/g, "_")}_posts.csv`;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportPostsToJson(campaign: Campaign, posts: CampaignPost[]) {
  const data = {
    campaignName: campaign.description || campaign.companyName || "",
    companyName: campaign.companyName,
    platforms: campaign.platforms || [],
    tone: campaign.tone,
    callToAction: campaign.callToAction,
    status: campaign.status,
    createdAt: campaign.createdAt,
    posts: posts.map((post) => {
      const images = getPostImages(post);
      const content = stripHtml(post.content || "");
      const hashtagMatches = content.match(/#\w+/g);
      return {
        platform: post.platform,
        content: content,
        scheduledAt: post.scheduledAt || null,
        imagePrompt: post.imagePrompt || "",
        mediaUrls: images,
        hashtags: hashtagMatches || [],
      };
    }),
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const filename = `${(campaign.description || campaign.companyName || "campaign").replace(/[^a-zA-Z0-9]/g, "_")}_posts.json`;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function InstagramPreview({
  post,
  companyName,
}: {
  post: CampaignPost;
  companyName: string;
}) {
  const images = getPostImages(post);
  return (
    <div className="bg-white text-black rounded-2xl overflow-hidden w-full max-w-[320px]">
      <div className="flex items-center gap-2 p-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-yellow-500 flex items-center justify-center text-white text-xs font-bold">
          {companyName.charAt(0)}
        </div>
        <span className="text-sm font-semibold flex-1 truncate">
          {companyName.toLowerCase().replace(/\s+/g, "")}
        </span>
        <MoreHorizontal className="w-4 h-4 text-gray-500" />
      </div>
      {images.length > 0 ? (
        <ImageCarousel images={images} aspectRatio="1/1" />
      ) : (
        <div className="w-full aspect-square bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
          <ImageIcon className="w-12 h-12 text-purple-300" />
        </div>
      )}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Heart className="w-5 h-5" />
            <MessageCircle className="w-5 h-5" />
            <Send className="w-5 h-5" />
          </div>
          <Bookmark className="w-5 h-5" />
        </div>
        <p className="text-xs font-semibold">1,234 likes</p>
        <div className="text-xs leading-relaxed">
          <span className="font-semibold">
            {companyName.toLowerCase().replace(/\s+/g, "")}{" "}
          </span>
          <RichTextContent
            html={post.content}
            className="inline [&_p]:inline [&_p]:my-0 [&_a]:text-[#E1306C] [&_a]:font-medium"
          />
        </div>
      </div>
    </div>
  );
}

function LinkedInPreview({
  post,
  companyName,
}: {
  post: CampaignPost;
  companyName: string;
}) {
  const images = getPostImages(post);
  return (
    <div className="bg-white text-black rounded-2xl overflow-hidden w-full max-w-[320px]">
      <div className="flex items-center gap-2 p-3">
        <div className="w-10 h-10 rounded-full bg-[#0077b5] flex items-center justify-center text-white text-sm font-bold">
          {companyName.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{companyName}</p>
          <p className="text-xs text-gray-500">Company Page</p>
        </div>
        <MoreHorizontal className="w-4 h-4 text-gray-500" />
      </div>
      <div className="px-3 pb-2">
        <RichTextContent
          html={post.content}
          className="text-xs leading-relaxed [&_a]:text-[#0a66c2] [&_a]:font-medium [&_p]:my-0"
        />
      </div>
      {images.length > 0 ? (
        <ImageCarousel images={images} aspectRatio="1200/627" />
      ) : (
        <div className="w-full aspect-[1200/627] bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
          <ImageIcon className="w-12 h-12 text-blue-300" />
        </div>
      )}
      <div className="p-3 border-t border-gray-100">
        <div className="flex items-center justify-around text-gray-500">
          <div className="flex items-center gap-1 text-xs">
            <ThumbsUp className="w-4 h-4" /> Like
          </div>
          <div className="flex items-center gap-1 text-xs">
            <MessageCircle className="w-4 h-4" /> Comment
          </div>
          <div className="flex items-center gap-1 text-xs">
            <Repeat2 className="w-4 h-4" /> Repost
          </div>
          <div className="flex items-center gap-1 text-xs">
            <Send className="w-4 h-4" /> Send
          </div>
        </div>
      </div>
    </div>
  );
}

function XPreview({
  post,
  companyName,
}: {
  post: CampaignPost;
  companyName: string;
}) {
  const images = getPostImages(post);
  return (
    <div className="bg-white text-black rounded-2xl overflow-hidden w-full max-w-[320px]">
      <div className="flex gap-2 p-3">
        <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
          {companyName.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold truncate">{companyName}</span>
            <span className="text-xs text-gray-500 truncate">
              @{companyName.toLowerCase().replace(/\s+/g, "")}
            </span>
          </div>
          <div className="text-sm leading-relaxed mt-1">
            <RichTextContent
              html={post.content}
              className="[&_a]:text-[#1d9bf0] [&_a]:font-medium [&_p]:my-0"
            />
          </div>
          {images.length > 0 && (
            <div className="mt-2 rounded-xl overflow-hidden">
              <ImageCarousel images={images} aspectRatio="1200/675" />
            </div>
          )}
          <div className="flex items-center justify-between mt-3 text-gray-400">
            <MessageCircle className="w-4 h-4" />
            <Repeat2 className="w-4 h-4" />
            <Heart className="w-4 h-4" />
            <Share2 className="w-4 h-4" />
          </div>
        </div>
      </div>
    </div>
  );
}

function FacebookPreview({
  post,
  companyName,
}: {
  post: CampaignPost;
  companyName: string;
}) {
  const images = getPostImages(post);
  return (
    <div className="bg-white text-black rounded-2xl overflow-hidden w-full max-w-[320px]">
      <div className="flex items-center gap-2 p-3">
        <div className="w-10 h-10 rounded-full bg-[#1877f2] flex items-center justify-center text-white text-sm font-bold">
          {companyName.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{companyName}</p>
          <p className="text-xs text-gray-500">Just now</p>
        </div>
        <MoreHorizontal className="w-4 h-4 text-gray-500" />
      </div>
      <div className="px-3 pb-2">
        <RichTextContent
          html={post.content}
          className="text-xs leading-relaxed [&_a]:text-[#1877f2] [&_a]:font-medium [&_p]:my-0"
        />
      </div>
      {images.length > 0 ? (
        <ImageCarousel images={images} aspectRatio="1200/630" />
      ) : (
        <div className="w-full aspect-[1200/630] bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
          <ImageIcon className="w-12 h-12 text-blue-300" />
        </div>
      )}
      <div className="p-3 border-t border-gray-100">
        <div className="flex items-center justify-around text-gray-500">
          <div className="flex items-center gap-1 text-xs">
            <ThumbsUp className="w-4 h-4" /> Like
          </div>
          <div className="flex items-center gap-1 text-xs">
            <MessageCircle className="w-4 h-4" /> Comment
          </div>
          <div className="flex items-center gap-1 text-xs">
            <Share2 className="w-4 h-4" /> Share
          </div>
        </div>
      </div>
    </div>
  );
}

function PhoneMockup({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto" style={{ width: 350 }}>
      <div className="rounded-[2.5rem] border-[6px] border-gray-800 dark:border-gray-600 bg-gray-800 dark:bg-gray-600 p-1 shadow-xl">
        <div className="relative rounded-[2rem] overflow-hidden bg-gray-100">
          <div className="w-20 h-5 bg-gray-800 dark:bg-gray-600 rounded-b-2xl mx-auto" />
          <div className="p-3 min-h-[540px] flex items-start justify-center overflow-y-auto">
            {children}
          </div>
          <div className="h-1 w-28 bg-gray-400 rounded-full mx-auto mb-2" />
        </div>
      </div>
    </div>
  );
}

function PlatformPreview({
  post,
  platform,
  companyName,
}: {
  post: CampaignPost;
  platform: string;
  companyName: string;
}) {
  const previewMap: Record<string, React.ReactNode> = {
    instagram: <InstagramPreview post={post} companyName={companyName} />,
    linkedin: <LinkedInPreview post={post} companyName={companyName} />,
    x: <XPreview post={post} companyName={companyName} />,
    facebook: <FacebookPreview post={post} companyName={companyName} />,
  };
  return (
    <PhoneMockup>{previewMap[platform] || previewMap.instagram}</PhoneMockup>
  );
}

function MediaLibraryPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}) {
  const [selectedFolderId, setSelectedFolderId] = useState<
    "all" | "uncategorized" | number
  >("all");

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

  const imageFiles = filteredFiles.filter((f) =>
    f.mimeType.startsWith("image/"),
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select from Media Library</DialogTitle>
          <DialogDescription>
            Choose an image from your media library to attach to this post.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-4 flex-1 min-h-0">
          <div className="w-48 flex-shrink-0 space-y-1 overflow-y-auto">
            <Button
              variant={selectedFolderId === "all" ? "secondary" : "ghost"}
              className="w-full justify-start gap-2"
              onClick={() => setSelectedFolderId("all")}
              data-testid="button-picker-folder-all"
            >
              <Layers className="w-4 h-4" />
              All Files
            </Button>
            <Button
              variant={
                selectedFolderId === "uncategorized" ? "secondary" : "ghost"
              }
              className="w-full justify-start gap-2"
              onClick={() => setSelectedFolderId("uncategorized")}
              data-testid="button-picker-folder-uncategorized"
            >
              <FolderOpen className="w-4 h-4" />
              Uncategorized
            </Button>
            {folders.map((folder) => (
              <Button
                key={folder.id}
                variant={selectedFolderId === folder.id ? "secondary" : "ghost"}
                className="w-full justify-start gap-2"
                onClick={() => setSelectedFolderId(folder.id)}
                data-testid={`button-picker-folder-${folder.id}`}
              >
                <FolderOpen
                  className="w-4 h-4"
                  style={{ color: folder.color }}
                />
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
                    data-testid={`button-picker-file-${file.id}`}
                  >
                    <img
                      src={file.url}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
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

function PostSchedulePicker({
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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    currentDate || new Date(),
  );
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
    <div className="p-3 space-y-3" data-testid={`schedule-picker-${postId}`}>
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={setSelectedDate}
        initialFocus
      />
      <div className="space-y-2 px-1">
        <Label className="text-xs font-medium">Time</Label>
        <Input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="h-9"
          data-testid={`input-schedule-time-${postId}`}
        />
      </div>
      <div className="flex gap-2 px-1">
        <Button
          size="sm"
          className="flex-1 gap-1.5"
          onClick={handleSchedule}
          disabled={!selectedDate || isPending}
          data-testid={`button-confirm-schedule-${postId}`}
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          {isPending ? "Saving..." : "Set Schedule"}
        </Button>
        {onClear && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => onClear(postId)}
            disabled={isPending}
            data-testid={`button-clear-schedule-${postId}`}
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

function PostSparkline({ postId }: { postId: number }) {
  const { data: snapshots = [] } = useQuery<Array<{ recordedAt: string; likes: number; impressions: number }>>({
    queryKey: ["/api/posts", postId, "metric-snapshots"],
  });
  if (snapshots.length < 2) return null;
  const reversed = [...snapshots].slice(0, 5).reverse();
  const data = reversed.map((s) => ({ likes: s.likes }));
  return (
    <div className="w-20 h-8" data-testid={`sparkline-${postId}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="likes" stroke="#6366f1" strokeWidth={1.5} dot={false} />
          <Tooltip
            contentStyle={{ fontSize: 10, padding: "2px 6px" }}
            formatter={(v: number) => [v, "Likes"]}
            labelFormatter={() => ""}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CampaignMetricsSection({ campaignId, posts }: { campaignId: number; posts: CampaignPost[] }) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const fileInputRef = useCallback((node: HTMLInputElement | null) => {
    if (node) node.value = "";
  }, []);

  const { data: metricsData, isLoading } = useQuery<{
    campaign: {
      impressions: number;
      reach: number;
      likes: number;
      comments: number;
      shares: number;
      saves: number;
      clicks: number;
      totalEngagement: number;
      engagementRate: number;
      ctr: number;
      postsWithMetrics: number;
    };
    posts: Array<{
      postId: number;
      postIdentifier: string;
      platform: string;
      impressions: number;
      reach: number;
      likes: number;
      comments: number;
      shares: number;
      saves: number;
      clicks: number;
      engagementRate: number;
      ctr: number;
      uploadedAt: string;
    }>;
  }>({
    queryKey: ["/api/campaigns", campaignId, "metrics"],
  });

  const handleDownloadSample = async () => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/metrics/sample-csv`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to download");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `campaign-${campaignId}-metrics-sample.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Error", description: "Failed to download sample CSV", variant: "destructive" });
    }
  };

  const handleUploadCsv = async (file: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/campaigns/${campaignId}/metrics/upload-csv`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const result = await response.json();
      if (!response.ok) {
        toast({
          title: "Upload Error",
          description: result.message + (result.errors ? "\n" + result.errors.join("\n") : ""),
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Success", description: result.message });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "metrics"] });
    } catch {
      toast({ title: "Error", description: "Failed to upload CSV", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSyncMetrics = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/metrics/sync`, {
        method: "POST",
        credentials: "include",
      });
      const result = await response.json();
      if (!response.ok) {
        toast({ title: "Sync Error", description: result.message || "Failed to sync metrics", variant: "destructive" });
        return;
      }
      if (result.facebookNeedsReconnect && (result.synced ?? 0) === 0) {
        toast({
          title: "Facebook metrics blocked",
          description: "pages_read_engagement needs Advanced Access (via App Review) before engagement counts can be read. Shares only are available in dev mode.",
          variant: "destructive",
          duration: 10000,
        });
      } else if (result.facebookNeedsReconnect) {
        toast({
          title: "Partial Sync",
          description: `${result.synced} of ${result.total} post(s) updated. Full engagement counts require App Review approval.`,
          duration: 8000,
        });
      } else {
        toast({ title: "Synced", description: result.message || "Metrics synced from connected platforms." });
      }
      setLastSyncedAt(new Date().toISOString());
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "metrics"] });
    } catch {
      toast({ title: "Error", description: "Failed to sync metrics", variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  const formatNumber = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toString();
  };

  const hasMetrics = metricsData && metricsData.posts.length > 0;

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Performance Metrics</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Sync live data from connected platforms or upload a CSV with post performance metrics.
            </p>
            {(() => {
              const ts = lastSyncedAt || (metricsData?.posts?.length
                ? metricsData.posts.reduce<string | null>((latest, p) => {
                    if (!p.uploadedAt) return latest;
                    if (!latest) return p.uploadedAt;
                    return p.uploadedAt > latest ? p.uploadedAt : latest;
                  }, null)
                : null);
              if (!ts) return null;
              const d = new Date(ts);
              const now = new Date();
              const diffMs = now.getTime() - d.getTime();
              const diffMin = Math.round(diffMs / 60000);
              const relLabel = diffMin < 1 ? "just now"
                : diffMin < 60 ? `${diffMin}m ago`
                : diffMin < 1440 ? `${Math.round(diffMin / 60)}h ago`
                : d.toLocaleDateString();
              return (
                <p className="text-xs text-muted-foreground mt-1" data-testid="text-last-synced">
                  Last synced {relLabel}
                </p>
              );
            })()}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleSyncMetrics}
              disabled={isSyncing}
              data-testid="button-sync-metrics"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Syncing..." : "Sync Now"}
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleDownloadSample} data-testid="button-download-sample-csv">
              <Download className="w-4 h-4" />
              Sample CSV
            </Button>
            <div className="relative">
              <input
                type="file"
                accept=".csv"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                ref={fileInputRef}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadCsv(file);
                  e.target.value = "";
                }}
                disabled={isUploading}
                data-testid="input-upload-csv"
              />
              <Button size="sm" className="gap-2 pointer-events-none" disabled={isUploading} data-testid="button-upload-csv">
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isUploading ? "Uploading..." : "Upload CSV"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : hasMetrics ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Impressions</p>
              </div>
              <p className="text-2xl font-bold" data-testid="metric-total-impressions">{formatNumber(metricsData.campaign.impressions)}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Reach</p>
              </div>
              <p className="text-2xl font-bold" data-testid="metric-total-reach">{formatNumber(metricsData.campaign.reach)}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Heart className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Engagement</p>
              </div>
              <p className="text-2xl font-bold" data-testid="metric-total-engagement">{formatNumber(metricsData.campaign.totalEngagement)}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Eng. Rate</p>
              </div>
              <p className="text-2xl font-bold" data-testid="metric-engagement-rate">{metricsData.campaign.engagementRate}%</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <MousePointer className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">CTR</p>
              </div>
              <p className="text-2xl font-bold" data-testid="metric-ctr">{metricsData.campaign.ctr}%</p>
            </Card>
          </div>

          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-4">Post-Level Metrics</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium text-xs text-muted-foreground">Post ID</th>
                    <th className="pb-2 pr-4 font-medium text-xs text-muted-foreground">Platform</th>
                    <th className="pb-2 pr-4 font-medium text-xs text-muted-foreground text-right">Impressions</th>
                    <th className="pb-2 pr-4 font-medium text-xs text-muted-foreground text-right">Reach</th>
                    <th className="pb-2 pr-4 font-medium text-xs text-muted-foreground text-right">Likes</th>
                    <th className="pb-2 pr-4 font-medium text-xs text-muted-foreground text-right">Comments</th>
                    <th className="pb-2 pr-4 font-medium text-xs text-muted-foreground text-right">Shares</th>
                    <th className="pb-2 pr-4 font-medium text-xs text-muted-foreground text-right">Saves</th>
                    <th className="pb-2 pr-4 font-medium text-xs text-muted-foreground text-right">Clicks</th>
                    <th className="pb-2 pr-4 font-medium text-xs text-muted-foreground text-right">Eng. Rate</th>
                    <th className="pb-2 pr-4 font-medium text-xs text-muted-foreground text-right">CTR</th>
                    <th className="pb-2 font-medium text-xs text-muted-foreground">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {metricsData.posts.map((pm) => (
                    <tr key={pm.postId} className="border-b last:border-0" data-testid={`row-metric-${pm.postId}`}>
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className="font-mono text-[10px]">{pm.postIdentifier}</Badge>
                      </td>
                      <td className="py-2 pr-4 capitalize">{PLATFORM_SETTINGS[pm.platform as PlatformKey]?.label || pm.platform}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatNumber(pm.impressions)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatNumber(pm.reach)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatNumber(pm.likes)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatNumber(pm.comments)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatNumber(pm.shares)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatNumber(pm.saves)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatNumber(pm.clicks)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{pm.platform === "linkedin" ? <span className="text-xs text-muted-foreground italic">N/A</span> : `${pm.engagementRate}%`}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{pm.platform === "linkedin" ? <span className="text-xs text-muted-foreground italic">N/A</span> : `${pm.ctr}%`}</td>
                      <td className="py-2">
                        {pm.platform === "linkedin" ? (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 whitespace-nowrap">Analytics pending partner access</span>
                        ) : (
                          <PostSparkline postId={pm.postId} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <Card className="p-8 text-center">
          <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
          <h3 className="text-sm font-semibold mb-1">No Metrics Yet</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Download the sample CSV above, fill in your post performance data (impressions, likes, comments, etc.), and upload it to see your campaign analytics here.
          </p>
        </Card>
      )}
    </div>
  );
}

export default function CampaignDetailPage({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const { canSchedule } = useQuota();
  const canCustomize = hasPermission("CAMPAIGN", "customize");
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editImagePrompt, setEditImagePrompt] = useState("");
  const [isEditingImagePrompt, setIsEditingImagePrompt] = useState(false);
  const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);
  const [refiningPostId, setRefiningPostId] = useState<number | null>(null);
  const [generatingImagePostId, setGeneratingImagePostId] = useState<
    number | null
  >(null);
  const [mediaPickerPostId, setMediaPickerPostId] = useState<number | null>(
    null,
  );
  const [showAddPost, setShowAddPost] = useState(false);
  const [addPostCount, setAddPostCount] = useState(1);
  const [addPostIdea, setAddPostIdea] = useState("");
  const [addPostPlatforms, setAddPostPlatforms] = useState<string[]>([]);
  const [isAddingPosts, setIsAddingPosts] = useState(false);
  const [addPostStatus, setAddPostStatus] = useState("");
  const [deletePostId, setDeletePostId] = useState<number | null>(null);
  const [editingImageUrl, setEditingImageUrl] = useState<string | null>(null);
  const [editingImagePostId, setEditingImagePostId] = useState<number | null>(
    null,
  );
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [linkingPostId, setLinkingPostId] = useState<number | null>(null);
  const [linkUrlInput, setLinkUrlInput] = useState("");

  const { data, isLoading } = useQuery<{
    campaign: Campaign;
    posts: CampaignPost[];
  }>({
    queryKey: ["/api/campaigns", id],
  });

  const { data: metricsData } = useQuery<{
    campaign: any;
    posts: Array<{
      postId: number;
      impressions: number;
      reach: number;
      likes: number;
      comments: number;
      shares: number;
      clicks: number;
      engagementRate: number;
    }>;
  }>({
    queryKey: ["/api/campaigns", id, "metrics"],
  });

  const postMetricsMap = useMemo(() => {
    const map = new Map<number, { impressions: number; reach: number; likes: number; comments: number; shares: number; clicks: number; engagementRate: number }>();
    if (metricsData?.posts) {
      for (const pm of metricsData.posts) {
        map.set(pm.postId, {
          impressions: pm.impressions,
          reach: pm.reach,
          likes: pm.likes,
          comments: pm.comments,
          shares: pm.shares,
          clicks: pm.clicks,
          engagementRate: pm.engagementRate,
        });
      }
    }
    return map;
  }, [metricsData?.posts]);

  const [isSyncingMetrics, setIsSyncingMetrics] = useState(false);

  const handleSyncAllMetrics = async () => {
    setIsSyncingMetrics(true);
    try {
      const response = await fetch(`/api/campaigns/${id}/metrics/sync`, {
        method: "POST",
        credentials: "include",
      });
      const result = await response.json();
      if (!response.ok) {
        toast({ title: "Sync Error", description: result.message || "Failed to sync metrics", variant: "destructive" });
        return;
      }
      if (result.facebookNeedsReconnect && result.synced === 0) {
        toast({
          title: "Facebook metrics blocked",
          description: "pages_read_engagement needs Advanced Access (via App Review) before engagement counts can be read. Shares only are available in dev mode.",
          variant: "destructive",
          duration: 10000,
        });
      } else if (result.facebookNeedsReconnect) {
        toast({
          title: "Partial Sync",
          description: `${result.synced} of ${result.total} post(s) updated. Full engagement counts require App Review approval.`,
          duration: 8000,
        });
      } else {
        toast({ title: "Metrics Synced", description: `${result.synced} of ${result.total} post(s) updated.` });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", id, "metrics"] });
    } catch {
      toast({ title: "Error", description: "Failed to sync metrics", variant: "destructive" });
    } finally {
      setIsSyncingMetrics(false);
    }
  };

  const activePlatforms = useMemo(() => {
    if (!data?.posts) return data?.campaign?.platforms || [];
    const platformsFromPosts = [...new Set(data.posts.map(p => p.platform))];
    return platformsFromPosts.length > 0 ? platformsFromPosts : [];
  }, [data?.posts, data?.campaign?.platforms]);

  const updatePostMutation = useMutation({
    mutationFn: async ({
      postId,
      content,
      imagePrompt,
    }: {
      postId: number;
      content?: string;
      imagePrompt?: string;
    }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/campaigns/${id}/posts/${postId}`,
        { content, imagePrompt },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", id] });
      setEditingPostId(null);
      setEditContent("");
      toast({ title: "Post updated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async (postId: number) => {
      await apiRequest("DELETE", `/api/campaigns/${id}/posts/${postId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", id] });
      toast({ title: "Post deleted" });
      if (selectedPostId) setSelectedPostId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const linkPostUrlMutation = useMutation({
    mutationFn: async ({ postId, url }: { postId: number; url: string }) => {
      const res = await apiRequest("POST", `/api/posts/${postId}/link-url`, { url });
      return res.json();
    },
    onSuccess: (data: { success: boolean; metricsNote?: string; metrics?: Record<string, number> | null }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", id, "metrics"] });
      setLinkingPostId(null);
      setLinkUrlInput("");
      if (data.metricsNote) {
        toast({ title: "URL linked", description: data.metricsNote });
      } else if (data.metrics) {
        toast({ title: "URL linked", description: "Post URL saved and initial metrics fetched." });
      } else {
        toast({ title: "URL linked", description: "Post URL saved for metric tracking." });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const schedulePostMutation = useMutation({
    mutationFn: async ({
      postId,
      scheduledAt,
    }: {
      postId: number;
      scheduledAt: string | null;
    }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/campaigns/${id}/posts/${postId}/schedule`,
        { scheduledAt },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", id] });
      toast({ title: "Post schedule updated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const [fbSchedulePostId, setFbSchedulePostId] = useState<number | null>(null);
  const [fbScheduleMessage, setFbScheduleMessage] = useState("");
  const [fbScheduleTime, setFbScheduleTime] = useState("");
  const [fbScheduleImageUrl, setFbScheduleImageUrl] = useState<string | undefined>(undefined);
  const [postingToFbId, setPostingToFbId] = useState<number | null>(null);

  const [igSchedulePostId, setIgSchedulePostId] = useState<number | null>(null);
  const [igScheduleCaption, setIgScheduleCaption] = useState("");
  const [igScheduleTime, setIgScheduleTime] = useState("");
  const [igScheduleImageUrl, setIgScheduleImageUrl] = useState<string | undefined>(undefined);
  const [postingToIgId, setPostingToIgId] = useState<number | null>(null);

  const [liSchedulePostId, setLiSchedulePostId] = useState<number | null>(null);
  const [liScheduleText, setLiScheduleText] = useState("");
  const [liScheduleTime, setLiScheduleTime] = useState("");
  const [liScheduleImageUrl, setLiScheduleImageUrl] = useState<string | undefined>(undefined);
  const [postingToLiId, setPostingToLiId] = useState<number | null>(null);

  const [xSchedulePostId, setXSchedulePostId] = useState<number | null>(null);
  const [xScheduleText, setXScheduleText] = useState("");
  const [xScheduleTime, setXScheduleTime] = useState("");
  const [xScheduleImageUrl, setXScheduleImageUrl] = useState<string | undefined>(undefined);
  const [postingToXId, setPostingToXId] = useState<number | null>(null);

  // Whether each platform's open schedule dialog is for an already-scheduled post.
  // Drives the dialog title and confirm button text ("Reschedule" vs "Schedule").
  const fbIsReschedule = !!fbSchedulePostId && !!data?.posts.find(p => p.id === fbSchedulePostId)?.scheduledAt;
  const igIsReschedule = !!igSchedulePostId && !!data?.posts.find(p => p.id === igSchedulePostId)?.scheduledAt;
  const liIsReschedule = !!liSchedulePostId && !!data?.posts.find(p => p.id === liSchedulePostId)?.scheduledAt;
  const xIsReschedule = !!xSchedulePostId && !!data?.posts.find(p => p.id === xSchedulePostId)?.scheduledAt;

  const { data: fbStatus } = useQuery<{ connected: boolean; pageId?: string; pageName?: string }>({
    queryKey: ["/api/facebook/status"],
  });

  const { data: igStatus } = useQuery<{ connected: boolean; igUserId?: string; igUsername?: string }>({
    queryKey: ["/api/instagram/status"],
  });

  const { data: liStatus } = useQuery<{ connected: boolean; authorUrn?: string; displayName?: string; organizationId?: string; organizationName?: string }>({
    queryKey: ["/api/linkedin/status"],
  });

  const { data: xStatus } = useQuery<{ connected: boolean; xId?: string; xUsername?: string }>({
    queryKey: ["/api/x/status"],
  });

  const fbPostNowMutation = useMutation({
    mutationFn: async ({ message, campaignPostId, imageUrl }: { message: string; campaignPostId: number; imageUrl?: string }) => {
      const res = await apiRequest("POST", "/api/facebook/post-now", { message, campaignPostId, imageUrl });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401 || data.expired) {
          queryClient.invalidateQueries({ queryKey: ["/api/facebook/status"] });
        }
        throw new Error(data.message || "Failed to post to Facebook");
      }
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Posted to Facebook!", description: `Published to ${data.pageName}` });
      setPostingToFbId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Facebook post failed", description: err.message, variant: "destructive" });
      setPostingToFbId(null);
    },
  });

  const fbScheduleMutation = useMutation({
    mutationFn: async ({ message, scheduledAt, campaignPostId, imageUrl }: { message: string; scheduledAt: string; campaignPostId: number; imageUrl?: string }) => {
      const res = await apiRequest("POST", "/api/facebook/schedule", { message, scheduledAt, campaignPostId, imageUrl });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to schedule");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/posts"] });
      toast({ title: "Post scheduled!", description: "Your post has been added to the Facebook queue." });
      setFbSchedulePostId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Scheduling failed", description: err.message, variant: "destructive" });
    },
  });

  const igPostNowMutation = useMutation({
    mutationFn: async ({ caption, imageUrl, campaignPostId }: { caption: string; imageUrl: string; campaignPostId: number }) => {
      const res = await apiRequest("POST", "/api/instagram/post-now", { caption, imageUrl, campaignPostId });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401 || data.expired) {
          queryClient.invalidateQueries({ queryKey: ["/api/instagram/status"] });
          queryClient.invalidateQueries({ queryKey: ["/api/facebook/status"] });
        }
        throw new Error(data.message || "Failed to post to Instagram");
      }
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Posted to Instagram!", description: `Published to @${data.igUsername || "your account"}` });
      setPostingToIgId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Instagram post failed", description: err.message, variant: "destructive" });
      setPostingToIgId(null);
    },
  });

  const igScheduleMutation = useMutation({
    mutationFn: async ({ caption, imageUrl, scheduledAt, campaignPostId }: { caption: string; imageUrl: string; scheduledAt: string; campaignPostId: number }) => {
      const res = await apiRequest("POST", "/api/instagram/schedule", { caption, imageUrl, scheduledAt, campaignPostId });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to schedule");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/posts"] });
      toast({ title: "Instagram post scheduled!", description: "Your post has been added to the queue." });
      setIgSchedulePostId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Scheduling failed", description: err.message, variant: "destructive" });
    },
  });

  const liPostNowMutation = useMutation({
    mutationFn: async ({ text, imageUrl, campaignPostId, postAs }: { text: string; imageUrl?: string; campaignPostId: number; postAs?: string }) => {
      const res = await apiRequest("POST", "/api/linkedin/post-now", { text, imageUrl, campaignPostId, postAs });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401 || data.expired) {
          queryClient.invalidateQueries({ queryKey: ["/api/linkedin/status"] });
        }
        throw new Error(data.message || "Failed to post to LinkedIn");
      }
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Posted to LinkedIn!", description: `Published as ${data.displayName || "your account"}` });
      setPostingToLiId(null);
    },
    onError: (err: Error) => {
      toast({ title: "LinkedIn post failed", description: err.message, variant: "destructive" });
      setPostingToLiId(null);
    },
  });

  const liScheduleMutation = useMutation({
    mutationFn: async ({ text, imageUrl, scheduledAt, campaignPostId, postAs }: { text: string; imageUrl?: string; scheduledAt: string; campaignPostId: number; postAs?: string }) => {
      const res = await apiRequest("POST", "/api/linkedin/schedule", { text, imageUrl, scheduledAt, campaignPostId, postAs });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to schedule");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/posts"] });
      toast({ title: "LinkedIn post scheduled!", description: "Your post has been added to the queue." });
      setLiSchedulePostId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Scheduling failed", description: err.message, variant: "destructive" });
    },
  });

  const xPostNowMutation = useMutation({
    mutationFn: async ({ text, imageUrl, campaignPostId }: { text: string; imageUrl?: string; campaignPostId: number }) => {
      const res = await apiRequest("POST", "/api/x/post-now", { text, imageUrl, campaignPostId });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401 || data.expired) {
          queryClient.invalidateQueries({ queryKey: ["/api/x/status"] });
        }
        throw new Error(data.message || "Failed to post to X");
      }
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Posted to X!", description: `Published as @${data.xUsername || "your account"}` });
      setPostingToXId(null);
    },
    onError: (err: Error) => {
      toast({ title: "X post failed", description: err.message, variant: "destructive" });
      setPostingToXId(null);
    },
  });

  const xScheduleMutation = useMutation({
    mutationFn: async ({ text, imageUrl, scheduledAt, campaignPostId }: { text: string; imageUrl?: string; scheduledAt: string; campaignPostId: number }) => {
      const res = await apiRequest("POST", "/api/x/schedule", { text, imageUrl, scheduledAt, campaignPostId });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to schedule");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/posts"] });
      toast({ title: "X post scheduled!", description: "Your post has been added to the queue." });
      setXSchedulePostId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Scheduling failed", description: err.message, variant: "destructive" });
    },
  });

  const handleRegenerateImage = useCallback(
    async (postId: number, imagePrompt: string) => {
      setIsRegeneratingImage(true);
      try {
        const res = await apiRequest(
          "POST",
          `/api/campaigns/${id}/posts/${postId}/regenerate-image`,
          { imagePrompt },
        );
        await res.json();
        queryClient.invalidateQueries({ queryKey: ["/api/campaigns", id] });
        setIsEditingImagePrompt(false);
        toast({
          title: "Image regenerated",
          description: "New image has been created.",
        });
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setIsRegeneratingImage(false);
      }
    },
    [id, toast],
  );

  const handleGeneratePostImage = useCallback(
    async (postId: number, imagePrompt: string) => {
      setGeneratingImagePostId(postId);
      try {
        const res = await apiRequest(
          "POST",
          `/api/campaigns/${id}/posts/${postId}/regenerate-image`,
          { imagePrompt },
        );
        await res.json();
        queryClient.invalidateQueries({ queryKey: ["/api/campaigns", id] });
        toast({ title: "Image generated" });
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setGeneratingImagePostId(null);
      }
    },
    [id, toast],
  );

  const handleAttachMediaImage = useCallback(
    async (postId: number, imageUrl: string) => {
      try {
        await apiRequest(
          "PATCH",
          `/api/campaigns/${id}/posts/${postId}/attach-image`,
          { imageUrl },
        );
        queryClient.invalidateQueries({ queryKey: ["/api/campaigns", id] });
        setMediaPickerPostId(null);
        toast({ title: "Image added" });
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
    },
    [id, toast],
  );

  const handleRemoveImage = useCallback(
    async (postId: number, imageIndex: number) => {
      try {
        await apiRequest(
          "PATCH",
          `/api/campaigns/${id}/posts/${postId}/remove-image`,
          { imageIndex },
        );
        queryClient.invalidateQueries({ queryKey: ["/api/campaigns", id] });
        toast({ title: "Image removed" });
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
    },
    [id, toast],
  );

  const handleAddPosts = useCallback(
    async (postsCount: number, idea: string, platforms: string[]) => {
      setIsAddingPosts(true);
      setAddPostStatus("Generating post content...");
      try {
        const response = await fetch(`/api/campaigns/${id}/add-posts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            postsCount,
            idea,
            platforms: platforms.length > 0 ? platforms : undefined,
          }),
        });

        if (
          !response.ok &&
          response.headers.get("content-type")?.includes("application/json")
        ) {
          const err = await response.json();
          throw new Error(err.message || "Failed to add posts");
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
                if (event.type === "status") setAddPostStatus(event.message);
                if (event.type === "complete") {
                  queryClient.invalidateQueries({
                    queryKey: ["/api/campaigns", id],
                  });
                  toast({
                    title: "Posts added",
                    description: "New posts have been generated.",
                  });
                }
              } catch {}
            }
          }
        }
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setIsAddingPosts(false);
        setShowAddPost(false);
        setAddPostIdea("");
        setAddPostPlatforms([]);
        setAddPostCount(1);
        setAddPostStatus("");
      }
    },
    [id, toast],
  );

  const postsNeedingImages = useMemo(() => {
    if (!data?.posts) return [];
    return data.posts.filter((p) => p.imagePrompt && !p.imageUrl);
  }, [data?.posts]);

  const handleBatchGenerateImages = useCallback(async () => {
    setIsBatchGenerating(true);
    setBatchProgress({ current: 0, total: 0 });
    let successCount = 0;
    let failCount = 0;
    try {
      const response = await fetch(`/api/campaigns/${id}/generate-images`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok && response.headers.get("content-type")?.includes("application/json")) {
        const err = await response.json();
        throw new Error(err.message || "Failed to generate images");
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
              if (event.type === "start") {
                setBatchProgress({ current: 0, total: event.total });
              }
              if (event.type === "progress" && event.status === "done") {
                successCount++;
                setBatchProgress((prev) => ({ ...prev, current: prev.current + 1 }));
                queryClient.invalidateQueries({ queryKey: ["/api/campaigns", id] });
              }
              if (event.type === "progress" && event.status === "error") {
                failCount++;
                setBatchProgress((prev) => ({ ...prev, current: prev.current + 1 }));
              }
              if (event.type === "complete") {
                queryClient.invalidateQueries({ queryKey: ["/api/campaigns", id] });
                if (failCount === 0) {
                  toast({ title: "Images generated", description: `All ${successCount} images generated successfully.` });
                } else {
                  toast({
                    title: "Partial success",
                    description: `${successCount} image${successCount !== 1 ? "s" : ""} generated, ${failCount} failed.`,
                    variant: "destructive",
                  });
                }
              }
              if (event.type === "quota_exceeded") {
                emitQuotaExceeded({
                  action: event.action,
                  limit: event.limit,
                  current: event.current,
                  label: event.label,
                  tier: event.tier,
                });
              }
              if (event.type === "error") {
                toast({ title: "Error", description: event.message, variant: "destructive" });
              }
            } catch {}
          }
        }
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsBatchGenerating(false);
      setBatchProgress({ current: 0, total: 0 });
    }
  }, [id, toast]);

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <p className="text-muted-foreground">Campaign not found.</p>
        <Button
          variant="outline"
          onClick={() => navigate("/")}
          className="mt-4"
          data-testid="button-back"
        >
          Back to Campaigns
        </Button>
      </div>
    );
  }

  const { campaign, posts } = data;
  const selectedPost = selectedPostId
    ? posts.find((p) => p.id === selectedPostId)
    : null;

  if (selectedPost) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-4">
          <Button
            variant="ghost"
            onClick={() => {
              setSelectedPostId(null);
              setEditingPostId(null);
              setEditContent("");
            }}
            className="gap-2"
            data-testid="button-back-to-posts"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Posts
          </Button>
          {canCustomize && (
            <Button
              onClick={() => setRefiningPostId(selectedPost.id)}
              className="gap-2"
              data-testid="button-refine-open-detail"
            >
              <Sparkles className="w-4 h-4" />
              Refine with AI
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3 mb-6">
          <img
            src={platformIcons[selectedPost.platform]}
            alt={PLATFORM_SETTINGS[selectedPost.platform as PlatformKey]?.label}
            className="w-6 h-6 rounded"
          />
          <h2 className="text-lg font-semibold">
            {selectedPost.postIdentifier || `Post ${posts.indexOf(selectedPost) + 1}`} —{" "}
            {PLATFORM_SETTINGS[selectedPost.platform as PlatformKey]?.label}{" "}
            Preview
          </h2>
          {selectedPost.postIdentifier && (
            <Badge variant="outline" className="font-mono text-xs ml-1" data-testid="badge-selected-post-id">
              {selectedPost.postIdentifier}
            </Badge>
          )}
        </div>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="details" data-testid="tab-post-details">Post Details</TabsTrigger>
            <TabsTrigger value="metrics" data-testid="tab-post-metrics">Post Metrics</TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <h3 className="text-sm font-semibold">Post Content</h3>
                <div className="flex items-center gap-1">
                  {canCustomize && (editingPostId === selectedPost.id ? (
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          updatePostMutation.mutate({
                            postId: selectedPost.id,
                            content: editContent,
                          })
                        }
                        disabled={updatePostMutation.isPending}
                        data-testid={`button-save-post-${selectedPost.id}`}
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
                        data-testid={`button-cancel-post-${selectedPost.id}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeletePostId(selectedPost.id)}
                        disabled={deletePostMutation.isPending}
                        data-testid={`button-delete-selected-post-${selectedPost.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditingPostId(selectedPost.id);
                          setEditContent(selectedPost.content);
                        }}
                        data-testid={`button-edit-post-${selectedPost.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </>
                  ))}
                </div>
              </div>
              {editingPostId === selectedPost.id ? (
                <RichTextEditor
                  content={editContent}
                  onChange={setEditContent}
                  data-testid={`editor-edit-post-${selectedPost.id}`}
                />
              ) : (
                <div
                  className="text-sm leading-relaxed"
                  data-testid={`text-post-content-${selectedPost.id}`}
                >
                  <RichTextContent html={selectedPost.content} />
                </div>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="text-sm font-semibold mb-3">
                Post Images
                {getPostImages(selectedPost).length > 0 && (
                  <span className="text-xs font-normal text-muted-foreground ml-2">
                    ({getPostImages(selectedPost).length} image
                    {getPostImages(selectedPost).length !== 1 ? "s" : ""})
                  </span>
                )}
              </h3>
              {getPostImages(selectedPost).length > 0 && (
                <div className="space-y-3 mb-3">
                  <ImageCarousel
                    images={getPostImages(selectedPost)}
                    showRemove={canCustomize}
                    onRemove={canCustomize ? (index) =>
                      handleRemoveImage(selectedPost.id, index) : undefined}
                  />
                  <div className="flex gap-1.5 flex-wrap">
                    {getPostImages(selectedPost).map((url, i) => (
                      <div
                        key={i}
                        className="relative group/thumb w-14 h-14 rounded-md overflow-hidden border border-border"
                      >
                        <img
                          src={url}
                          alt={`Image ${i + 1}`}
                          className="w-full h-full object-cover"
                          data-testid={`img-thumb-${selectedPost.id}-${i}`}
                        />
                        {canCustomize && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-1 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                setEditingImageUrl(url);
                                setEditingImagePostId(selectedPost.id);
                              }}
                              data-testid={`button-edit-thumb-${selectedPost.id}-${i}`}
                            >
                              <Pencil className="w-3 h-3 text-white" />
                            </button>
                            <button
                              onClick={() =>
                                handleRemoveImage(selectedPost.id, i)
                              }
                              data-testid={`button-remove-thumb-${selectedPost.id}-${i}`}
                            >
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
                {getPostImages(selectedPost).length === 0 &&
                  selectedPost.imagePrompt && (
                    <div className="p-3 rounded-md bg-muted/50">
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        AI Image Prompt
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedPost.imagePrompt}
                      </p>
                    </div>
                  )}
                {canCustomize && (
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      className="gap-2 flex-1"
                      onClick={() =>
                        handleGeneratePostImage(
                          selectedPost.id,
                          selectedPost.imagePrompt || "",
                        )
                      }
                      disabled={
                        generatingImagePostId === selectedPost.id ||
                        isRegeneratingImage ||
                        !selectedPost.imagePrompt
                      }
                      data-testid={`button-generate-ai-${selectedPost.id}`}
                    >
                      {generatingImagePostId === selectedPost.id ||
                      isRegeneratingImage ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />{" "}
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" /> Generate with AI
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 flex-1"
                      onClick={() => setMediaPickerPostId(selectedPost.id)}
                      data-testid={`button-media-picker-${selectedPost.id}`}
                    >
                      <FolderOpen className="w-4 h-4" />
                      Select from Library
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <h3 className="text-sm font-semibold">Image Prompt</h3>
                {canCustomize && (!isEditingImagePrompt ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setIsEditingImagePrompt(true);
                      setEditImagePrompt(selectedPost.imagePrompt || "");
                    }}
                    data-testid={`button-edit-image-prompt-${selectedPost.id}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        updatePostMutation.mutate({
                          postId: selectedPost.id,
                          imagePrompt: editImagePrompt,
                        });
                        setIsEditingImagePrompt(false);
                      }}
                      disabled={updatePostMutation.isPending}
                      data-testid={`button-save-image-prompt-${selectedPost.id}`}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setIsEditingImagePrompt(false);
                        setEditImagePrompt("");
                      }}
                      data-testid={`button-cancel-image-prompt-${selectedPost.id}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              {isEditingImagePrompt ? (
                <Textarea
                  value={editImagePrompt}
                  onChange={(e) => setEditImagePrompt(e.target.value)}
                  className="min-h-[100px]"
                  data-testid={`textarea-edit-image-prompt-${selectedPost.id}`}
                />
              ) : (
                <p
                  className="text-sm text-muted-foreground"
                  data-testid={`text-image-prompt-${selectedPost.id}`}
                >
                  {selectedPost.imagePrompt || "No image prompt"}
                </p>
              )}
            </Card>
          </div>

          <div className="flex flex-col items-center">
            <h3 className="text-sm font-semibold mb-4 self-start">
              {PLATFORM_SETTINGS[selectedPost.platform as PlatformKey]?.label}{" "}
              Preview
            </h3>
            <PlatformPreview
              post={selectedPost}
              platform={selectedPost.platform}
              companyName={campaign.companyName}
            />
          </div>
            </div>

          </TabsContent>

          <TabsContent value="metrics">
        {(() => {
          const pm = postMetricsMap.get(selectedPost.id);
          const fmtNum = (n: number) => {
            if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
            if (n >= 1000) return (n / 1000).toFixed(1) + "K";
            return n.toString();
          };
          const isPublished = !!selectedPost.platformPostId;
          const hasData = !!pm;
          const isLinkedIn = selectedPost.platform === "linkedin";
          const vals = pm
            ? {
                impressions: isLinkedIn ? "—" : fmtNum(pm.impressions),
                reach: isLinkedIn ? "—" : fmtNum(pm.reach),
                likes: fmtNum(pm.likes),
                comments: fmtNum(pm.comments),
                shares: isLinkedIn ? "—" : fmtNum(pm.shares),
                clicks: isLinkedIn ? "—" : fmtNum(pm.clicks),
                engRate: isLinkedIn ? "—" : `${pm.engagementRate}%`,
              }
            : { impressions: "—", reach: "—", likes: "—", comments: "—", shares: "—", clicks: "—", engRate: "—" };

          return (
            <Card className="p-5 mt-6" data-testid={`post-detail-metrics-${selectedPost.id}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                  Performance Metrics
                </h3>
                {isPublished && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-8 text-xs"
                    onClick={handleSyncAllMetrics}
                    disabled={isSyncingMetrics}
                    data-testid={`button-sync-detail-${selectedPost.id}`}
                  >
                    {isSyncingMetrics ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    {isSyncingMetrics ? "Syncing..." : "Sync"}
                  </Button>
                )}
              </div>
              {!isPublished ? (
                <p className="text-sm text-muted-foreground">This post hasn't been published yet. Publish it to start tracking metrics.</p>
              ) : !hasData ? (
                <p className="text-sm text-muted-foreground">No metrics yet. Click <strong>Sync</strong> to fetch the latest data from the platform.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />Impressions</span>
                      <span className="text-xl font-bold">{vals.impressions}</span>
                    </div>
                    <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />Reach</span>
                      <span className="text-xl font-bold">{vals.reach}</span>
                    </div>
                    <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Heart className="w-3.5 h-3.5" />Likes</span>
                      <span className="text-xl font-bold">{vals.likes}</span>
                    </div>
                    <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" />Comments</span>
                      <span className="text-xl font-bold">{vals.comments}</span>
                    </div>
                    <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Share2 className="w-3.5 h-3.5" />Shares</span>
                      <span className="text-xl font-bold">{vals.shares}</span>
                    </div>
                    <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5"><MousePointer className="w-3.5 h-3.5" />Clicks</span>
                      <span className="text-xl font-bold">{vals.clicks}</span>
                    </div>
                    <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40 sm:col-span-2">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" />Engagement Rate</span>
                      <span className="text-xl font-bold">{vals.engRate}</span>
                    </div>
                  </div>
                  {isLinkedIn && (
                    <p className="text-xs text-muted-foreground mt-3 flex items-start gap-1.5">
                      <span className="mt-0.5 shrink-0">ℹ️</span>
                      Impressions, reach, clicks, shares, and engagement rate require LinkedIn Marketing Developer Platform access, which is not currently enabled. Likes and comments are available.
                    </p>
                  )}
                </>
              )}
            </Card>
          );
        })()}
          </TabsContent>
        </Tabs>

        <MediaLibraryPicker
          open={mediaPickerPostId !== null}
          onClose={() => setMediaPickerPostId(null)}
          onSelect={(url) => {
            if (mediaPickerPostId)
              handleAttachMediaImage(mediaPickerPostId, url);
          }}
        />

        {editingImageUrl && editingImagePostId && (
          <ImageEditor
            imageUrl={editingImageUrl}
            open={!!editingImageUrl}
            onClose={() => {
              setEditingImageUrl(null);
              setEditingImagePostId(null);
            }}
            onSave={(_newUrl: string) => {
              queryClient.invalidateQueries({
                queryKey: ["/api/campaigns", id],
              });
              setEditingImageUrl(null);
              setEditingImagePostId(null);
            }}
            context="campaign"
            campaignId={Number(id)}
            postId={editingImagePostId}
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Button
        variant="ghost"
        onClick={() => navigate("/")}
        className="mb-4 gap-2"
        data-testid="button-back-campaigns"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Campaigns
      </Button>

      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex -space-x-2 flex-shrink-0">
              {activePlatforms.map((p: string) => (
                <img
                  key={p}
                  src={platformIcons[p]}
                  alt={PLATFORM_SETTINGS[p as PlatformKey]?.label}
                  className="w-10 h-10 rounded-md border-2 border-background shadow-sm"
                />
              ))}
            </div>
            <div className="min-w-0">
              <h1
                className="text-xl sm:text-2xl font-bold truncate"
                data-testid="text-campaign-title"
              >
                {campaign.companyName}
              </h1>
              <p className="text-muted-foreground text-xs sm:text-sm truncate">
                {campaign.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(() => {
              const scheduledCount = posts.filter((p) => p.scheduledAt).length;
              if (scheduledCount === posts.length && posts.length > 0) {
                return (
                  <Badge variant="default" className="whitespace-nowrap">
                    All Scheduled
                  </Badge>
                );
              } else if (scheduledCount > 0) {
                return (
                  <Badge variant="secondary" className="whitespace-nowrap">
                    {scheduledCount}/{posts.length} Scheduled
                  </Badge>
                );
              }
              return (
                <Badge variant="outline" className="whitespace-nowrap">
                  Draft
                </Badge>
              );
            })()}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-9"
                  data-testid="button-export"
                >
                  <Download className="w-4 h-4" />
                  Export
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => exportPostsToFullCsv(campaign, posts)}
                  data-testid="button-export-csv"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  CSV (All Info)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => exportPostsToCsv(campaign, posts)}
                  data-testid="button-export-agorapulse"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Agora Pulse CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => exportPostsToJson(campaign, posts)}
                  data-testid="button-export-json"
                >
                  <FileJson className="w-4 h-4 mr-2" />
                  JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap border-t pt-4">
          <span className="text-xs font-medium text-muted-foreground mr-1">
            Platforms:
          </span>
          {activePlatforms.map((p: string) => (
            <Badge
              key={p}
              variant="secondary"
              className="whitespace-nowrap flex items-center gap-1.5"
            >
              <img
                src={platformIcons[p]}
                className="w-3 h-3 rounded-full"
                alt=""
              />
              {PLATFORM_SETTINGS[p as PlatformKey]?.label}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Tone</p>
          <p className="text-sm font-medium capitalize" data-testid="text-tone">
            {campaign.tone}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Posts</p>
          <p className="text-sm font-medium" data-testid="text-posts-count">
            {posts.length}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">CTA</p>
          <p className="text-sm font-medium" data-testid="text-cta">
            {campaign.callToAction}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Created</p>
          <p className="text-sm font-medium">
            {new Date(campaign.createdAt).toLocaleDateString()}
          </p>
        </Card>
      </div>

      <Tabs defaultValue="posts" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="posts" data-testid="tab-posts">Posts</TabsTrigger>
          <TabsTrigger value="metrics" data-testid="tab-metrics">
            <BarChart3 className="w-4 h-4 mr-1.5" />
            Metrics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="metrics">
          <CampaignMetricsSection campaignId={Number(id)} posts={posts} />
        </TabsContent>

        <TabsContent value="posts">
          <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">Generated Posts</h2>
        <div className="flex items-center gap-2">
          {canCustomize && (isBatchGenerating || postsNeedingImages.length > 0) && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleBatchGenerateImages}
              disabled={isBatchGenerating}
              data-testid="button-batch-generate-images"
            >
              {isBatchGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {batchProgress.total > 0
                    ? `${batchProgress.current} / ${batchProgress.total}`
                    : "Starting..."}
                </>
              ) : (
                <>
                  <ImageIcon className="w-4 h-4" />
                  Generate All Images
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                    {postsNeedingImages.length}
                  </Badge>
                </>
              )}
            </Button>
          )}
          {posts.some(p => p.platformPostId) && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleSyncAllMetrics}
              disabled={isSyncingMetrics}
              data-testid="button-sync-metrics-posts-tab"
            >
              {isSyncingMetrics ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Sync Metrics
                </>
              )}
            </Button>
          )}
          {canCustomize && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setShowAddPost(!showAddPost)}
              data-testid="button-add-post"
            >
              <Plus className="w-4 h-4" />
              Add Post
            </Button>
          )}
        </div>
      </div>

      {showAddPost && !isAddingPosts && (
        <Card className="p-5 mb-6 space-y-4">
          <h3 className="text-sm font-semibold">Generate More Posts</h3>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Platforms</Label>
              <div className="flex gap-2 flex-wrap">
                {PLATFORMS.map((p) => (
                  <Button
                    key={p}
                    variant={
                      addPostPlatforms.includes(p) ? "default" : "outline"
                    }
                    size="sm"
                    className="gap-2"
                    onClick={() =>
                      setAddPostPlatforms((prev) =>
                        prev.includes(p)
                          ? prev.filter((x) => x !== p)
                          : [...prev, p],
                      )
                    }
                    data-testid={`button-add-post-platform-${p}`}
                  >
                    <img
                      src={platformIcons[p]}
                      className="w-4 h-4 rounded"
                      alt=""
                    />
                    {PLATFORM_SETTINGS[p as PlatformKey]?.label}
                  </Button>
                ))}
              </div>
              {addPostPlatforms.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No platform selected — posts will be generated for all
                  campaign platforms.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Post Idea (optional)</Label>
              <Textarea
                value={addPostIdea}
                onChange={(e) => setAddPostIdea(e.target.value)}
                placeholder="Describe the focus, topic, or angle for the new posts..."
                className="min-h-[100px] resize-y"
                data-testid="input-add-post-idea"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label>
                  How many number of post(s) you want to create against each
                  platform?
                </Label>
                <Badge variant="secondary">{addPostCount}</Badge>
              </div>
              <Slider
                value={[addPostCount]}
                onValueChange={(v) => setAddPostCount(v[0])}
                min={1}
                max={5}
                step={1}
                data-testid="slider-add-post-count"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() =>
                  handleAddPosts(addPostCount, addPostIdea, addPostPlatforms)
                }
                className="gap-2"
                data-testid="button-generate-more-posts"
              >
                <Sparkles className="w-4 h-4" />
                Generate {addPostCount} Post{addPostCount > 1 ? "s" : ""}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowAddPost(false);
                  setAddPostIdea("");
                  setAddPostPlatforms([]);
                }}
                data-testid="button-cancel-add-post"
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {isAddingPosts && (
        <Card className="p-4 mb-6">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <p className="text-sm font-medium">{addPostStatus}</p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {posts.map((post, index) => (
          <Card
            key={post.id}
            className="cursor-pointer overflow-visible hover-elevate flex flex-col h-full"
            onClick={() => setSelectedPostId(post.id)}
            data-testid={`card-post-${post.id}`}
          >
            <div className="p-4 flex flex-col h-full space-y-3">
              <div className="flex items-center gap-2 flex-shrink-0">
                <img
                  src={platformIcons[post.platform]}
                  alt={PLATFORM_SETTINGS[post.platform as PlatformKey]?.label}
                  className="w-5 h-5 rounded"
                />
                <span className="text-xs font-medium text-muted-foreground">
                  {PLATFORM_SETTINGS[post.platform as PlatformKey]?.label}
                </span>
                {post.postIdentifier && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-mono" data-testid={`badge-post-id-${post.id}`}>
                    {post.postIdentifier}
                  </Badge>
                )}
              </div>

              <div
                className="text-sm leading-relaxed line-clamp-4 flex-grow"
                data-testid={`text-post-preview-${post.id}`}
              >
                <RichTextContent html={post.content} />
              </div>

              {getPostImages(post).length > 0 ? (
                <div className="relative flex-shrink-0">
                  <img
                    src={getPostImages(post)[0]}
                    alt={`Post ${index + 1}`}
                    className="w-full h-32 object-cover rounded-md"
                    data-testid={`img-post-thumb-${post.id}`}
                  />
                  {getPostImages(post).length > 1 && (
                    <div className="absolute top-1.5 right-1.5 bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      {getPostImages(post).length}
                    </div>
                  )}
                </div>
              ) : canCustomize ? (
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs w-full h-9 px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (post.imagePrompt)
                        handleGeneratePostImage(post.id, post.imagePrompt);
                    }}
                    disabled={
                      generatingImagePostId === post.id || !post.imagePrompt
                    }
                    data-testid={`button-card-generate-ai-${post.id}`}
                  >
                    {generatingImagePostId === post.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span className="truncate">
                      {generatingImagePostId === post.id
                        ? "Generating..."
                        : "Generate AI"}
                    </span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs w-full h-9 px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMediaPickerPostId(post.id);
                    }}
                    data-testid={`button-card-media-picker-${post.id}`}
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span className="truncate">From Library</span>
                  </Button>
                </div>
              ) : null}

              {post.scheduledAt && (
                <ScheduledPill scheduledAt={post.scheduledAt} platform={post.platform} />
              )}

              {(() => {
                const pm = postMetricsMap.get(post.id);
                const fmtNum = (n: number) => {
                  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
                  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
                  return n.toString();
                };
                if (!post.platformPostId) return null;
                if (!pm) {
                  return (
                    <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-muted/40 text-xs text-muted-foreground flex-shrink-0" data-testid={`metrics-bar-${post.id}`}>
                      <span>Metrics pending — tap to sync</span>
                      <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] gap-1" onClick={(e) => { e.stopPropagation(); handleSyncAllMetrics(); }} disabled={isSyncingMetrics} data-testid={`button-sync-post-${post.id}`}>
                        {isSyncingMetrics ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Sync
                      </Button>
                    </div>
                  );
                }
                return (
                  <div className="flex items-center gap-3 px-2 py-1.5 rounded-md bg-muted/50 text-xs text-muted-foreground flex-shrink-0" data-testid={`metrics-bar-${post.id}`}>
                    <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{fmtNum(pm.impressions)}</span>
                    <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{fmtNum(pm.likes)}</span>
                    <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />{pm.engagementRate}%</span>
                    <span className="ml-auto text-[10px] text-muted-foreground/60">Open for full stats</span>
                  </div>
                );
              })()}

              {(() => {
                const src = post.sources;
                if (!src || (!src.keywords?.length && !src.domains?.length)) return null;
                const allKeywords = src.keywords ?? [];
                const visibleKeywords = allKeywords.slice(0, 5);
                const extraKeywords = allKeywords.length - visibleKeywords.length;

                const angleStyles: Record<string, string> = {
                  "Action-driven": "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/50 dark:border-green-800",
                  "Comparison": "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/50 dark:border-amber-800",
                  "Educational": "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/50 dark:border-blue-800",
                };

                return (
                  <div className="flex flex-col gap-1.5 pt-1 border-t border-border/40 flex-shrink-0" data-testid={`mi-sources-${post.id}`}>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
                      <Sparkles className="w-3 h-3 text-primary/60" />
                      <span>AI sourced from Market Intelligence</span>
                    </div>
                    {visibleKeywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {visibleKeywords.map((entry) => {
                          const isEnriched = typeof entry === "object" && entry !== null;
                          const label = isEnriched ? entry.keyword : entry;
                          const angle = isEnriched ? entry.angle : null;
                          const chipClass = angle ? angleStyles[angle] ?? angleStyles["Educational"] : "text-primary/70 bg-primary/5 border-primary/15";
                          return (
                            <span
                              key={label}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${chipClass}`}
                              data-testid={`mi-keyword-${post.id}`}
                            >
                              {label}
                              {angle && (
                                <span className="opacity-70">· {angle}</span>
                              )}
                            </span>
                          );
                        })}
                        {extraKeywords > 0 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] text-muted-foreground border border-border/60">
                            +{extraKeywords} more
                          </span>
                        )}
                      </div>
                    )}
                    {src.domains?.length > 0 && (
                      <p className="text-[10px] text-muted-foreground leading-relaxed" data-testid={`mi-domains-${post.id}`}>
                        Competitors: {src.domains.join(", ")}
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* URL Linking inline form */}
              {linkingPostId === post.id && (
                <div
                  className="flex items-center gap-1.5 pt-1 flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`link-url-form-${post.id}`}
                >
                  <input
                    type="url"
                    placeholder="https://..."
                    value={linkUrlInput}
                    onChange={(e) => setLinkUrlInput(e.target.value)}
                    className="h-7 flex-1 text-xs rounded-md border border-input bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                    data-testid={`input-link-url-${post.id}`}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && linkUrlInput.trim()) {
                        linkPostUrlMutation.mutate({ postId: post.id, url: linkUrlInput.trim() });
                      } else if (e.key === "Escape") {
                        setLinkingPostId(null);
                        setLinkUrlInput("");
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      if (linkUrlInput.trim()) {
                        linkPostUrlMutation.mutate({ postId: post.id, url: linkUrlInput.trim() });
                      }
                    }}
                    disabled={!linkUrlInput.trim() || linkPostUrlMutation.isPending}
                    data-testid={`button-save-link-url-${post.id}`}
                  >
                    {linkPostUrlMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-1.5 text-xs"
                    onClick={() => { setLinkingPostId(null); setLinkUrlInput(""); }}
                    data-testid={`button-cancel-link-url-${post.id}`}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}

              <div className="flex items-center justify-end gap-1 pt-1 flex-shrink-0 mt-auto">
                {/* Preview — always visible */}
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPostId(post.id);
                  }}
                  data-testid={`button-preview-post-${post.id}`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Preview
                </Button>

                {/* Link URL / Live Post button */}
                {post.platformPostId ? (
                  /* Post was published from the app — show Live Post link if URL is available */
                  post.platformPostUrl ? (
                    <a
                      href={post.platformPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-accent transition-colors"
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`link-post-url-${post.id}`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Live Post
                    </a>
                  ) : null
                ) : (
                  /* Post was NOT published from the app — show Live Post if URL linked, else Link URL button */
                  linkingPostId !== post.id && (
                    post.platformPostUrl ? (
                      <a
                        href={post.platformPostUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-accent transition-colors"
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`link-post-url-${post.id}`}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Live Post
                      </a>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-xs text-muted-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLinkingPostId(post.id);
                          setLinkUrlInput(post.platformPostUrl || "");
                        }}
                        data-testid={`button-link-url-${post.id}`}
                      >
                        <Link className="w-3.5 h-3.5" />
                        Link URL
                      </Button>
                    )
                  )
                )}

                {/* Post Now — only for Facebook posts when connected */}
                {fbStatus?.connected && post.platform === "facebook" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-xs text-[#1877f2] hover:text-[#1877f2] hover:bg-blue-50 dark:hover:bg-blue-950/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPostingToFbId(post.id);
                      const postImageUrl = (post.imageUrls && post.imageUrls.length > 0) ? post.imageUrls[0] : post.imageUrl || undefined;
                      fbPostNowMutation.mutate({ message: post.content.replace(/<[^>]*>/g, ""), campaignPostId: post.id, imageUrl: postImageUrl });
                    }}
                    disabled={postingToFbId === post.id && fbPostNowMutation.isPending}
                    data-testid={`button-fb-post-now-${post.id}`}
                  >
                    {postingToFbId === post.id && fbPostNowMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <SiFacebook className="w-3.5 h-3.5" />
                    )}
                    Post Now
                  </Button>
                )}

                {/* Post Now — only for Instagram posts when connected and image available */}
                {igStatus?.connected && post.platform === "instagram" && (() => {
                  const postImageUrl = (post.imageUrls && post.imageUrls.length > 0) ? post.imageUrls[0] : post.imageUrl || undefined;
                  return (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-xs text-[#E1306C] hover:text-[#E1306C] hover:bg-pink-50 dark:hover:bg-pink-950/20"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!postImageUrl) return;
                        setPostingToIgId(post.id);
                        igPostNowMutation.mutate({ caption: post.content.replace(/<[^>]*>/g, ""), imageUrl: postImageUrl, campaignPostId: post.id });
                      }}
                      disabled={(postingToIgId === post.id && igPostNowMutation.isPending) || !postImageUrl}
                      title={!postImageUrl ? "An image is required to post to Instagram" : undefined}
                      data-testid={`button-ig-post-now-${post.id}`}
                    >
                      {postingToIgId === post.id && igPostNowMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <SiInstagram className="w-3.5 h-3.5" />
                      )}
                      Post Now
                    </Button>
                  );
                })()}

                {/* Post Now — only for LinkedIn posts when connected */}
                {liStatus?.connected && post.platform === "linkedin" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-xs text-[#0077b5] hover:text-[#0077b5] hover:bg-blue-50 dark:hover:bg-blue-950/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPostingToLiId(post.id);
                      const postImageUrl = (post.imageUrls && post.imageUrls.length > 0) ? post.imageUrls[0] : post.imageUrl || undefined;
                      let postAs: string | undefined;
                      try { postAs = localStorage.getItem("linkedin_post_as") || "person"; } catch { postAs = "person"; }
                      liPostNowMutation.mutate({ text: post.content.replace(/<[^>]*>/g, ""), imageUrl: postImageUrl, campaignPostId: post.id, postAs });
                    }}
                    disabled={postingToLiId === post.id && liPostNowMutation.isPending}
                    data-testid={`button-li-post-now-${post.id}`}
                  >
                    {postingToLiId === post.id && liPostNowMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FaLinkedin className="w-3.5 h-3.5" />
                    )}
                    Post Now
                  </Button>
                )}

                {/* Post Now — only for X posts when connected */}
                {xStatus?.connected && post.platform === "x" && (() => {
                  const xText = post.content.replace(/<[^>]*>/g, "");
                  const xOverLimit = xText.length > 280;
                  return (
                    <div className="flex items-center gap-1">
                      <span
                        className={`text-[10px] tabular-nums ${xOverLimit ? "text-destructive font-medium" : "text-muted-foreground"}`}
                        data-testid={`text-x-char-count-${post.id}`}
                      >
                        {xText.length}/280
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-xs text-black hover:text-black hover:bg-gray-100 dark:text-white dark:hover:text-white dark:hover:bg-gray-800"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (xOverLimit) return;
                          setPostingToXId(post.id);
                          const xImageUrl = (post.imageUrls && post.imageUrls.length > 0) ? post.imageUrls[0] : post.imageUrl || undefined;
                          xPostNowMutation.mutate({ text: xText, imageUrl: xImageUrl, campaignPostId: post.id });
                        }}
                        disabled={(postingToXId === post.id && xPostNowMutation.isPending) || xOverLimit}
                        title={xOverLimit ? `Tweet exceeds 280 characters (${xText.length}/280). Edit the post to shorten it.` : undefined}
                        data-testid={`button-x-post-now-${post.id}`}
                      >
                        {postingToXId === post.id && xPostNowMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <SiX className="w-3.5 h-3.5" />
                        )}
                        Post Now
                      </Button>
                    </div>
                  );
                })()}

                {/* 3-dots menu — only render when there is at least one item */}
                {(canCustomize || (fbStatus?.connected && post.platform === "facebook") || (igStatus?.connected && post.platform === "instagram") || (liStatus?.connected && post.platform === "linkedin") || (xStatus?.connected && post.platform === "x")) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`button-more-post-${post.id}`}
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  {(() => {
                    const platformConnected =
                      (post.platform === "facebook" && fbStatus?.connected) ||
                      (post.platform === "instagram" && igStatus?.connected) ||
                      (post.platform === "linkedin" && liStatus?.connected) ||
                      (post.platform === "x" && xStatus?.connected);
                    return (
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    {canCustomize && !platformConnected && (
                      canSchedule ? (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger data-testid={`button-schedule-post-${post.id}`}>
                            <CalendarIcon className="w-3.5 h-3.5 mr-2" />
                            {post.scheduledAt ? "Reschedule" : "Schedule"}
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="p-0">
                            <PostSchedulePicker
                              postId={post.id}
                              currentDate={post.scheduledAt ? new Date(post.scheduledAt) : undefined}
                              onSchedule={(postId, date) => {
                                schedulePostMutation.mutate({ postId, scheduledAt: date.toISOString() });
                              }}
                              onClear={
                                post.scheduledAt
                                  ? (postId) => {
                                      schedulePostMutation.mutate({ postId, scheduledAt: null });
                                    }
                                  : undefined
                              }
                              isPending={schedulePostMutation.isPending}
                            />
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      ) : (
                        <TooltipProvider>
                          <UITooltip>
                            <TooltipTrigger asChild>
                              <div className="relative flex select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground cursor-not-allowed" data-testid={`button-schedule-post-${post.id}`}>
                                <Lock className="w-3.5 h-3.5 mr-2" />
                                Schedule
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              Scheduling requires Professional or higher
                            </TooltipContent>
                          </UITooltip>
                        </TooltipProvider>
                      )
                    )}
                    {canSchedule && fbStatus?.connected && post.platform === "facebook" && (
                      <DropdownMenuItem
                        data-testid={`button-fb-schedule-${post.id}`}
                        onClick={() => {
                          setFbScheduleTime(prefillScheduleTime(post.scheduledAt));
                          setFbScheduleMessage(post.content.replace(/<[^>]*>/g, ""));
                          setFbSchedulePostId(post.id);
                          setFbScheduleImageUrl((post.imageUrls && post.imageUrls.length > 0) ? post.imageUrls[0] : post.imageUrl || undefined);
                        }}
                      >
                        <SiFacebook className="w-3.5 h-3.5 mr-2" />
                        {post.scheduledAt ? "Reschedule FB" : "Schedule FB"}
                      </DropdownMenuItem>
                    )}
                    {canSchedule && igStatus?.connected && post.platform === "instagram" && (() => {
                      const postImageUrl = (post.imageUrls && post.imageUrls.length > 0) ? post.imageUrls[0] : post.imageUrl || undefined;
                      return (
                        <DropdownMenuItem
                          data-testid={`button-ig-schedule-${post.id}`}
                          disabled={!postImageUrl}
                          title={!postImageUrl ? "An image is required to schedule to Instagram" : undefined}
                          onClick={() => {
                            if (!postImageUrl) return;
                            setIgScheduleTime(prefillScheduleTime(post.scheduledAt));
                            setIgScheduleCaption(post.content.replace(/<[^>]*>/g, ""));
                            setIgSchedulePostId(post.id);
                            setIgScheduleImageUrl(postImageUrl);
                          }}
                        >
                          <SiInstagram className="w-3.5 h-3.5 mr-2" />
                          {post.scheduledAt ? "Reschedule IG" : "Schedule IG"}
                        </DropdownMenuItem>
                      );
                    })()}
                    {canSchedule && liStatus?.connected && post.platform === "linkedin" && (
                      <DropdownMenuItem
                        data-testid={`button-li-schedule-${post.id}`}
                        onClick={() => {
                          setLiScheduleTime(prefillScheduleTime(post.scheduledAt));
                          setLiScheduleText(post.content.replace(/<[^>]*>/g, ""));
                          setLiSchedulePostId(post.id);
                          setLiScheduleImageUrl((post.imageUrls && post.imageUrls.length > 0) ? post.imageUrls[0] : post.imageUrl || undefined);
                        }}
                      >
                        <FaLinkedin className="w-3.5 h-3.5 mr-2" />
                        {post.scheduledAt ? "Reschedule LI" : "Schedule LI"}
                      </DropdownMenuItem>
                    )}
                    {canSchedule && xStatus?.connected && post.platform === "x" && (
                      <DropdownMenuItem
                        data-testid={`button-x-schedule-${post.id}`}
                        onClick={() => {
                          setXScheduleTime(prefillScheduleTime(post.scheduledAt));
                          setXScheduleText(post.content.replace(/<[^>]*>/g, "").slice(0, 280));
                          setXScheduleImageUrl((post.imageUrls && post.imageUrls.length > 0) ? post.imageUrls[0] : post.imageUrl || undefined);
                          setXSchedulePostId(post.id);
                        }}
                      >
                        <SiX className="w-3.5 h-3.5 mr-2" />
                        {post.scheduledAt ? "Reschedule X" : "Schedule X"}
                      </DropdownMenuItem>
                    )}
                    {canCustomize && (
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setRefiningPostId(post.id);
                        }}
                        data-testid={`menu-refine-${post.id}`}
                      >
                        <Sparkles className="w-3.5 h-3.5 mr-2" />
                        Refine with AI
                      </DropdownMenuItem>
                    )}
                    {canCustomize && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                          onClick={() => setDeletePostId(post.id)}
                          disabled={deletePostMutation.isPending}
                          data-testid={`button-delete-post-${post.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                    );
                  })()}
                </DropdownMenu>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
          </div>
        </TabsContent>
      </Tabs>

      <MediaLibraryPicker
        open={mediaPickerPostId !== null}
        onClose={() => setMediaPickerPostId(null)}
        onSelect={(url) => {
          if (mediaPickerPostId) handleAttachMediaImage(mediaPickerPostId, url);
        }}
      />

      <AlertDialog open={deletePostId !== null} onOpenChange={(open) => { if (!open) setDeletePostId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Post</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this post? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-post">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-post"
              onClick={() => {
                if (deletePostId) {
                  deletePostMutation.mutate(deletePostId);
                  setDeletePostId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={fbSchedulePostId !== null} onOpenChange={(open) => { if (!open) setFbSchedulePostId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SiFacebook className="w-5 h-5 text-[#1877f2]" />
              {fbIsReschedule ? "Reschedule Facebook Post" : "Schedule Facebook Post"}
            </DialogTitle>
            <DialogDescription>
              {fbStatus?.pageName ? `Posting to: ${fbStatus.pageName}` : "Schedule this post to your connected Facebook Page."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="fb-message">Message</Label>
              <Textarea
                id="fb-message"
                value={fbScheduleMessage}
                onChange={(e) => setFbScheduleMessage(e.target.value)}
                rows={4}
                className="resize-none text-sm"
                placeholder="What would you like to say?"
                data-testid="input-fb-schedule-message"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fb-schedule-time">Schedule Date & Time</Label>
              <Input
                id="fb-schedule-time"
                type="datetime-local"
                value={fbScheduleTime}
                onChange={(e) => setFbScheduleTime(e.target.value)}
                data-testid="input-fb-schedule-time"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFbSchedulePostId(null)} data-testid="button-fb-schedule-cancel">
                Cancel
              </Button>
              <Button
                className="gap-2 bg-[#1877f2] hover:bg-[#166fe5] text-white"
                disabled={!fbScheduleMessage.trim() || !fbScheduleTime || fbScheduleMutation.isPending}
                onClick={() => {
                  if (fbSchedulePostId !== null) {
                    fbScheduleMutation.mutate({
                      message: fbScheduleMessage,
                      scheduledAt: new Date(fbScheduleTime).toISOString(),
                      campaignPostId: fbSchedulePostId,
                      imageUrl: fbScheduleImageUrl,
                    });
                  }
                }}
                data-testid="button-fb-schedule-confirm"
              >
                {fbScheduleMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <SiFacebook className="w-4 h-4" />
                )}
                {fbScheduleMutation.isPending
                  ? (fbIsReschedule ? "Rescheduling..." : "Scheduling...")
                  : (fbIsReschedule ? "Reschedule" : "Schedule")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={igSchedulePostId !== null} onOpenChange={(open) => { if (!open) setIgSchedulePostId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SiInstagram className="w-5 h-5 text-[#E1306C]" />
              {igIsReschedule ? "Reschedule Instagram Post" : "Schedule Instagram Post"}
            </DialogTitle>
            <DialogDescription>
              {igStatus?.igUsername ? `Posting to: @${igStatus.igUsername}` : "Schedule this post to your connected Instagram account."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="ig-caption">Caption</Label>
              <Textarea
                id="ig-caption"
                value={igScheduleCaption}
                onChange={(e) => setIgScheduleCaption(e.target.value)}
                rows={4}
                className="resize-none text-sm"
                placeholder="Write a caption..."
                data-testid="input-ig-schedule-caption"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ig-schedule-time">Schedule Date & Time</Label>
              <Input
                id="ig-schedule-time"
                type="datetime-local"
                value={igScheduleTime}
                onChange={(e) => setIgScheduleTime(e.target.value)}
                data-testid="input-ig-schedule-time"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIgSchedulePostId(null)} data-testid="button-ig-schedule-cancel">
                Cancel
              </Button>
              <Button
                className="gap-2 bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] hover:opacity-90 text-white"
                disabled={!igScheduleCaption.trim() || !igScheduleTime || igScheduleMutation.isPending}
                onClick={() => {
                  if (igSchedulePostId !== null && igScheduleImageUrl) {
                    igScheduleMutation.mutate({
                      caption: igScheduleCaption,
                      imageUrl: igScheduleImageUrl,
                      scheduledAt: new Date(igScheduleTime).toISOString(),
                      campaignPostId: igSchedulePostId,
                    });
                  }
                }}
                data-testid="button-ig-schedule-confirm"
              >
                {igScheduleMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <SiInstagram className="w-4 h-4" />
                )}
                {igScheduleMutation.isPending
                  ? (igIsReschedule ? "Rescheduling..." : "Scheduling...")
                  : (igIsReschedule ? "Reschedule" : "Schedule")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={xSchedulePostId !== null} onOpenChange={(open) => { if (!open) setXSchedulePostId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SiX className="w-5 h-5" />
              {xIsReschedule ? "Reschedule X Post" : "Schedule X Post"}
            </DialogTitle>
            <DialogDescription>
              {xStatus?.xUsername ? `Posting as: @${xStatus.xUsername}` : "Schedule this post to your connected X account."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="x-text">Tweet Text</Label>
                <span className={`text-xs ${xScheduleText.length > 280 ? "text-destructive" : "text-muted-foreground"}`}>
                  {xScheduleText.length}/280
                </span>
              </div>
              <Textarea
                id="x-text"
                value={xScheduleText}
                onChange={(e) => setXScheduleText(e.target.value)}
                rows={4}
                className="resize-none text-sm"
                placeholder="What's happening?"
                maxLength={280}
                data-testid="input-x-schedule-text"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="x-schedule-time">Schedule Date & Time</Label>
              <Input
                id="x-schedule-time"
                type="datetime-local"
                value={xScheduleTime}
                onChange={(e) => setXScheduleTime(e.target.value)}
                data-testid="input-x-schedule-time"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setXSchedulePostId(null)} data-testid="button-x-schedule-cancel">
                Cancel
              </Button>
              <Button
                className="gap-2 bg-black hover:bg-gray-900 text-white"
                disabled={!xScheduleText.trim() || xScheduleText.length > 280 || !xScheduleTime || xScheduleMutation.isPending}
                onClick={() => {
                  if (xSchedulePostId !== null) {
                    xScheduleMutation.mutate({
                      text: xScheduleText,
                      imageUrl: xScheduleImageUrl,
                      scheduledAt: new Date(xScheduleTime).toISOString(),
                      campaignPostId: xSchedulePostId,
                    });
                  }
                }}
                data-testid="button-x-schedule-confirm"
              >
                {xScheduleMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <SiX className="w-4 h-4" />
                )}
                {xScheduleMutation.isPending
                  ? (xIsReschedule ? "Rescheduling..." : "Scheduling...")
                  : (xIsReschedule ? "Reschedule" : "Schedule")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={liSchedulePostId !== null} onOpenChange={(open) => { if (!open) setLiSchedulePostId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FaLinkedin className="w-5 h-5 text-[#0077b5]" />
              {liIsReschedule ? "Reschedule LinkedIn Post" : "Schedule LinkedIn Post"}
            </DialogTitle>
            <DialogDescription>
              {liStatus?.displayName ? `Posting as: ${liStatus.displayName}` : "Schedule this post to your connected LinkedIn account."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="li-text">Post Text</Label>
              <Textarea
                id="li-text"
                value={liScheduleText}
                onChange={(e) => setLiScheduleText(e.target.value)}
                rows={4}
                className="resize-none text-sm"
                placeholder="Write a post..."
                data-testid="input-li-schedule-text"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="li-schedule-time">Schedule Date & Time</Label>
              <Input
                id="li-schedule-time"
                type="datetime-local"
                value={liScheduleTime}
                onChange={(e) => setLiScheduleTime(e.target.value)}
                data-testid="input-li-schedule-time"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLiSchedulePostId(null)} data-testid="button-li-schedule-cancel">
                Cancel
              </Button>
              <Button
                className="gap-2 bg-[#0077b5] hover:bg-[#006097] text-white"
                disabled={!liScheduleText.trim() || !liScheduleTime || liScheduleMutation.isPending}
                onClick={() => {
                  if (liSchedulePostId !== null) {
                    let postAs: string | undefined;
                    try { postAs = localStorage.getItem("linkedin_post_as") || "person"; } catch { postAs = "person"; }
                    liScheduleMutation.mutate({
                      text: liScheduleText,
                      imageUrl: liScheduleImageUrl,
                      scheduledAt: new Date(liScheduleTime).toISOString(),
                      campaignPostId: liSchedulePostId,
                      postAs,
                    });
                  }
                }}
                data-testid="button-li-schedule-confirm"
              >
                {liScheduleMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FaLinkedin className="w-4 h-4" />
                )}
                {liScheduleMutation.isPending
                  ? (liIsReschedule ? "Rescheduling..." : "Scheduling...")
                  : (liIsReschedule ? "Reschedule" : "Schedule")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {refiningPostId !== null && (() => {
        const refiningPost = posts.find((p) => p.id === refiningPostId);
        if (!refiningPost) return null;
        return (
          <RefinePostDialog
            open={refiningPostId !== null}
            onOpenChange={(o) => { if (!o) setRefiningPostId(null); }}
            campaignId={id}
            post={refiningPost}
          />
        );
      })()}
    </div>
  );
}
