import type { Express, Request, Response } from "express";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { getUserOrgContext } from "./permissions";

const FB_API_VERSION = "v19.0";
const FB_GRAPH_BASE = `https://graph.facebook.com/${FB_API_VERSION}`;

function getRedirectUri(req: Request): string {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${protocol}://${host}/api/facebook/callback`;
}

async function fbGet(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${FB_GRAPH_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  return res.json();
}

async function fbPost(path: string, accessToken: string, body: Record<string, string>): Promise<any> {
  const params = new URLSearchParams({ ...body, access_token: accessToken });
  const url = `${FB_GRAPH_BASE}${path}?${params.toString()}`;
  const res = await fetch(url, { method: "POST" });
  return res.json();
}

type FbPageEntry = { id: string; name: string; access_token?: string; category?: string };

// Look up a single page directly by ID — bypasses /me/accounts IG-scope filtering.
// Meta permanently filters /me/accounts to only IG-Business-Account pages once
// instagram_content_publish has ever been granted for this app+user combination.
async function fetchPageById(
  userToken: string,
  pageId: string,
  fallbackPageToken?: string | null,
): Promise<FbPageEntry | null> {
  try {
    const res = await fbGet(`/${pageId}`, {
      access_token: userToken,
      fields: "id,name,category,access_token",
    });
    if (!res.error && res.id) {
      if (res.access_token) {
        // Fresh page access token obtained from Meta — use it directly
        return { id: res.id, name: res.name, category: res.category, access_token: res.access_token };
      }
      // Page is accessible but user-token returned no page access_token (requires page admin scope).
      // Validate the stored page token before falling back to it.
      if (fallbackPageToken) {
        const verifyRes = await fbGet(`/${pageId}`, {
          access_token: fallbackPageToken,
          fields: "id",
        });
        if (!verifyRes.error && verifyRes.id) {
          return { id: res.id, name: res.name, category: res.category, access_token: fallbackPageToken };
        }
      }
      // Page exists but no valid page access token available — cannot include in list
      // (selecting a tokenless page would silently fail on posting)
      return null;
    }
    // User-token lookup failed entirely — verify page via stored page token as last resort
    if (fallbackPageToken) {
      const res2 = await fbGet(`/${pageId}`, {
        access_token: fallbackPageToken,
        fields: "id,name,category",
      });
      if (!res2.error && res2.id) {
        return { id: res2.id, name: res2.name, category: res2.category, access_token: fallbackPageToken };
      }
    }
    return null;
  } catch (err) {
    console.error(`[facebook] fetchPageById error for ${pageId}:`, err);
    return null;
  }
}

async function fetchAllPages(
  userToken: string,
  storedPage?: { id: string; name: string; accessToken: string | null } | null,
): Promise<FbPageEntry[]> {
  const directRes = await fbGet("/me/accounts", {
    access_token: userToken,
    fields: "id,name,access_token,category",
  });

  const directPages: FbPageEntry[] = directRes.data || [];

  // Seed the merged map with direct personal-admin pages.
  const allPageMap = new Map<string, FbPageEntry>();
  for (const p of directPages) allPageMap.set(p.id, p);

  // Always also query Business Manager — pages owned through BM don't appear
  // in /me/accounts and require business_management scope to retrieve.
  try {
    const bizRes = await fbGet("/me/businesses", {
      access_token: userToken,
      fields: "id,name,owned_pages{id,name,access_token,category}",
    });

    if (!bizRes.error) {
      for (const biz of bizRes.data || []) {
        for (const page of biz.owned_pages?.data || []) {
          if (!allPageMap.has(page.id)) {
            allPageMap.set(page.id, page);
          }
        }
      }
    }
  } catch (err) {
    console.error("[facebook] BM query error:", err);
  }

  if (allPageMap.size > 0) return Array.from(allPageMap.values());

  // Final fallback: verify the previously-selected page directly by ID.
  // This handles the case where Meta filters /me/accounts because instagram_content_publish
  // was previously granted for this app — even a fresh token without that scope is affected.
  if (storedPage?.id) {
    const fallback = await fetchPageById(userToken, storedPage.id, storedPage.accessToken);
    if (fallback) return [fallback];
  }

  return [];
}

async function getGrantedPermissions(userToken: string): Promise<string[]> {
  try {
    const permRes = await fbGet("/me/permissions", { access_token: userToken });
    return (permRes.data || [])
      .filter((p: { status: string }) => p.status === "granted")
      .map((p: { permission: string }) => p.permission);
  } catch {
    return [];
  }
}

// Revoke a specific permission from the user's app grant.
// Used to clear instagram_content_publish from the grant during FB connect,
// which restores /me/accounts to return all pages (not just IG-Business-Account pages).
async function revokePermission(userToken: string, permission: string): Promise<boolean> {
  try {
    const url = `${FB_GRAPH_BASE}/me/permissions/${encodeURIComponent(permission)}?access_token=${encodeURIComponent(userToken)}`;
    const res = await fetch(url, { method: "DELETE" });
    const json = await res.json();
    return !!json.success;
  } catch (err) {
    console.error(`[facebook] revokePermission(${permission}) error:`, err);
    return false;
  }
}

export type FacebookMetricsResult =
  | { likes: number; comments: number; shares: number; impressions: number; reach: number; clicks: number; saves: number }
  | { permissionError: true; message: string }
  | null;

export async function fetchFacebookMetrics(
  postId: string,
  pageAccessToken: string,
  pageId?: string | null,
  userAccessToken?: string | null,
): Promise<FacebookMetricsResult> {
  async function tryFetch(id: string, token: string): Promise<FacebookMetricsResult> {
    let likes = 0;
    let comments = 0;
    let hasEngagementPermission = true;

    // Request basic engagement — requires pages_read_engagement
    const basicRes = await fbGet(`/${id}`, {
      access_token: token,
      fields: "reactions.summary(true),comments.summary(true)",
    });
    if (basicRes.error) {
      const code = basicRes.error.code;
      const msg: string = basicRes.error.message || "";
      // Code 10 = scope required; code 100 "Missing permissions" = summary edge gated behind
      // Advanced Access on pages_read_engagement (or PPCA). Both mean the token cannot read
      // aggregated engagement — degrade to shares-only rather than failing silently.
      const isPermissionWall = code === 10 || (code === 100 && /missing permissions/i.test(msg));
      if (isPermissionWall) {
        console.warn(`[facebook] engagement read blocked for "${id}" (code ${code}) — will fetch shares only`);
        hasEngagementPermission = false;
      } else {
        console.warn(`[facebook] fetchFacebookMetrics error for ID "${id}":`, JSON.stringify(basicRes.error));
        return null;
      }
    } else {
      likes = basicRes.reactions?.summary?.total_count || 0;
      comments = basicRes.comments?.summary?.total_count || 0;
    }

    // Fetch shares separately — works without pages_read_engagement
    let shares = 0;
    const sharesRes = await fbGet(`/${id}`, {
      access_token: token,
      fields: "shares",
    });
    if (!sharesRes.error && sharesRes.shares?.count != null) {
      shares = sharesRes.shares.count;
    }

    // Fetch insights (impressions, reach, clicks) — requires pages_read_engagement
    let impressions = 0;
    let reach = 0;
    let clicks = 0;
    if (hasEngagementPermission) {
      const metricsRes = await fbGet(`/${id}/insights`, {
        access_token: token,
        metric: "post_impressions,post_impressions_unique,post_clicks",
        period: "lifetime",
      });
      if (!metricsRes.error && Array.isArray(metricsRes.data)) {
        for (const insight of metricsRes.data) {
          if (insight.name === "post_impressions") impressions = insight.values?.[0]?.value || 0;
          if (insight.name === "post_impressions_unique") reach = insight.values?.[0]?.value || 0;
          if (insight.name === "post_clicks") clicks = insight.values?.[0]?.value || 0;
        }
      } else if (metricsRes.error) {
        console.warn(`[facebook] Insights unavailable for "${id}" — returning basic engagement only`);
      }
    }

    // If we got no permission for engagement, still return shares and flag it
    if (!hasEngagementPermission) {
      // Return partial metrics (shares only) rather than a hard permissionError
      if (shares > 0) {
        return { likes: 0, comments: 0, shares, impressions: 0, reach: 0, clicks: 0, saves: 0 };
      }
      // No data at all — return permissionError so caller knows
      return { permissionError: true, message: "pages_read_engagement" };
    }

    return { likes, comments, shares, impressions, reach, clicks, saves: 0 };
  }

  async function tryWithFallback(id: string): Promise<FacebookMetricsResult> {
    const result = await tryFetch(id, pageAccessToken);
    // If page token has permission error, try user access token as fallback
    if (result && "permissionError" in result && userAccessToken) {
      console.log(`[facebook] Page token lacks pages_read_engagement — retrying with user access token for "${id}"`);
      const userResult = await tryFetch(id, userAccessToken);
      if (userResult && !("permissionError" in userResult)) return userResult;
      // Both tokens failed — return the original permissionError
      return result;
    }
    return result;
  }

  try {
    const result = await tryWithFallback(postId);
    // If permissionError, bubble it up immediately — retrying with different ID won't help
    if (result && "permissionError" in result) return result;
    if (result) return result;

    // If postId has no underscore and we have a pageId, try {pageId}_{postId} format
    if (!postId.includes("_") && pageId) {
      const fullId = `${pageId}_${postId}`;
      console.log(`[facebook] Retrying with full page post ID: ${fullId}`);
      return await tryWithFallback(fullId);
    }

    return null;
  } catch (err: any) {
    console.warn(`[facebook] fetchFacebookMetrics exception for "${postId}":`, err.message);
    return null;
  }
}

export async function postToFacebook(pageId: string, pageAccessToken: string, message: string, imageUrl?: string): Promise<{ success: boolean; postId?: string; error?: string }> {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) {
    return { success: false, error: "Facebook app credentials not configured" };
  }
  let result: any;
  if (imageUrl) {
    result = await fbPost(`/${pageId}/photos`, pageAccessToken, { message, url: imageUrl });
    // For photo posts, result.post_id is the page post ID (e.g. "pageId_postId")
    // while result.id is the photo object ID — prefer post_id for metrics compatibility
    if (result.post_id || result.id) {
      return { success: true, postId: result.post_id || result.id };
    }
  } else {
    result = await fbPost(`/${pageId}/feed`, pageAccessToken, { message });
    if (result.id) {
      return { success: true, postId: result.id };
    }
  }
  const errMsg = result.error?.message || "Unknown error from Facebook API";
  return { success: false, error: errMsg };
}

