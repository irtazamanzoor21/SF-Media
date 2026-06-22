import type { Express, Request, Response } from "express";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { getUserOrgContext } from "./permissions";

const LI_API_BASE = "https://api.linkedin.com/v2";
const LI_REST_BASE = "https://api.linkedin.com/rest";
const LI_VERSION = "202506";
const LI_OAUTH_BASE = "https://www.linkedin.com/oauth/v2";

const SCOPES = ["openid", "profile", "w_member_social"].join(" ");

function getRedirectUri(req: Request): string {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${protocol}://${host}/api/linkedin/callback`;
}

async function liGet(path: string, accessToken: string): Promise<any> {
  const res = await fetch(`${LI_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "LinkedIn-Version": LI_VERSION,
    },
  });
  return res.json();
}

async function liRestPost(path: string, accessToken: string, body: object): Promise<globalThis.Response> {
  return fetch(`${LI_REST_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "LinkedIn-Version": LI_VERSION,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });
}

async function uploadImageToLinkedIn(
  authorUrn: string,
  accessToken: string,
  imageUrl: string,
): Promise<string | null> {
  try {
    const initRes = await liRestPost("/images?action=initializeUpload", accessToken, {
      initializeUploadRequest: { owner: authorUrn },
    });
    const initData = await initRes.json();
    const uploadUrl: string = initData?.value?.uploadUrl;
    const imageUrn: string = initData?.value?.image;
    if (!uploadUrl || !imageUrn) return null;

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return null;
    const imgBuffer = await imgRes.arrayBuffer();

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
      },
      body: imgBuffer,
    });
    if (!uploadRes.ok) return null;

    return imageUrn;
  } catch {
    return null;
  }
}

