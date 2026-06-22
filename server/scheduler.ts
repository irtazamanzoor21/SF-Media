import { storage } from "./storage";
import { sendApprovalReminderEmail } from "./email";
import type { ReminderFrequency } from "@shared/schema";

const APPROVAL_LEASE_MS = 55 * 60 * 1000;        // 55m (vs 60m tick)

function reminderLog(msg: string) {
  const t = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
  console.log(`${t} [approval-reminder] ${msg}`);
}

const FREQUENCY_MS: Record<ReminderFrequency, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

const FREQUENCY_WINDOW_LABEL: Record<ReminderFrequency, string> = {
  daily: "in the next 24 hours",
  weekly: "in the next 7 days",
  monthly: "in the next 30 days",
};

function getAppBaseUrl(): string {
  const raw = process.env.APP_URL || process.env.APP_BASE_URL || "http://localhost:5000";
  let base = raw.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  return base;
}

export async function runApprovalReminders() {
  try {
    const claimed = await storage.tryClaimSchedulerLease("approval-reminder", APPROVAL_LEASE_MS);
    if (!claimed) {
      reminderLog("Skipping tick — another instance ran recently (lease not acquired)");
      return;
    }
    const orgs = await storage.listAllOrganizations();
    const now = new Date();
    const baseUrl = getAppBaseUrl();

    for (const org of orgs) {
      if (org.accountStatus === "deleted" || org.accountStatus === "suspended") continue;

      const admins = await storage.getOrgAdminsForReminders(org.id);
      if (admins.length === 0) continue;

      for (const admin of admins) {
        const enabled = admin.prefs?.approvalRemindersEnabled ?? true;
        if (!enabled) continue;

        const rawFreq = admin.prefs?.approvalReminderFrequency ?? "weekly";
        const frequency = (["daily", "weekly", "monthly"].includes(rawFreq) ? rawFreq : "weekly") as ReminderFrequency;
        const windowMs = FREQUENCY_MS[frequency];

        const last = admin.prefs?.approvalReminderLastSentAt
          ? new Date(admin.prefs.approvalReminderLastSentAt).getTime()
          : 0;
        if (now.getTime() - last < windowMs) continue;

        const windowEnd = new Date(now.getTime() + windowMs);
        const posts = await storage.getUpcomingScheduledPostsForOrg(org.id, now, windowEnd);

        if (posts.length === 0) {
          await storage.upsertNotificationPreferences(admin.userId, org.id, {
            approvalReminderLastSentAt: now,
          });
          continue;
        }

        try {
          await sendApprovalReminderEmail({
            toEmail: admin.email,
            fullName: admin.fullName,
            organizationName: org.name,
            frequency,
            windowLabel: FREQUENCY_WINDOW_LABEL[frequency],
            posts: posts.map((p) => ({
              id: p.id,
              content: p.content,
              platform: p.platform,
              scheduledAt: p.scheduledAt,
              campaignName: p.campaignName,
              detailUrl: p.campaignId
                ? `${baseUrl}/campaigns/${p.campaignId}`
                : `${baseUrl}/scheduled-posts`,
            })),
            preferencesUrl: `${baseUrl}/settings`,
          });
          await storage.upsertNotificationPreferences(admin.userId, org.id, {
            approvalReminderLastSentAt: now,
          });
          reminderLog(`Sent ${frequency} reminder (${posts.length} post${posts.length === 1 ? "" : "s"}) to ${admin.email} (org #${org.id})`);
        } catch (e: any) {
          reminderLog(`Failed to send ${frequency} reminder to ${admin.email}: ${e.message}`);
        }
      }
    }
  } catch (e: any) {
    reminderLog(`Error during approval reminder tick: ${e.message}`);
  }
}

export function startApprovalReminderScheduler() {
  const INTERVAL_MS = 60 * 60 * 1000;
  reminderLog("Approval reminder scheduler started (runs every 60 minutes)");
  runApprovalReminders();
  setInterval(runApprovalReminders, INTERVAL_MS);
}