export function registerFacebookRoutes(app: Express) {
  function requireAuth(req: Request, res: Response): number | null {
    const userId = (req.session as any).userId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return null;
    }
    return userId;
  }

  app.get("/api/facebook/status", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const conn = await storage.getSocialConnectionByUserId(userId);
    if (!conn?.userAccessToken) {
      return res.json({ connected: false });
    }
    return res.json({
      connected: true,
      pageId: conn.pageId ?? null,
      pageName: conn.pageName ?? null,
    });
  });

  app.get("/api/facebook/connect", (req: Request, res: Response) => {
    const session = req.session as any;
    const userId = session.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appId || !appSecret) {
      return res.status(503).json({ message: "Facebook integration not configured. Please set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET." });
    }
    const nonce = randomBytes(16).toString("hex");
    session.fbOAuthNonce = nonce;
    const redirectUri = getRedirectUri(req);
    // pages_read_engagement is intentionally omitted: Meta's Use Cases framework rejects it
    // as an OAuth scope when it's bundled into an active use case ("Manage everything on your Page").
    // The permission still flows through to the token via the use case — requesting it by name
    // triggers an "Invalid Scopes" warning and is stripped from the consent screen.
    const scope = "pages_manage_posts,pages_show_list,business_management";
    const url = `https://www.facebook.com/${FB_API_VERSION}/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${encodeURIComponent(nonce)}&response_type=code`;
    res.redirect(url);
  });

  app.get("/api/instagram/connect", async (req: Request, res: Response) => {
    const session = req.session as any;
    const userId = session.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appId || !appSecret) {
      return res.status(503).json({ message: "Facebook integration not configured." });
    }
    const conn = await storage.getSocialConnectionByUserId(userId);
    if (!conn?.userAccessToken) {
      return res.redirect(`/dashboard/social-accounts?instagram_error=connect_facebook_first`);
    }
    if (!conn?.pageId) {
      return res.redirect(`/dashboard/social-accounts?instagram_error=no_page_connected`);
    }
    const nonce = randomBytes(16).toString("hex");
    session.fbOAuthNonce = nonce;
    session.igOAuthFlow = true;
    const redirectUri = getRedirectUri(req);
    // pages_read_engagement omitted — see comment above on the FB connect route
    const scope = "pages_manage_posts,pages_show_list,instagram_content_publish,instagram_basic,instagram_manage_insights";
    const url = `https://www.facebook.com/${FB_API_VERSION}/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${encodeURIComponent(nonce)}&response_type=code`;
    res.redirect(url);
  });

  app.get("/api/facebook/callback", async (req: Request, res: Response) => {
    const { code, state, error } = req.query as Record<string, string>;
    const session = req.session as any;

    // Read and immediately clear all transient OAuth session flags on every path
    const isIgFlow = !!session.igOAuthFlow;
    const expectedNonce: string | undefined = session.fbOAuthNonce;
    const sessionUserId: number | undefined = session.userId;
    delete session.igOAuthFlow;
    delete session.fbOAuthNonce;

    const errParam = (ig: boolean) => ig ? "instagram_error" : "facebook_error";

    if (error) {
      return res.redirect(`/dashboard/social-accounts?${errParam(isIgFlow)}=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect(`/dashboard/social-accounts?${errParam(isIgFlow)}=missing_params`);
    }

    if (!expectedNonce || state !== expectedNonce || !sessionUserId) {
      return res.redirect(`/dashboard/social-accounts?${errParam(isIgFlow)}=invalid_state`);
    }

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appId || !appSecret) {
      return res.redirect(`/dashboard/social-accounts?${errParam(isIgFlow)}=not_configured`);
    }

    const redirectUri = getRedirectUri(req);

    const tokenRes = await fbGet("/oauth/access_token", {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });

    if (!tokenRes.access_token) {
      const errMsg = tokenRes.error?.message || "token_exchange_failed";
      return res.redirect(`/dashboard/social-accounts?${errParam(isIgFlow)}=${encodeURIComponent(errMsg)}`);
    }

    const userToken: string = tokenRes.access_token;

    // Instagram-only OAuth flow: fetch the page's fresh token (with instagram_content_publish)
    // from /me/accounts, then look up the Instagram Business Account
    if (isIgFlow) {
      const existingConn = await storage.getSocialConnectionByUserId(sessionUserId);
      if (!existingConn?.pageId) {
        return res.redirect(`/dashboard/social-accounts?instagram_error=no_page_connected`);
      }

      // Get fresh page tokens from the new user token (which now has instagram_content_publish).
      // /me/accounts may be filtered by Meta when instagram_content_publish is in the grant,
      // so fall back to a direct page lookup by ID if the page is not found in the list.
      const pagesRes = await fbGet("/me/accounts", { access_token: userToken, fields: "id,name,access_token" });
      const freshPage = (pagesRes.data || []).find((p: { id: string }) => p.id === existingConn.pageId);
      let pageToken: string | null = existingConn.pageAccessToken;

      let usedStoredPageToken = false;

      if (freshPage?.access_token) {
        pageToken = freshPage.access_token;
      } else {
        // /me/accounts filtered — look up the page directly by ID to get a fresh token
        const directRes = await fbGet(`/${existingConn.pageId}`, {
          access_token: userToken,
          fields: "id,name,access_token",
        });
        if (!directRes.error && directRes.id && directRes.access_token) {
          pageToken = directRes.access_token;
        } else {
          // Could not obtain a fresh page token — falling back to the stored token.
          // This token may not carry instagram_content_publish if it was issued before IG connect.
          // IG business account lookup may still succeed (that call doesn't need IG publish scope).
          console.warn(`[facebook] IG callback: could not get fresh page token (${directRes.error?.message ?? "no token returned"}) — using stored token; IG publishing capability may be degraded`);
          usedStoredPageToken = true;
        }
      }

      if (!pageToken) {
        return res.redirect(`/dashboard/social-accounts?instagram_error=no_page_connected`);
      }

      let igUserId: string | null = null;
      let igUsername: string | null = null;
      try {
        const igRes = await fbGet(`/${existingConn.pageId}`, {
          fields: "instagram_business_account",
          access_token: pageToken,
        });
        if (igRes.instagram_business_account?.id) {
          igUserId = igRes.instagram_business_account.id;
          const igUserRes = await fbGet(`/${igUserId}`, {
            fields: "username",
            access_token: pageToken,
          });
          igUsername = igUserRes.username || null;
        }
      } catch (err) {
        console.warn("[facebook] IG business account lookup threw:", err);
      }

      if (!igUserId) {
        const pageName = existingConn.pageName ? encodeURIComponent(existingConn.pageName) : "";
        return res.redirect(`/dashboard/social-accounts?instagram_error=no_ig_account&page_name=${pageName}`);
      }

      // Update the stored page token (now includes instagram_content_publish) and IG info
      await storage.upsertSocialConnection(sessionUserId, {
        platform: "facebook",
        pageAccessToken: pageToken,
        igUserId,
        igUsername,
      });

      const igRedirect = usedStoredPageToken
        ? `/dashboard/social-accounts?instagram_connected=1&token_refresh_needed=1`
        : `/dashboard/social-accounts?instagram_connected=1`;
      return res.redirect(igRedirect);
    }

    // Standard Facebook OAuth flow — fetch pages with BM fallback
    const grantedPerms = await getGrantedPermissions(userToken);
    console.log("[facebook] OAuth granted permissions:", grantedPerms);

    // If instagram_content_publish is in the grant, revoke it before fetching pages.
    // Meta permanently filters /me/accounts (and direct /{pageId} lookups) to only return
    // pages with linked Instagram Business Accounts when this scope is present. Revoking it
    // restores normal page access. The user can re-grant it via the separate IG connect flow.
    if (grantedPerms.includes("instagram_content_publish")) {
      const revoked = await revokePermission(userToken, "instagram_content_publish");
      if (!revoked) {
        console.warn("[facebook] Could not revoke instagram_content_publish — page list may remain filtered");
      }
    }

    // Read the previous connection BEFORE wiping it — needed for the stored-page fallback
    // when Meta filters /me/accounts due to a previous instagram_content_publish grant.
    const prevConn = await storage.getSocialConnectionByUserId(sessionUserId);
    const storedPage = prevConn?.pageId
      ? { id: prevConn.pageId, name: prevConn.pageName || "", accessToken: prevConn.pageAccessToken }
      : null;

    await storage.upsertSocialConnection(sessionUserId, {
      platform: "facebook",
      userAccessToken: userToken,
      pageId: null,
      pageName: null,
      pageAccessToken: null,
    });

    const allPages = await fetchAllPages(userToken, storedPage);

    if (allPages.length > 0) {
      const firstPage = allPages[0];
      await storage.upsertSocialConnection(sessionUserId, {
        platform: "facebook",
        userAccessToken: userToken,
        pageId: firstPage.id,
        pageName: firstPage.name,
        pageAccessToken: firstPage.access_token || null,
        igUserId: null,
        igUsername: null,
      });
    }

    return res.redirect(`/dashboard/social-accounts?facebook_connected=1`);
  });

  app.get("/api/facebook/pages", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const conn = await storage.getSocialConnectionByUserId(userId);
    if (!conn?.userAccessToken) {
      return res.status(400).json({ message: "Not connected to Facebook" });
    }

    // Quick token validity check before fetching pages
    const meRes = await fbGet("/me", { access_token: conn.userAccessToken, fields: "id" });
    if (meRes.error) {
      if (meRes.error.code === 190) {
        await storage.deleteSocialConnection(userId, "facebook");
        return res.status(401).json({ message: "Facebook session expired. Please reconnect.", expired: true });
      }
      return res.status(400).json({ message: meRes.error.message });
    }

    const storedPage = conn.pageId
      ? { id: conn.pageId, name: conn.pageName || "", accessToken: conn.pageAccessToken }
      : null;
    const allPages = await fetchAllPages(conn.userAccessToken, storedPage);

    const pages = allPages.map((p) => ({ id: p.id, name: p.name, category: p.category }));
    return res.json({ pages, hasNoPages: pages.length === 0 });
  });

  app.post("/api/facebook/select-page", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { pageId } = req.body;
    if (!pageId) {
      return res.status(400).json({ message: "pageId is required" });
    }

    const conn = await storage.getSocialConnectionByUserId(userId);
    if (!conn?.userAccessToken) {
      return res.status(400).json({ message: "Not connected to Facebook" });
    }

    // Validate token before fetching pages
    const meRes = await fbGet("/me", { access_token: conn.userAccessToken, fields: "id" });
    if (meRes.error) {
      if (meRes.error.code === 190) {
        await storage.deleteSocialConnection(userId, "facebook");
        return res.status(401).json({ message: "Facebook session expired. Please reconnect.", expired: true });
      }
      return res.status(400).json({ message: meRes.error.message });
    }

    const storedPageForSelect = conn.pageId
      ? { id: conn.pageId, name: conn.pageName || "", accessToken: conn.pageAccessToken }
      : null;
    const allPages = await fetchAllPages(conn.userAccessToken, storedPageForSelect);

    const page = allPages.find((p) => p.id === pageId);
    if (!page) {
      return res.status(404).json({ message: "Page not found on your account" });
    }

    const updated = await storage.upsertSocialConnection(userId, {
      platform: "facebook",
      pageId: page.id,
      pageName: page.name,
      pageAccessToken: page.access_token || null,
      igUserId: null,
      igUsername: null,
    });

    return res.json({ success: true, pageId: updated.pageId, pageName: updated.pageName });
  });

  // Allows users to manually link a page by its ID when /me/accounts is filtered by Meta
  // (e.g., after instagram_content_publish has been granted for this app+user combination)
  app.post("/api/facebook/enter-page-by-id", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { pageId } = req.body;
    if (!pageId || typeof pageId !== "string") {
      return res.status(400).json({ message: "pageId is required" });
    }

    const conn = await storage.getSocialConnectionByUserId(userId);
    if (!conn?.userAccessToken) {
      return res.status(400).json({ message: "Not connected to Facebook" });
    }

    const meRes = await fbGet("/me", { access_token: conn.userAccessToken, fields: "id" });
    if (meRes.error) {
      if (meRes.error.code === 190) {
        await storage.deleteSocialConnection(userId, "facebook");
        return res.status(401).json({ message: "Facebook session expired. Please reconnect.", expired: true });
      }
      return res.status(400).json({ message: meRes.error.message });
    }

    const page = await fetchPageById(conn.userAccessToken, pageId.trim(), null);
    if (!page) {
      return res.status(404).json({ message: "Page not found. Make sure you are an Admin of this Page and the ID is correct." });
    }
    if (!page.access_token) {
      return res.status(403).json({ message: "Page found but could not obtain a publishing token. Make sure you are an Admin of this Page." });
    }

    await storage.upsertSocialConnection(userId, {
      platform: "facebook",
      pageId: page.id,
      pageName: page.name,
      pageAccessToken: page.access_token,
      igUserId: null,
      igUsername: null,
    });

    return res.json({ success: true, pageId: page.id, pageName: page.name });
  });

  app.delete("/api/facebook/disconnect", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.deleteSocialConnection(userId, "facebook");
    return res.json({ success: true });
  });

  app.post("/api/facebook/post-now", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { message, campaignPostId, imageUrl } = req.body;
    if (!message) {
      return res.status(400).json({ message: "message is required" });
    }

    const conn = await storage.getSocialConnectionByUserId(userId);
    if (!conn?.pageId || !conn?.pageAccessToken) {
      return res.status(400).json({ message: "No Facebook page connected. Please connect first." });
    }

    const result = await postToFacebook(conn.pageId, conn.pageAccessToken, message, imageUrl || undefined);
    if (result.success) {
      if (campaignPostId && result.postId) {
        const fbPostUrl = `https://www.facebook.com/${result.postId}`;
        storage.updateCampaignPostPlatformId(Number(campaignPostId), result.postId, fbPostUrl).catch(() => {});

        // Quick metrics: auto-fetch after posting
        const postIdStr = result.postId;
        const cpId = Number(campaignPostId);
        const { pageAccessToken, pageId, userAccessToken } = conn;
        const fetchAndSave = async () => {
          try {
            const fbMetrics = await fetchFacebookMetrics(postIdStr, pageAccessToken, pageId, userAccessToken);
            if (fbMetrics && !("permissionError" in fbMetrics)) {
              await storage.upsertPostMetrics(cpId, {
                likes: fbMetrics.likes,
                comments: fbMetrics.comments,
                shares: fbMetrics.shares,
                impressions: fbMetrics.impressions,
                reach: fbMetrics.reach,
                saves: fbMetrics.saves,
                clicks: fbMetrics.clicks,
              });
              await storage.createMetricSnapshot({
                postId: cpId,
                likes: fbMetrics.likes,
                comments: fbMetrics.comments,
                shares: fbMetrics.shares,
                impressions: fbMetrics.impressions,
                reach: fbMetrics.reach,
                saves: fbMetrics.saves,
                clicks: fbMetrics.clicks,
              });
              console.log(`[quick-metrics] Auto-fetched metrics for post #${cpId}`);
            }
          } catch (err: any) {
            console.warn(`[quick-metrics] Auto-fetch failed for post #${cpId}:`, err.message);
          }
        };
        setTimeout(fetchAndSave, 2 * 60 * 1000);   // 2 min — basic engagement
        setTimeout(fetchAndSave, 20 * 60 * 1000);  // 20 min — insights available
      }
      return res.json({ success: true, postId: result.postId, pageName: conn.pageName });
    }

    if (result.error?.includes("token") || result.error?.includes("expired") || result.error?.includes("Session")) {
      await storage.deleteSocialConnection(userId, "facebook");
      return res.status(401).json({ message: "Facebook session expired. Please reconnect.", expired: true });
    }

    return res.status(400).json({ message: result.error });
  });

  app.post("/api/facebook/schedule", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { message, scheduledAt, campaignPostId, imageUrl } = req.body;
    if (!message || !scheduledAt) {
      return res.status(400).json({ message: "message and scheduledAt are required" });
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      return res.status(400).json({ message: "scheduledAt must be a valid future date" });
    }

    const conn = await storage.getSocialConnectionByUserId(userId);
    if (!conn?.pageId || !conn?.pageAccessToken) {
      return res.status(400).json({ message: "No Facebook page connected. Please connect first." });
    }


    const post = await storage.createScheduledSocialPost({
      userId,
      campaignPostId: campaignPostId || null,
      pageId: conn.pageId,
      pageName: conn.pageName!,
      pageAccessToken: conn.pageAccessToken,
      message,
      imageUrl: imageUrl || null,
      scheduledAt: scheduledDate,
      status: "pending",
    });

    if (campaignPostId) {
      try {
        await storage.updateCampaignPost(Number(campaignPostId), { scheduledAt: scheduledDate });
      } catch (e) {
        console.warn(`[facebook-schedule] failed to sync campaign_posts.scheduledAt for #${campaignPostId}:`, (e as Error).message);
      }
    }

    return res.json(sanitizeScheduledPost(post));
  });

  function sanitizeScheduledPost(post: Awaited<ReturnType<typeof storage.getScheduledSocialPostById>>) {
    if (!post) return null;
    const { pageAccessToken: _tok, ...safe } = post;
    return safe;
  }

  app.get("/api/facebook/scheduled-posts", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const posts = await storage.getScheduledSocialPostsByUserId(userId, "facebook");
    return res.json(posts.map((p) => sanitizeScheduledPost(p)));
  });

  app.post("/api/facebook/scheduled-posts/:id/post-now", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = parseInt(req.params.id);
    const scheduledPost = await storage.getScheduledSocialPostById(id);
    if (!scheduledPost || scheduledPost.userId !== userId) {
      return res.status(404).json({ message: "Scheduled post not found" });
    }
    if (scheduledPost.status !== "pending") {
      return res.status(400).json({ message: "Only pending posts can be published" });
    }

    const result = await postToFacebook(scheduledPost.pageId, scheduledPost.pageAccessToken, scheduledPost.message);
    if (result.success) {
      await storage.updateScheduledSocialPost(id, { status: "sent", sentAt: new Date() });
      return res.json({ success: true, postId: result.postId, pageName: scheduledPost.pageName });
    }

    if (result.error?.includes("token") || result.error?.includes("expired") || result.error?.includes("Session")) {
      await storage.deleteSocialConnection(userId, "facebook");
      await storage.updateScheduledSocialPost(id, { status: "failed", errorMessage: result.error });
      return res.status(401).json({ message: "Facebook session expired. Please reconnect.", expired: true });
    }

    await storage.updateScheduledSocialPost(id, { status: "failed", errorMessage: result.error });
    return res.status(400).json({ message: result.error });
  });

  app.delete("/api/facebook/scheduled-posts/:id", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = parseInt(req.params.id);
    const post = await storage.getScheduledSocialPostById(id);
    if (!post || post.userId !== userId) {
      return res.status(404).json({ message: "Scheduled post not found" });
    }
    if (post.status !== "pending") {
      return res.status(400).json({ message: "Only pending posts can be deleted" });
    }

    await storage.deleteScheduledSocialPost(id);
    return res.json({ success: true });
  });

  app.patch("/api/facebook/scheduled-posts/:id", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = parseInt(req.params.id);
    const post = await storage.getScheduledSocialPostById(id);
    if (!post || post.userId !== userId) {
      return res.status(404).json({ message: "Scheduled post not found" });
    }
    if (post.status !== "pending") {
      return res.status(400).json({ message: "Only pending posts can be edited" });
    }

    const { message, scheduledAt } = req.body;
    const updates: Partial<typeof post> = {};
    if (message) updates.message = message;
    if (scheduledAt) {
      const d = new Date(scheduledAt);
      if (isNaN(d.getTime()) || d <= new Date()) {
        return res.status(400).json({ message: "scheduledAt must be a valid future date" });
      }
      updates.scheduledAt = d;
    }

    const updated = await storage.updateScheduledSocialPost(id, updates);
    return res.json(sanitizeScheduledPost(updated));
  });
}