export async function fetchLinkedInMetrics(
  postId: string,
  accessToken: string,
): Promise<{ likes: number; comments: number; shares: number; impressions: number; reach: number; saves: number; clicks: number } | null> {
  // Normalize the stored platformPostId to a full URN for the Social Actions API.
  // Stored value may be URL-encoded (urn%3Ali%3AugcPost%3A...) or a raw URN.
  let urn = postId;
  if (urn.includes("%3A") || urn.includes("%3a")) {
    try { urn = decodeURIComponent(urn); } catch {}
  }
  // If still not a URN, try constructing one
  if (!urn.startsWith("urn:")) {
    urn = `urn:li:ugcPost:${urn}`;
  }

  try {
    const res = await fetch(`${LI_REST_BASE}/socialActions/${encodeURIComponent(urn)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "LinkedIn-Version": LI_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });

    if (res.status === 403) {
      console.warn(`[linkedin] fetchLinkedInMetrics 403 for URN "${urn}" — Social Actions API requires LinkedIn MDP partner access; standard tokens cannot read likes/comments`);
      return null;
    }

    if (!res.ok) {
      console.warn(`[linkedin] fetchLinkedInMetrics HTTP ${res.status} for URN "${urn}"`);
      return null;
    }

    // LinkedIn returns empty JSON ({}) when the post has no social activity yet
    const data = await res.json();
    const likes = data?.likesSummary?.totalLikes ?? 0;
    const comments = data?.commentsSummary?.totalFirstLevelComments ?? 0;

    console.log(`[linkedin] socialActions for "${urn}": likes=${likes}, comments=${comments}`);

    // Impressions, reach, clicks, shares, saves require LinkedIn Marketing Developer Platform.
    return { likes, comments, shares: 0, impressions: 0, reach: 0, saves: 0, clicks: 0 };
  } catch (err: any) {
    console.warn(`[linkedin] fetchLinkedInMetrics exception for "${urn}":`, err.message);
    return null;
  }
}

export async function postToLinkedIn(
  authorUrn: string,
  accessToken: string,
  text: string,
  imageUrl?: string,
): Promise<{ success: boolean; postId?: string; error?: string; errorCode?: string }> {
  let imageUrn: string | null = null;
  if (imageUrl) {
    imageUrn = await uploadImageToLinkedIn(authorUrn, accessToken, imageUrl);
  }

  const postBody: Record<string, any> = {
    author: authorUrn,
    commentary: text,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  if (imageUrn) {
    postBody.content = {
      media: {
        id: imageUrn,
        title: "Post image",
      },
    };
  }

  const postRes = await liRestPost("/posts", accessToken, postBody);

  if (postRes.status === 201) {
    const location = postRes.headers.get("location") || postRes.headers.get("x-restli-id") || "";
    const postId = location.split("/").pop() || location || undefined;
    return { success: true, postId };
  }

  let errMsg = "Failed to publish to LinkedIn";
  let errorCode: string | undefined;
  try {
    const errData = await postRes.json();
    console.error("[LinkedIn] Post failed:", postRes.status, JSON.stringify(errData));
    errMsg = errData?.message || errData?.serviceErrorCode?.toString() || errMsg;
    if (postRes.status === 401 || postRes.status === 403) errorCode = "TOKEN_EXPIRED";
  } catch {}

  return { success: false, error: errMsg, errorCode };
}

export function registerLinkedInRoutes(app: Express) {
  function requireAuth(req: Request, res: Response): number | null {
    const userId = (req.session as any).userId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return null;
    }
    return userId;
  }

  app.get("/api/linkedin/status", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const conn = await storage.getSocialConnectionByUserId(userId, "linkedin");
    if (!conn?.linkedinId) {
      return res.json({ connected: false });
    }
    return res.json({
      connected: true,
      authorUrn: conn.pageId,
      displayName: conn.linkedinName || conn.pageName,
      organizationId: conn.linkedinOrganizationId || null,
      organizationName: conn.linkedinOrganizationName || null,
    });
  });

  app.get("/api/linkedin/connect", (req: Request, res: Response) => {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    if (!clientId) {
      return res.redirect("/dashboard/social-accounts?linkedin_error=not_configured");
    }
    const session = req.session as any;
    const userId = session.userId;
    if (!userId) {
      return res.redirect("/auth");
    }
    const nonce = randomBytes(16).toString("hex");
    session.liOAuthNonce = nonce;
    const redirectUri = getRedirectUri(req);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: SCOPES,
      state: nonce,
    });
    return res.redirect(`${LI_OAUTH_BASE}/authorization?${params.toString()}`);
  });

  app.get("/api/linkedin/callback", async (req: Request, res: Response) => {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect("/dashboard/social-accounts?linkedin_error=not_configured");
    }

    const { code, state, error } = req.query as Record<string, string>;
    const errorDescription = (req.query.error_description as string) || "";
    const session = req.session as any;
    const expectedNonce: string | undefined = session.liOAuthNonce;
    const sessionUserId: number | undefined = session.userId;
    delete session.liOAuthNonce;

    if (error || !code || !state) {
      console.warn(
        `[linkedin] callback error=${error || "(none)"} description=${errorDescription || "(none)"}`,
      );
      const detail = errorDescription || error || "missing_params";
      return res.redirect(
        `/dashboard/social-accounts?linkedin_error=${encodeURIComponent(detail)}`,
      );
    }
    if (!expectedNonce || state !== expectedNonce || !sessionUserId) {
      return res.redirect("/dashboard/social-accounts?linkedin_error=invalid_state");
    }

    const redirectUri = getRedirectUri(req);
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    let accessToken: string;
    try {
      const tokenRes = await fetch(`${LI_OAUTH_BASE}/accessToken`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenParams.toString(),
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        return res.redirect("/dashboard/social-accounts?linkedin_error=token_exchange_failed");
      }
      accessToken = tokenData.access_token;
    } catch {
      return res.redirect("/dashboard/social-accounts?linkedin_error=token_exchange_failed");
    }

    let memberId = "";
    let firstName = "";
    let lastName = "";
    try {
      const profileRes = await fetch(`${LI_API_BASE}/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const profile = await profileRes.json();
      memberId = profile.sub || "";
      firstName = profile.given_name || "";
      lastName = profile.family_name || "";
    } catch {
      return res.redirect("/dashboard/social-accounts?linkedin_error=profile_fetch_failed");
    }

    if (!memberId) {
      return res.redirect("/dashboard/social-accounts?linkedin_error=profile_fetch_failed");
    }

    const displayName = [firstName, lastName].filter(Boolean).join(" ") || "LinkedIn User";
    const personUrn = `urn:li:person:${memberId}`;

    let orgId: string | null = null;
    let orgName: string | null = null;
    try {
      const aclsRes = await liGet(
        `/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`,
        accessToken,
      );
      const firstAcl = aclsRes?.elements?.[0];
      if (firstAcl?.organization) {
        const rawOrgUrn: string = firstAcl.organization;
        const orgNumId = rawOrgUrn.split(":").pop() || "";
        if (orgNumId) {
          const orgRes = await liGet(`/organizations/${orgNumId}?fields=id,localizedName`, accessToken);
          if (orgRes?.id) {
            orgId = String(orgRes.id);
            orgName = orgRes.localizedName || null;
          }
        }
      }
    } catch {}

    await storage.upsertSocialConnection(sessionUserId, {
      platform: "linkedin",
      pageId: personUrn,
      pageName: displayName,
      pageAccessToken: accessToken,
      linkedinId: memberId,
      linkedinName: displayName,
      linkedinOrganizationId: orgId,
      linkedinOrganizationName: orgName,
    });

    return res.redirect("/dashboard/social-accounts?linkedin_connected=1");
  });

  app.delete("/api/linkedin/disconnect", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.deleteSocialConnection(userId, "linkedin");
    return res.json({ success: true });
  });

  app.post("/api/linkedin/post-now", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { text, imageUrl, campaignPostId, postAs } = req.body;
    if (!text) {
      return res.status(400).json({ message: "text is required" });
    }

    const conn = await storage.getSocialConnectionByUserId(userId, "linkedin");
    if (!conn?.linkedinId || !conn?.pageAccessToken) {
      return res.status(400).json({ message: "LinkedIn account not connected. Please connect via the Social Accounts page." });
    }

    let authorUrn = `urn:li:person:${conn.linkedinId}`;
    if (postAs === "organization" && conn.linkedinOrganizationId) {
      authorUrn = `urn:li:organization:${conn.linkedinOrganizationId}`;
    }

    const result = await postToLinkedIn(authorUrn, conn.pageAccessToken, text, imageUrl || undefined);

    if (result.success) {
      if (campaignPostId && result.postId) {
        const linkedinUrn = result.postId;
        const liPostUrl = `https://www.linkedin.com/feed/update/${encodeURIComponent(linkedinUrn)}/`;
        storage.updateCampaignPostPlatformId(Number(campaignPostId), linkedinUrn, liPostUrl).catch(() => {});
      }
      return res.json({ success: true, postId: result.postId, displayName: conn.linkedinName });
    }

    if (result.errorCode === "TOKEN_EXPIRED") {
      await storage.deleteSocialConnection(userId, "linkedin");
      return res.status(401).json({ message: "LinkedIn session expired. Please reconnect.", expired: true });
    }

    return res.status(400).json({ message: result.error || "Failed to post to LinkedIn" });
  });

  app.post("/api/linkedin/schedule", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { text, imageUrl, scheduledAt, campaignPostId, postAs } = req.body;
    if (!text || !scheduledAt) {
      return res.status(400).json({ message: "text and scheduledAt are required" });
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      return res.status(400).json({ message: "scheduledAt must be a valid future date" });
    }

    const conn = await storage.getSocialConnectionByUserId(userId, "linkedin");
    if (!conn?.linkedinId || !conn?.pageAccessToken) {
      return res.status(400).json({ message: "LinkedIn account not connected." });
    }

    let authorUrn = `urn:li:person:${conn.linkedinId}`;
    let displayName = conn.linkedinName || conn.pageName || "LinkedIn";
    if (postAs === "organization" && conn.linkedinOrganizationId) {
      authorUrn = `urn:li:organization:${conn.linkedinOrganizationId}`;
      displayName = conn.linkedinOrganizationName || displayName;
    }

    const post = await storage.createScheduledSocialPost({
      userId,
      campaignPostId: campaignPostId || null,
      platform: "linkedin",
      pageId: authorUrn,
      pageName: displayName,
      pageAccessToken: conn.pageAccessToken,
      igUserId: null,
      message: text,
      imageUrl: imageUrl || null,
      scheduledAt: scheduledDate,
      status: "pending",
    });

    if (campaignPostId) {
      try {
        await storage.updateCampaignPost(Number(campaignPostId), { scheduledAt: scheduledDate });
      } catch (e) {
        console.warn(`[linkedin-schedule] failed to sync campaign_posts.scheduledAt for #${campaignPostId}:`, (e as Error).message);
      }
    }

    const { pageAccessToken: _tok, ...safePost } = post;
    return res.json(safePost);
  });
}
