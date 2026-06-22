import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuota } from "@/hooks/use-quota";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  GripVertical,
  LayoutGrid,
  List,
  Columns3,
  Lock,
} from "lucide-react";
import { PLATFORM_SETTINGS, type Campaign, type CampaignPost, type PlatformKey } from "@shared/schema";
import { RichTextContent, stripHtml } from "@/components/rich-text-editor";
import { PostDetailDialog } from "@/components/post-detail-dialog";
import fbIcon from "@assets/fb_1771492183119.png";
import instIcon from "@assets/inst_1771492183120.png";
import linkedinIcon from "@assets/linkedin_1771492183122.png";
import xIcon from "@assets/x_1771492183122.png";

function getPostImages(post: CampaignPost): string[] {
  if (post.imageUrls && post.imageUrls.length > 0) return post.imageUrls;
  if (post.imageUrl) return [post.imageUrl];
  return [];
}

const platformIcons: Record<string, string> = {
  linkedin: linkedinIcon,
  x: xIcon,
  instagram: instIcon,
  facebook: fbIcon,
};

const CAMPAIGN_COLORS = [
  { bg: "rgba(139, 92, 246, 0.12)", border: "rgb(139, 92, 246)", text: "rgb(109, 62, 216)" },
  { bg: "rgba(59, 130, 246, 0.12)", border: "rgb(59, 130, 246)", text: "rgb(37, 99, 235)" },
  { bg: "rgba(16, 185, 129, 0.12)", border: "rgb(16, 185, 129)", text: "rgb(5, 150, 105)" },
  { bg: "rgba(245, 158, 11, 0.12)", border: "rgb(245, 158, 11)", text: "rgb(217, 119, 6)" },
  { bg: "rgba(239, 68, 68, 0.12)", border: "rgb(239, 68, 68)", text: "rgb(220, 38, 38)" },
  { bg: "rgba(236, 72, 153, 0.12)", border: "rgb(236, 72, 153)", text: "rgb(219, 39, 119)" },
  { bg: "rgba(6, 182, 212, 0.12)", border: "rgb(6, 182, 212)", text: "rgb(8, 145, 178)" },
  { bg: "rgba(251, 191, 36, 0.12)", border: "rgb(251, 191, 36)", text: "rgb(180, 83, 9)" },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type ViewMode = "month" | "week" | "day";

type CalendarPost = {
  post: CampaignPost;
  campaign: Campaign;
  date: Date;
  postIndex: number;
  totalPosts: number;
  colorIdx: number;
};

function getPostDate(post: CampaignPost, campaign: Campaign): Date {
  if (post.scheduledAt) return new Date(post.scheduledAt);
  const startDate = campaign.scheduledAt
    ? new Date(campaign.scheduledAt)
    : new Date(campaign.createdAt);
  const date = new Date(startDate);
  date.setDate(date.getDate() + post.order);
  return date;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getWeekStart(d: Date) {
  const result = new Date(d);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export default function CalendarPage() {
  const { toast } = useToast();
  const { canSchedule } = useQuota();
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("all");
  const [previewPost, setPreviewPost] = useState<CalendarPost | null>(null);
  const [draggedPost, setDraggedPost] = useState<CalendarPost | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const { data: calendarData, isLoading } = useQuery<{ campaign: Campaign; posts: CampaignPost[] }[]>({
    queryKey: ["/api/calendar/posts"],
  });

  const scheduleMutation = useMutation({
    mutationFn: async ({ campaignId, postId, scheduledAt }: { campaignId: number; postId: number; scheduledAt: string }) => {
      const res = await apiRequest("PATCH", `/api/campaigns/${campaignId}/posts/${postId}/schedule`, { scheduledAt });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/posts"] });
      toast({ title: "Post rescheduled" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to reschedule", description: err.message, variant: "destructive" });
    },
  });


  const campaigns = useMemo(() => {
    if (!calendarData) return [];
    return calendarData.map((d) => d.campaign);
  }, [calendarData]);

  const campaignColorMap = useMemo(() => {
    const map = new Map<number, number>();
    campaigns.forEach((c, i) => map.set(c.id, i % CAMPAIGN_COLORS.length));
    return map;
  }, [campaigns]);

  const calendarPosts = useMemo(() => {
    if (!calendarData) return [];
    const result: CalendarPost[] = [];
    calendarData.forEach(({ campaign, posts }) => {
      if (selectedCampaignId !== "all" && campaign.id !== parseInt(selectedCampaignId)) return;
      posts.forEach((post, idx) => {
        result.push({
          post,
          campaign,
          date: getPostDate(post, campaign),
          postIndex: idx,
          totalPosts: posts.length,
          colorIdx: campaignColorMap.get(campaign.id) ?? 0,
        });
      });
    });
    return result;
  }, [calendarData, selectedCampaignId, campaignColorMap]);

  const postsByDate = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    calendarPosts.forEach((cp) => {
      const key = dateKey(cp.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(cp);
    });
    return map;
  }, [calendarPosts]);

  const navigatePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === "month") d.setMonth(d.getMonth() - 1);
    else if (viewMode === "week") d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const navigateNext = () => {
    const d = new Date(currentDate);
    if (viewMode === "month") d.setMonth(d.getMonth() + 1);
    else if (viewMode === "week") d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const goToToday = () => {
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  };

  const getHeaderLabel = () => {
    if (viewMode === "month") return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    if (viewMode === "week") {
      const weekStart = getWeekStart(currentDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      if (weekStart.getMonth() === weekEnd.getMonth()) {
        return `${SHORT_MONTHS[weekStart.getMonth()]} ${weekStart.getDate()} - ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
      }
      return `${SHORT_MONTHS[weekStart.getMonth()]} ${weekStart.getDate()} - ${SHORT_MONTHS[weekEnd.getMonth()]} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
    }
    return `${FULL_DAYS[currentDate.getDay()]}, ${SHORT_MONTHS[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
  };

  const handleDragStart = useCallback((e: React.DragEvent, cp: CalendarPost) => {
    setDraggedPost(cp);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(cp.post.id));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, dayKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDate(dayKey);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverDate(null);
  }, []);

  const handleDropOnDate = useCallback(
    (e: React.DragEvent, targetDate: Date) => {
      e.preventDefault();
      setDragOverDate(null);
      if (!draggedPost) return;
      if (!canSchedule) {
        setDraggedPost(null);
        toast({
          title: "Scheduling not available",
          description: "Upgrade to Professional or higher to schedule posts.",
          variant: "destructive",
        });
        return;
      }
      const newDate = new Date(targetDate);
      newDate.setHours(9, 0, 0, 0);
      const existingScheduledAt = draggedPost.post.scheduledAt;
      if (existingScheduledAt) {
        const old = new Date(existingScheduledAt);
        newDate.setHours(old.getHours(), old.getMinutes(), old.getSeconds());
      }
      scheduleMutation.mutate({
        campaignId: draggedPost.campaign.id,
        postId: draggedPost.post.id,
        scheduledAt: newDate.toISOString(),
      });
      setDraggedPost(null);
    },
    [draggedPost, scheduleMutation, canSchedule, toast]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedPost(null);
    setDragOverDate(null);
  }, []);

  const PostChipCompact = ({ cp }: { cp: CalendarPost }) => {
    const colors = CAMPAIGN_COLORS[cp.colorIdx];
    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, cp)}
        onDragEnd={handleDragEnd}
        onClick={() => setPreviewPost(cp)}
        className="group flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs cursor-pointer transition-all"
        style={{
          backgroundColor: colors.bg,
          borderLeft: `3px solid ${colors.border}`,
        }}
        data-testid={`post-chip-${cp.post.id}`}
      >
        <GripVertical className="hidden sm:block w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 invisible group-hover:visible" />
        <img
          src={platformIcons[cp.post.platform]}
          alt={cp.post.platform}
          className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-sm flex-shrink-0"
        />
        <span className="truncate font-medium" style={{ color: colors.text }}>
          {(() => { const t = stripHtml(cp.post.content); return t.slice(0, 35) + (t.length > 35 ? "..." : ""); })()}
        </span>
      </div>
    );
  };

  const PostCardExpanded = ({ cp }: { cp: CalendarPost }) => {
    const colors = CAMPAIGN_COLORS[cp.colorIdx];
    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, cp)}
        onDragEnd={handleDragEnd}
        onClick={() => setPreviewPost(cp)}
        className="group cursor-pointer rounded-md border transition-all hover-elevate"
        style={{ borderLeftWidth: "4px", borderLeftColor: colors.border }}
        data-testid={`post-card-${cp.post.id}`}
      >
        <div className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <img
              src={platformIcons[cp.post.platform]}
              alt={cp.post.platform}
              className="w-5 h-5 rounded-sm flex-shrink-0"
            />
            <span className="text-xs font-semibold" style={{ color: colors.text }}>
              {PLATFORM_SETTINGS[cp.post.platform as PlatformKey]?.label}
            </span>
            <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(cp.date)}
            </span>
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity invisible group-hover:visible flex-shrink-0" />
          </div>
          <div className="text-sm leading-relaxed line-clamp-3">
            <RichTextContent html={cp.post.content} />
          </div>
          {getPostImages(cp.post).length > 0 && (
            <div className="mt-2 relative">
              <img
                src={getPostImages(cp.post)[0]}
                alt="Post"
                className="w-full h-20 object-cover rounded"
              />
              {getPostImages(cp.post).length > 1 && (
                <div className="absolute top-1 right-1 bg-black/60 text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full">
                  +{getPostImages(cp.post).length - 1}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colors.border }} />
            <span className="text-xs text-muted-foreground truncate">
              {cp.campaign.companyName}
            </span>
            <span className="text-xs text-muted-foreground ml-auto">
              {cp.postIndex + 1}/{cp.totalPosts}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const MonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    return (
      <>
        <div className="grid grid-cols-7 border-b">
          {DAYS_OF_WEEK.map((day) => (
            <div key={day} className="px-2 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`e-${i}`} className="min-h-[80px] sm:min-h-[110px] border-b border-r bg-muted/10" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const d = new Date(year, month, day);
            const key = dateKey(d);
            const dayPosts = postsByDate.get(key) || [];
            const isDragOver = dragOverDate === key;
            const isCurrentDay = isSameDay(d, today);

            return (
              <div
                key={day}
                className={`min-h-[80px] sm:min-h-[110px] border-b border-r p-1.5 transition-colors ${isDragOver ? "bg-primary/10 ring-1 ring-inset ring-primary/30" : ""}`}
                onDragOver={(e) => handleDragOver(e, key)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDropOnDate(e, d)}
                data-testid={`cell-day-${day}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-medium w-7 h-7 flex items-center justify-center rounded-full ${
                      isCurrentDay
                        ? "bg-primary text-primary-foreground font-bold"
                        : "text-muted-foreground"
                    }`}
                  >
                    {day}
                  </span>
                  {dayPosts.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {dayPosts.length} post{dayPosts.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {dayPosts.slice(0, 3).map((cp) => (
                    <PostChipCompact key={cp.post.id} cp={cp} />
                  ))}
                  {dayPosts.length > 3 && (
                    <button
                      onClick={() => {
                        setCurrentDate(d);
                        setViewMode("day");
                      }}
                      className="text-[10px] text-primary font-medium pl-2 cursor-pointer"
                      data-testid={`btn-more-${day}`}
                    >
                      +{dayPosts.length - 3} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {(() => {
            const totalCells = firstDay + daysInMonth;
            const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
            return Array.from({ length: remaining }).map((_, i) => (
              <div key={`t-${i}`} className="min-h-[80px] sm:min-h-[110px] border-b border-r bg-muted/10" />
            ));
          })()}
        </div>
      </>
    );
  };

  const WeekView = () => {
    const weekStart = getWeekStart(currentDate);
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });

    return (
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 border-b">
            {weekDays.map((d, i) => {
              const isCurrentDay = isSameDay(d, today);
              return (
                <div
                  key={i}
                  className="px-2 py-3 text-center border-r last:border-r-0"
                >
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    {DAYS_OF_WEEK[d.getDay()]}
                  </div>
                  <button
                    onClick={() => { setCurrentDate(d); setViewMode("day"); }}
                    className={`text-lg font-bold w-9 h-9 rounded-full mx-auto flex items-center justify-center transition-colors ${
                      isCurrentDay
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground"
                    }`}
                    data-testid={`week-day-${d.getDate()}`}
                  >
                    {d.getDate()}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-7">
            {weekDays.map((d, i) => {
              const key = dateKey(d);
              const dayPosts = postsByDate.get(key) || [];
              const isDragOver = dragOverDate === key;

              return (
                <div
                  key={i}
                  className={`min-h-[400px] border-r last:border-r-0 p-2 transition-colors ${isDragOver ? "bg-primary/10 ring-1 ring-inset ring-primary/30" : ""}`}
                  onDragOver={(e) => handleDragOver(e, key)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDropOnDate(e, d)}
                >
                  <div className="space-y-2">
                    {dayPosts.map((cp) => (
                      <PostCardExpanded key={cp.post.id} cp={cp} />
                    ))}
                    {dayPosts.length === 0 && (
                      <div className="text-xs text-muted-foreground text-center pt-8">
                        No posts
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const DayView = () => {
    const key = dateKey(currentDate);
    const dayPosts = postsByDate.get(key) || [];
    const isDragOver = dragOverDate === key;
    const isCurrentDay = isSameDay(currentDate, today);

    return (
      <div
        className={`p-4 sm:p-6 min-h-[400px] sm:min-h-[500px] transition-colors ${isDragOver ? "bg-primary/10" : ""}`}
        onDragOver={(e) => handleDragOver(e, key)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDropOnDate(e, currentDate)}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className={`text-3xl font-bold w-14 h-14 rounded-full flex items-center justify-center ${isCurrentDay ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
            {currentDate.getDate()}
          </div>
          <div>
            <div className="text-lg font-semibold">
              {FULL_DAYS[currentDate.getDay()]}
            </div>
            <div className="text-sm text-muted-foreground">
              {SHORT_MONTHS[currentDate.getMonth()]} {currentDate.getDate()}, {currentDate.getFullYear()}
              {dayPosts.length > 0 && ` \u00b7 ${dayPosts.length} post${dayPosts.length > 1 ? "s" : ""} scheduled`}
            </div>
          </div>
        </div>

        {dayPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Clock className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">No posts scheduled for this day</p>
            <p className="text-muted-foreground text-xs mt-1">Drag posts here to schedule them</p>
          </div>
        ) : (
          <div className="grid gap-3 max-w-2xl">
            {dayPosts.map((cp) => {
              const colors = CAMPAIGN_COLORS[cp.colorIdx];
              return (
                <div
                  key={cp.post.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, cp)}
                  onDragEnd={handleDragEnd}
                  onClick={() => setPreviewPost(cp)}
                  className="group cursor-pointer rounded-md border transition-all hover-elevate"
                  style={{ borderLeftWidth: "4px", borderLeftColor: colors.border }}
                  data-testid={`day-post-${cp.post.id}`}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      {getPostImages(cp.post).length > 0 && (
                        <div className="relative w-24 h-24 flex-shrink-0">
                          <img
                            src={getPostImages(cp.post)[0]}
                            alt="Post"
                            className="w-24 h-24 object-cover rounded-md"
                          />
                          {getPostImages(cp.post).length > 1 && (
                            <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full">
                              +{getPostImages(cp.post).length - 1}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge variant="secondary" data-testid={`badge-platform-${cp.post.id}`}>
                            <img
                              src={platformIcons[cp.post.platform]}
                              alt={cp.post.platform}
                              className="w-4 h-4 rounded-sm mr-1"
                            />
                            {PLATFORM_SETTINGS[cp.post.platform as PlatformKey]?.label}
                          </Badge>
                          <Badge variant="outline" data-testid={`badge-post-number-${cp.post.id}`}>
                            Post {cp.postIndex + 1} of {cp.totalPosts}
                          </Badge>
                          <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1" data-testid={`text-time-${cp.post.id}`}>
                            <Clock className="w-3 h-3" />
                            {formatTime(cp.date)}
                          </span>
                          <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity invisible group-hover:visible flex-shrink-0" />
                        </div>
                        <div className="text-sm leading-relaxed line-clamp-3 mb-2" data-testid={`text-post-content-${cp.post.id}`}>
                          <RichTextContent html={cp.post.content} />
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colors.border }} />
                          <span className="text-xs text-muted-foreground" data-testid={`text-campaign-name-${cp.post.id}`}>
                            {cp.campaign.companyName}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-[600px] w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold" data-testid="text-calendar-title">Calendar</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Schedule and manage your campaign posts</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
          <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
            <SelectTrigger className="w-full sm:w-[220px]" data-testid="select-campaign-filter">
              <SelectValue placeholder="All Campaigns" />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4} className="z-[9999]">
              <SelectItem value="all" data-testid="select-campaign-all">All Campaigns</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={String(c.id)} data-testid={`select-campaign-${c.id}`}>
                  {c.companyName} - {c.platforms?.map((p: string) => PLATFORM_SETTINGS[p as PlatformKey]?.label).filter(Boolean).join(", ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!canSchedule && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300" data-testid="banner-scheduling-locked">
          <Lock className="w-4 h-4 shrink-0" />
          <span>
            <strong>Scheduling is locked</strong> on the Trial plan. Drag-and-drop and date assignment are disabled.{" "}
            <a href="/subscribe" className="underline font-medium">Upgrade to Professional</a> to unlock full scheduling.
          </span>
        </div>
      )}

      <Card className="overflow-visible">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 sm:px-4 py-3 border-b">
          <div className="flex items-center gap-1 w-full sm:w-auto">
            <Button size="icon" variant="ghost" onClick={navigatePrev} data-testid="button-prev">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h2 className="text-sm sm:text-base font-semibold flex-1 sm:flex-initial min-w-0 sm:min-w-[200px] text-center" data-testid="text-current-period">
              {getHeaderLabel()}
            </h2>
            <Button size="icon" variant="ghost" onClick={navigateNext} data-testid="button-next">
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday} className="ml-2" data-testid="button-today">
              Today
            </Button>
          </div>

          <div className="flex items-center rounded-md border p-0.5 gap-0.5 w-full sm:w-auto">
            <Button
              size="sm"
              variant={viewMode === "month" ? "default" : "ghost"}
              onClick={() => setViewMode("month")}
              className="gap-1.5 flex-1 sm:flex-initial"
              data-testid="button-view-month"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Month
            </Button>
            <Button
              size="sm"
              variant={viewMode === "week" ? "default" : "ghost"}
              onClick={() => setViewMode("week")}
              className="gap-1.5 flex-1 sm:flex-initial"
              data-testid="button-view-week"
            >
              <Columns3 className="w-3.5 h-3.5" />
              Week
            </Button>
            <Button
              size="sm"
              variant={viewMode === "day" ? "default" : "ghost"}
              onClick={() => setViewMode("day")}
              className="gap-1.5 flex-1 sm:flex-initial"
              data-testid="button-view-day"
            >
              <List className="w-3.5 h-3.5" />
              Day
            </Button>
          </div>
        </div>

        {viewMode === "month" && <MonthView />}
        {viewMode === "week" && <WeekView />}
        {viewMode === "day" && <DayView />}
      </Card>

      {campaigns.length > 0 && (
        <div className="flex items-center gap-4 mt-4 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium">Campaigns:</span>
          {campaigns
            .filter((c) => selectedCampaignId === "all" || c.id === parseInt(selectedCampaignId))
            .map((c) => {
              const colors = CAMPAIGN_COLORS[campaignColorMap.get(c.id) ?? 0];
              return (
                <div key={c.id} className="flex items-center gap-1.5 text-xs">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.border }} />
                  <span className="text-muted-foreground">
                    {c.companyName} ({c.platforms?.map((p: string) => PLATFORM_SETTINGS[p as PlatformKey]?.label).filter(Boolean).join(", ")})
                  </span>
                </div>
              );
            })}
        </div>
      )}

      {previewPost && (
        <PostDetailDialog
          open={previewPost !== null}
          onClose={() => setPreviewPost(null)}
          post={previewPost.post}
          campaign={previewPost.campaign}
          postIndex={previewPost.postIndex}
          totalPosts={previewPost.totalPosts}
          additionalInvalidateKeys={[["/api/calendar/posts"]]}
        />
      )}
    </div>
  );
}
