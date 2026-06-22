import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { getUserOrgContext } from "./permissions";

const FB_API_VERSION = "v19.0";
const FB_GRAPH_BASE = `https://graph.facebook.com/${FB_API_VERSION}`;

async function igPost(path: string, accessToken: string, body: Record<string, string>): Promise<any> {
  const params = new URLSearchParams({ ...body, access_token: accessToken });
  const url = `${FB_GRAPH_BASE}${path}?${params.toString()}`;
  const res = await fetch(url, { method: "POST" });
  return res.json();
}

async function igGet(path: string, accessToken: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${FB_GRAPH_BASE}${path}`);
  url.searchParams.set("access_token", accessToken);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  return res.json();
}

type IgPostResult = { success: boolean; postId?: string; permalink?: string; error?: string; errorCode?: string };

// Poll the media container until Meta finishes ingesting the image (status FINISHED).
// Meta's Content Publishing API requires FINISHED before media_publish can succeed.
async function waitForContainer(
  containerId: string,
  accessToken: string,
  maxAttempts = 15,
  intervalMs = 2000,
): Promise<{ ready: boolean; error?: string; errorCode?: string }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const statusRes = await igGet(`/${containerId}`, accessToken, { fields: "status_code" });
    const status: string = statusRes.status_code ?? "UNKNOWN";
    if (status === "FINISHED" || status === "PUBLISHED") return { ready: true };
    if (status === "ERROR") {
      return { ready: false, error: "Media container failed to process", errorCode: "CONTAINER_ERROR" };
    }
    if (status === "EXPIRED") {
      return { ready: false, error: "Media container processing window expired — please try again", errorCode: "CONTAINER_EXPIRED" };
    }
    // IN_PROGRESS or UNKNOWN — continue polling
  }
  return { ready: false, error: "Media processing timed out after 30 seconds", errorCode: "CONTAINER_TIMEOUT" };
}

/**
 * Resolves a public Instagram post shortcode (from URL like /p/ABC123/) to
 * a numeric media ID using the user's connected IG account media feed.
 * Returns null if not found or if the user has no IG account linked.
 */
export async function resolveInstagramShortcodeToMediaId(
  igUserId: string,
  shortcode: string,
  pageAccessToken: string,
): Promise<string | null> {
  try {
    let after: string | null = null;
    // Search up to 3 pages of recent media (100 items) to find the matching post
    for (let page = 0; page < 3; page++) {
      const params: Record<string, string> = { fields: "id,permalink", limit: "100" };
      if (after) params.after = after;
      const result = await igGet(`/${igUserId}/media`, pageAccessToken, params);
      if (result.error || !Array.isArray(result.data)) break;
      for (const item of result.data) {
        if (typeof item.permalink === "string") {
          const urlParts = item.permalink.split("/").filter(Boolean);
          const shortcodeFromFeed = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
          if (shortcodeFromFeed === shortcode) return item.id as string;
        }
      }
      if (!result.paging?.cursors?.after) break;
      after = result.paging.cursors.after;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchInstagramMetrics(
  mediaId: string,
  pageAccessToken: string,
): Promise<{ likes: number; comments: number; shares: number; impressions: number; reach: number; saves: number; clicks: number } | null> {
  try {
    const basicRes = await igGet(`/${mediaId}`, pageAccessToken, {
      fields: "like_count,comments_count",
    });
    if (basicRes.error) return null;
    const likes = basicRes.like_count || 0;
    const comments = basicRes.comments_count || 0;

    let impressions = 0;
    let reach = 0;
    let saves = 0;
    try {
      const insightsRes = await igGet(`/${mediaId}/insights`, pageAccessToken, {
        metric: "impressions,reach,saved",
      });
      if (!insightsRes.error && Array.isArray(insightsRes.data)) {
        for (const item of insightsRes.data) {
          if (item.name === "impressions") impressions = item.values?.[0]?.value ?? item.value ?? 0;
          if (item.name === "reach") reach = item.values?.[0]?.value ?? item.value ?? 0;
          if (item.name === "saved") saves = item.values?.[0]?.value ?? item.value ?? 0;
        }
      }
    } catch {}
    return { likes, comments, shares: 0, impressions, reach, saves, clicks: 0 };
  } catch {
    return null;
  }
}

export async function postToInstagram(
  igUserId: string,
  pageAccessToken: string,
  caption: string,
  imageUrl: string,
): Promise<IgPostResult> {
  const containerRes = await igPost(`/${igUserId}/media`, pageAccessToken, {
    image_url: imageUrl,
    caption,
  });

  if (!containerRes.id) {
    const errMsg = containerRes.error?.message || "Failed to create Instagram media container";
    const isTokenError = containerRes.error?.code === 190 || errMsg.toLowerCase().includes("token") || errMsg.toLowerCase().includes("session");
    return { success: false, error: errMsg, errorCode: isTokenError ? "TOKEN_EXPIRED" : undefined };
  }

  const { ready, error: waitError, errorCode: waitCode } = await waitForContainer(containerRes.id, pageAccessToken);
  if (!ready) {
    return { success: false, error: waitError || "Media container not ready to publish", errorCode: waitCode };
  }

  const publishRes = await igPost(`/${igUserId}/media_publish`, pageAccessToken, {
    creation_id: containerRes.id,
  });

  if (publishRes.id) {
    // Fetch the actual permalink so we can store a valid public URL
    let permalink: string | undefined;
    try {
      const permalinkRes = await igGet(`/${publishRes.id}`, pageAccessToken, { fields: "permalink" });
      if (permalinkRes.permalink) permalink = permalinkRes.permalink;
    } catch {}
    return { success: true, postId: publishRes.id, permalink };
  }

  const errMsg = publishRes.error?.message || "Failed to publish Instagram media";
  const isTokenError = publishRes.error?.code === 190 || errMsg.toLowerCase().includes("token") || errMsg.toLowerCase().includes("session");
  return { success: false, error: errMsg, errorCode: isTokenError ? "TOKEN_EXPIRED" : undefined };
}

export function registerInstagramRoutes(app: Express) {
  function requireAuth(req: Request, res: Response): number | null {
    const userId = (req.session as any).userId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return null;
    }
    return userId;
  }

  function sanitizeScheduledPost(post: any) {
    if (!post) return null;
    const { pageAccessToken: _tok, ...safe } = post;
    return safe;
  }

  app.get("/api/instagram/status", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const conn = await storage.getSocialConnectionByUserId(userId);
    if (!conn?.igUserId) {
      return res.json({ connected: false });
    }
    return res.json({
      connected: true,
      igUserId: conn.igUserId,
      igUsername: conn.igUsername ?? null,
    });
  });

  app.post("/api/instagram/post-now", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { caption, imageUrl, campaignPostId } = req.body;
    if (!caption) {
      return res.status(400).json({ message: "caption is required" });
    }
    if (!imageUrl) {
      return res.status(400).json({ message: "imageUrl is required — Instagram requires an image" });
    }

    const conn = await storage.getSocialConnectionByUserId(userId);
    if (!conn?.igUserId || !conn?.pageAccessToken) {
      return res.status(400).json({ message: "No Instagram Business Account connected. Please reconnect via Facebook." });
    }

    const result = await postToInstagram(conn.igUserId, conn.pageAccessToken, caption, imageUrl);
    if (result.success) {
      if (campaignPostId && result.postId) {
        // Use the Graph API-provided permalink (contains the real shortcode); fall back to constructed URL
        const igPostUrl = result.permalink ?? (conn.igUsername ? `https://www.instagram.com/${conn.igUsername}/` : undefined);
        storage.updateCampaignPostPlatformId(Number(campaignPostId), result.postId, igPostUrl).catch(() => {});
      }
      return res.json({ success: true, postId: result.postId, igUsername: conn.igUsername });
    }

    if (result.errorCode === "TOKEN_EXPIRED" || result.error?.toLowerCase().includes("token") || result.error?.toLowerCase().includes("session")) {
      await storage.deleteSocialConnection(userId, "facebook");
      return res.status(401).json({ message: "Instagram session expired. Please reconnect your Facebook account.", expired: true });
    }

    return res.status(400).json({ message: result.error });
  });

  app.post("/api/instagram/schedule", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { caption, imageUrl, scheduledAt, campaignPostId } = req.body;
    if (!caption || !scheduledAt) {
      return res.status(400).json({ message: "caption and scheduledAt are required" });
    }
    if (!imageUrl) {
      return res.status(400).json({ message: "imageUrl is required — Instagram requires an image" });
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      return res.status(400).json({ message: "scheduledAt must be a valid future date" });
    }

    const conn = await storage.getSocialConnectionByUserId(userId);
    if (!conn?.igUserId || !conn?.pageAccessToken) {
      return res.status(400).json({ message: "No Instagram Business Account connected. Please reconnect via Facebook." });
    }

    const post = await storage.createScheduledSocialPost({
      userId,
      campaignPostId: campaignPostId || null,
      platform: "instagram",
      pageId: conn.pageId!,
      pageName: conn.pageName!,
      pageAccessToken: conn.pageAccessToken,
      igUserId: conn.igUserId,
      message: caption,
      imageUrl: imageUrl || null,
      scheduledAt: scheduledDate,
      status: "pending",
    });

    if (campaignPostId) {
      try {
        await storage.updateCampaignPost(Number(campaignPostId), { scheduledAt: scheduledDate });
      } catch (e) {
        console.warn(`[instagram-schedule] failed to sync campaign_posts.scheduledAt for #${campaignPostId}:`, (e as Error).message);
      }
    }

    return res.json(sanitizeScheduledPost(post));
  });

  app.get("/api/instagram/scheduled-posts", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const posts = await storage.getScheduledSocialPostsByUserId(userId, "instagram");
    return res.json(posts.map(sanitizeScheduledPost));
  });
}
