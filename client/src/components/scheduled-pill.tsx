import { CalendarClock } from "lucide-react";

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  x: "X",
  twitter: "X",
  instagram: "Instagram",
  facebook: "Facebook",
};

export function ScheduledPill({
  scheduledAt,
  platform,
}: {
  scheduledAt: Date | string;
  platform?: string | null;
}) {
  const when = new Date(scheduledAt);
  const platformLabel = platform ? PLATFORM_LABELS[platform.toLowerCase()] ?? null : null;
  const date = when.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-medium"
      data-testid="scheduled-pill"
    >
      <CalendarClock className="w-3.5 h-3.5 flex-shrink-0" />
      <span>
        {platformLabel ? `Scheduled to ${platformLabel}` : "Scheduled"} · {date} at {time}
      </span>
    </div>
  );
}
