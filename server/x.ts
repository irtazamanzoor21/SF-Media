import type { Express, Request, Response } from "express";
import { createHash, createHmac, randomBytes } from "crypto";
import { storage } from "./storage";
import { getUserOrgContext } from "./permissions";

const X_AUTHORIZE_URL = "https://twitter.com/i/oauth2/authorize";
const X_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const X_API_BASE = "https://api.twitter.com/2";
const SCOPES = "tweet.read tweet.write users.read offline.access";

const X_OAUTH1_REQUEST_TOKEN_URL = "https://api.twitter.com/oauth/request_token";
const X_OAUTH1_AUTHORIZE_URL = "https://api.twitter.com/oauth/authorize";
const X_OAUTH1_ACCESS_TOKEN_URL = "https://api.twitter.com/oauth/access_token";
const X_MEDIA_UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";

function pct(s: string): string {
  return encodeURIComponent(s)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

function buildOAuth1Header(
  method: string,
  url: string,
  requestParams: Record<string, string>,
  consumerKey: string,
  consumerSecret: string,
  token: string,
  tokenSecret: string,
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: token,
    oauth_version: "1.0",
  };
  const allParams: Record<string, string> = { ...oauthParams, ...requestParams };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys.map((k) => `${pct(k)}=${pct(allParams[k])}`).join("&");
  const baseString = `${method.toUpperCase()}&${pct(url)}&${pct(paramString)}`;
  const signingKey = `${pct(consumerSecret)}&${pct(tokenSecret)}`;
  const signature = createHmac("sha1", signingKey).update(baseString).digest("base64");
  oauthParams["oauth_signature"] = signature;
  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${pct(k)}="${pct(oauthParams[k])}"`);
  return `OAuth ${headerParts.join(", ")}`;
}

function buildOAuth1HeaderAppOnly(
  method: string,
  url: string,
  callbackUrl: string,
  consumerKey: string,
  consumerSecret: string,
): string {
  const oauthParams: Record<string, string> = {
    oauth_callback: callbackUrl,
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: "1.0",
  };
  const allParams: Record<string, string> = { ...oauthParams };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys.map((k) => `${pct(k)}=${pct(allParams[k])}`).join("&");
  const baseString = `${method.toUpperCase()}&${pct(url)}&${pct(paramString)}`;
  const signingKey = `${pct(consumerSecret)}&`;
  const signature = createHmac("sha1", signingKey).update(baseString).digest("base64");
  oauthParams["oauth_signature"] = signature;
  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${pct(k)}="${pct(oauthParams[k])}"`);
  return `OAuth ${headerParts.join(", ")}`;
}

function getRedirectUri(req: Request): string {
  if (process.env.APP_BASE_URL) {
    return `${process.env.APP_BASE_URL}/api/x/callback`;
  }
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${protocol}://${host}/api/x/callback`;
}

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function refreshXToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date } | null> {
  // Trim to guard against stray whitespace/newlines in env vars
  const trimmedClientId = clientId.trim();
  const trimmedClientSecret = clientSecret.trim();

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: trimmedClientId,
  });

  async function attemptRefresh(useBasicAuth: boolean): Promise<{ rawBody: string; status: number; data: any } | null> {
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
    if (useBasicAuth) {
      const credentials = Buffer.from(`${trimmedClientId}:${trimmedClientSecret}`).toString("base64");
      headers["Authorization"] = `Basic ${credentials}`;
    }
    try {
      const res = await fetch(X_TOKEN_URL, { method: "POST", headers, body: params.toString() });
      const rawBody = await res.text();
      let data: any = {};
      try { data = JSON.parse(rawBody); } catch { /* non-JSON handled below */ }
      return { rawBody, status: res.status, data };
    } catch (err: any) {
      console.error("[X] Token refresh network error (useBasicAuth=%s): %s", useBasicAuth, err?.message || err);
      return null;
    }
  }

  // Try confidential client (Basic auth) first
  const confidentialResult = await attemptRefresh(true);
  if (confidentialResult) {
    const { rawBody, status, data } = confidentialResult;
    if (data.access_token) {
      console.log("[X] Token refresh succeeded (confidential client)");
      const expiresAt = new Date(Date.now() + (data.expires_in || 7200) * 1000);
      return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt };
    }
    // If unauthorized_client, try public client fallback
    if (status === 401 && data.error === "unauthorized_client") {
      console.warn("[X] Token refresh: confidential client rejected (status=%d), retrying as public client", status);
      const publicResult = await attemptRefresh(false);
      if (publicResult?.data?.access_token) {
        console.log("[X] Token refresh succeeded (public client fallback)");
        const expiresAt = new Date(Date.now() + (publicResult.data.expires_in || 7200) * 1000);
        return { accessToken: publicResult.data.access_token, refreshToken: publicResult.data.refresh_token, expiresAt };
      }
      const pRaw = publicResult?.rawBody || "(no response)";
      const pStatus = publicResult?.status ?? 0;
      console.error("[X] Token refresh failed (public client): status=%d body=%s", pStatus, pRaw);
      return null;
    }
    if (!rawBody.startsWith("{")) {
      console.error("[X] Token refresh returned non-JSON: status=%d body=%s", status, rawBody);
    } else {
      console.error("[X] Token refresh failed: status=%d body=%s", status, rawBody);
    }
  }
  return null;
}

export async function getValidXAccessToken(userId: number): Promise<string | null> {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const conn = await storage.getSocialConnectionByUserId(userId, "x");
  if (!conn?.xAccessToken) return null;
  if (clientId && clientSecret && conn.xRefreshToken && conn.xTokenExpiresAt) {
    const expiresAt = new Date(conn.xTokenExpiresAt);
    const isExpired = expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
    if (isExpired) {
      const refreshed = await refreshXToken(clientId, clientSecret, conn.xRefreshToken);
      if (refreshed) {
        await storage.upsertSocialConnection(userId, {
          platform: "x",
          xId: conn.xId || undefined,
          xUsername: conn.xUsername || undefined,
          xAccessToken: refreshed.accessToken,
          xRefreshToken: refreshed.refreshToken || conn.xRefreshToken,
          xTokenExpiresAt: refreshed.expiresAt,
        });
        return refreshed.accessToken;
      }
      if (expiresAt.getTime() < Date.now()) {
        await storage.deleteSocialConnection(userId, "x");
        return null;
      }
    }
  }
  return conn.xAccessToken;
}

async function uploadMediaToX(
  oauth1Token: string,
  oauth1TokenSecret: string,
  imageUrl: string,
): Promise<string | null> {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  if (!apiKey || !apiSecret) {
    console.warn("[X] X_API_KEY / X_API_SECRET not set — cannot upload media");
    return null;
  }
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      console.warn("[X] Failed to fetch image for upload:", imgRes.status, imageUrl);
      return null;
    }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("gif") ? "gif" : contentType.includes("webp") ? "webp" : "jpg";
    // For multipart/form-data uploads, body params are NOT included in the OAuth signature
    const authHeader = buildOAuth1Header(
      "POST",
      X_MEDIA_UPLOAD_URL,
      {},
      apiKey,
      apiSecret,
      oauth1Token,
      oauth1TokenSecret,
    );
    const formData = new FormData();
    const blob = new Blob([imgBuffer], { type: contentType });
    formData.append("media", blob, `image.${ext}`);
    const uploadRes = await fetch(X_MEDIA_UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader,
      },
      body: formData,
    });
    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.warn("[X] Media upload failed:", uploadRes.status, errText);
      return null;
    }
    const uploadData = await uploadRes.json();
    return uploadData.media_id_string || null;
  } catch (err: any) {
    console.warn("[X] Media upload error:", err.message || err);
    return null;
  }
}

export async function postToX(
  accessToken: string,
  text: string,
  imageUrl?: string,
  oauth1Token?: string,
  oauth1TokenSecret?: string,
): Promise<{ success: boolean; tweetId?: string; error?: string; errorCode?: string }> {
  try {
    const tweetBody: Record<string, any> = { text };
    if (imageUrl) {
      const effectiveToken = oauth1Token || process.env.X_OAUTH1_TOKEN;
      const effectiveSecret = oauth1TokenSecret || process.env.X_OAUTH1_TOKEN_SECRET;
      if (effectiveToken && effectiveSecret) {
        const mediaId = await uploadMediaToX(effectiveToken, effectiveSecret, imageUrl);
        if (mediaId) {
          tweetBody.media = { media_ids: [mediaId] };
          console.log("[X] Image attached to tweet (media_id:", mediaId, ")");
        } else {
          console.warn("[X] Image requested but not attached — media upload failed, posting text only. imageUrl:", imageUrl);
        }
      } else {
        console.warn("[X] Image requested but no OAuth 1.0a tokens available (neither per-user nor X_OAUTH1_TOKEN env var) — posting text only.");
      }
    }
    const res = await fetch(`${X_API_BASE}/tweets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tweetBody),
    });
    const data = await res.json();
    if (res.ok && data.data?.id) {
      return { success: true, tweetId: data.data.id };
    }
    if (res.status === 401) {
      console.error("[X] Auth failure posting to X:", res.status, JSON.stringify(data));
      return { success: false, error: "Token expired", errorCode: "TOKEN_EXPIRED" };
    }
    if (res.status === 403) {
      const errMsg = data?.detail || data?.title || "Post not allowed by X";
      console.error("[X] Post forbidden by X:", res.status, JSON.stringify(data));
      return { success: false, error: errMsg };
    }
    const errMsg = data?.detail || data?.title || "Failed to post to X";
    console.error("[X] Tweet failed:", res.status, JSON.stringify(data));
    return { success: false, error: errMsg };
  } catch (err: any) {
    return { success: false, error: err.message || "Unknown error" };
  }
}

export async function fetchXMetrics(
  tweetId: string,
  accessToken: string,
): Promise<{ likes: number; comments: number; shares: number; impressions: number; saves: number; clicks: number } | null> {
  try {
    const url = `${X_API_BASE}/tweets/${tweetId}?tweet.fields=public_metrics`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const m = data?.data?.public_metrics;
    if (!m) return null;
    return {
      likes: m.like_count || 0,
      comments: m.reply_count || 0,
      shares: m.retweet_count || 0,
      impressions: m.impression_count || 0,
      saves: m.bookmark_count || 0,
      clicks: 0,
    };
  } catch {
    return null;
  }
}

export function registerXRoutes(app: Express) {
  // Startup env check — confirms which X credentials are loaded and their trimmed lengths
  const _startupClientId = (process.env.X_CLIENT_ID || "").trim();
  const _startupClientSecret = (process.env.X_CLIENT_SECRET || "").trim();
  console.log(
    "[X] env check — X_CLIENT_ID:%s(len=%d) X_CLIENT_SECRET:%s(len=%d) X_API_KEY:%s X_API_SECRET:%s",
    _startupClientId ? "SET" : "MISSING",
    _startupClientId.length,
    _startupClientSecret ? "SET" : "MISSING",
    _startupClientSecret.length,
    process.env.X_API_KEY ? "SET" : "MISSING",
    process.env.X_API_SECRET ? "SET" : "MISSING",
  );

  function requireAuth(req: Request, res: Response): number | null {
    const userId = (req.session as any).userId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return null;
    }
    return userId;
  }

  app.get("/api/x/status", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const conn = await storage.getSocialConnectionByUserId(userId, "x");
    if (!conn?.xId) {
      return res.json({ connected: false });
    }
    return res.json({
      connected: true,
      xId: conn.xId,
      xUsername: conn.xUsername,
      oauth1Connected: !!(
        (conn.xOauth1Token && conn.xOauth1TokenSecret) ||
        (process.env.X_OAUTH1_TOKEN && process.env.X_OAUTH1_TOKEN_SECRET)
      ),
    });
  });

  app.get("/api/x/connect", (req: Request, res: Response) => {
    // Trim credentials to guard against stray whitespace/newlines in env vars
    const clientId = (process.env.X_CLIENT_ID || "").trim();
    const clientSecretCheck = (process.env.X_CLIENT_SECRET || "").trim();
    if (!clientId || !clientSecretCheck) {
      console.error("[X] /api/x/connect — X_CLIENT_ID or X_CLIENT_SECRET not set (or whitespace-only)");
      return res.redirect("/dashboard/social-accounts?x_error=not_configured");
    }
    const session = req.session as any;
    const userId = session.userId;
    if (!userId) {
      return res.redirect("/auth");
    }
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = randomBytes(16).toString("hex");
    session.xCodeVerifier = codeVerifier;
    session.xOAuthState = state;

    // Build redirect URI and store it in session so callback uses the identical value
    const proto = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.headers["x-forwarded-host"] || req.get("host");
    const redirectUri = getRedirectUri(req);
    session.xRedirectUri = redirectUri;

    console.log(
      "[X] /api/x/connect — userId=%s APP_BASE_URL=%s x-forwarded-proto=%s x-forwarded-host=%s host=%s redirectUri=%s",
      userId,
      process.env.APP_BASE_URL || "(not set)",
      proto,
      req.headers["x-forwarded-host"] || "(not set)",
      host,
      redirectUri,
    );

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return res.redirect(`${X_AUTHORIZE_URL}?${params.toString()}`);
  });

  app.get("/api/x/callback", async (req: Request, res: Response) => {
    const clientId = (process.env.X_CLIENT_ID || "").trim();
    const clientSecret = (process.env.X_CLIENT_SECRET || "").trim();
    if (!clientId || !clientSecret) {
      console.error("[X] /api/x/callback — X_CLIENT_ID or X_CLIENT_SECRET not set (or whitespace-only)");
      return res.redirect("/dashboard/social-accounts?x_error=not_configured");
    }
    const { code, state, error } = req.query as Record<string, string>;
    const session = req.session as any;
    const expectedState = session.xOAuthState;
    const codeVerifier = session.xCodeVerifier;
    const sessionUserId: number | undefined = session.userId;
    // Use the redirect URI stored during /connect to guarantee an exact match
    const storedRedirectUri: string | undefined = session.xRedirectUri;
    delete session.xOAuthState;
    delete session.xCodeVerifier;
    delete session.xRedirectUri;

    console.log(
      "[X] /api/x/callback — userId=%s hasCode=%s hasState=%s xError=%s storedRedirectUri=%s",
      sessionUserId,
      !!code,
      !!state,
      error || "(none)",
      storedRedirectUri || "(not in session)",
    );

    if (error || !code || !state) {
      console.error("[X] /api/x/callback — X returned error or missing params: error=%s code=%s state=%s", error, !!code, !!state);
      return res.redirect("/dashboard/social-accounts?x_error=missing_params");
    }
    if (!expectedState || state !== expectedState || !sessionUserId || !codeVerifier) {
      console.error(
        "[X] /api/x/callback — state mismatch or missing session: hasExpectedState=%s stateMatch=%s hasUserId=%s hasVerifier=%s",
        !!expectedState,
        state === expectedState,
        !!sessionUserId,
        !!codeVerifier,
      );
      return res.redirect("/dashboard/social-accounts?x_error=invalid_state");
    }

    // Always compute the derived URI so we can compare stored vs derived in logs
    const derivedRedirectUri = getRedirectUri(req);
    const redirectUri = storedRedirectUri || derivedRedirectUri;
    if (!storedRedirectUri) {
      console.warn(
        "[X] /api/x/callback — xRedirectUri missing from session, falling back to derived: %s",
        derivedRedirectUri,
      );
    } else if (storedRedirectUri !== derivedRedirectUri) {
      console.warn(
        "[X] /api/x/callback — redirect URI mismatch: stored=%s derived=%s (using stored)",
        storedRedirectUri,
        derivedRedirectUri,
      );
    }

    console.log(
      "[X] /api/x/callback — token exchange: redirectUri=%s (stored=%s derived=%s)",
      redirectUri,
      storedRedirectUri || "(none)",
      derivedRedirectUri,
    );

    // clientId and clientSecret are already trimmed at the top of this handler
    console.log(
      "[X] /api/x/callback — credential lengths: clientId=%d clientSecret=%d",
      clientId.length,
      clientSecret.length,
    );

    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      client_id: clientId,
    });

    async function attemptTokenExchange(useBasicAuth: boolean): Promise<{ rawBody: string; status: number; data: any } | null> {
      const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
      if (useBasicAuth) {
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
        headers["Authorization"] = `Basic ${credentials}`;
      }
      try {
        const tokenRes = await fetch(X_TOKEN_URL, { method: "POST", headers, body: tokenParams.toString() });
        const rawBody = await tokenRes.text();
        let data: any = {};
        try { data = JSON.parse(rawBody); } catch { /* handled below */ }
        return { rawBody, status: tokenRes.status, data };
      } catch (err: any) {
        console.error("[X] Token exchange network error (useBasicAuth=%s): %s", useBasicAuth, err?.message || err);
        return null;
      }
    }

    let accessToken: string;
    let refreshToken: string | undefined;
    let expiresAt: Date;

    // Try confidential client (Basic auth) first
    const confidentialResult = await attemptTokenExchange(true);
    if (!confidentialResult) {
      return res.redirect("/dashboard/social-accounts?x_error=token_exchange_failed");
    }

    let finalResult = confidentialResult;

    if (!confidentialResult.data.access_token) {
      const { status, rawBody, data } = confidentialResult;
      // On unauthorized_client, retry as public client (no Authorization header)
      if (status === 401 && data.error === "unauthorized_client") {
        console.warn(
          "[X] Token exchange: confidential client rejected (status=%d body=%s), retrying as public client",
          status,
          rawBody,
        );
        const publicResult = await attemptTokenExchange(false);
        if (!publicResult) {
          return res.redirect("/dashboard/social-accounts?x_error=token_exchange_failed");
        }
        finalResult = publicResult;
        if (!publicResult.data.access_token) {
          console.error(
            "[X] Token exchange failed (public client fallback): status=%d redirectUri=%s body=%s",
            publicResult.status,
            redirectUri,
            publicResult.rawBody,
          );
          return res.redirect("/dashboard/social-accounts?x_error=token_exchange_failed");
        }
        console.log("[X] Token exchange succeeded (public client fallback)");
      } else {
        // Non-recoverable failure
        if (!rawBody.startsWith("{")) {
          console.error(
            "[X] Token exchange returned non-JSON: status=%d redirectUri=%s body=%s",
            status,
            redirectUri,
            rawBody,
          );
        } else {
          console.error(
            "[X] Token exchange failed: status=%d redirectUri=%s body=%s",
            status,
            redirectUri,
            rawBody,
          );
        }
        return res.redirect("/dashboard/social-accounts?x_error=token_exchange_failed");
      }
    } else {
      console.log("[X] Token exchange succeeded (confidential client)");
    }

    accessToken = finalResult.data.access_token;
    refreshToken = finalResult.data.refresh_token;
    expiresAt = new Date(Date.now() + (finalResult.data.expires_in || 7200) * 1000);

    let xId = "";
    let xUsername = "";
    try {
      const meRes = await fetch(`${X_API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!meRes.ok) {
        console.error("[X] Profile fetch failed:", meRes.status, await meRes.text());
        return res.redirect("/dashboard/social-accounts?x_error=profile_fetch_failed");
      }
      const me = await meRes.json();
      xId = me.data?.id || "";
      xUsername = me.data?.username || "";
    } catch (err: any) {
      console.error("[X] Profile fetch error:", err.message || err);
      return res.redirect("/dashboard/social-accounts?x_error=profile_fetch_failed");
    }

    if (!xId) {
      return res.redirect("/dashboard/social-accounts?x_error=profile_fetch_failed");
    }

    await storage.upsertSocialConnection(sessionUserId, {
      platform: "x",
      xId,
      xUsername,
      xAccessToken: accessToken,
      xRefreshToken: refreshToken || null,
      xTokenExpiresAt: expiresAt,
    });

    return res.redirect("/dashboard/social-accounts?x_connected=1");
  });

  app.delete("/api/x/disconnect", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    await storage.deleteSocialConnection(userId, "x");
    return res.json({ success: true });
  });

  app.post("/api/x/oauth1/save-tokens", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const { accessToken, accessTokenSecret } = req.body;
    if (!accessToken || typeof accessToken !== "string" || !accessToken.trim()) {
      return res.status(400).json({ message: "accessToken is required" });
    }
    if (!accessTokenSecret || typeof accessTokenSecret !== "string" || !accessTokenSecret.trim()) {
      return res.status(400).json({ message: "accessTokenSecret is required" });
    }
    const conn = await storage.getSocialConnectionByUserId(userId, "x");
    if (!conn?.xId) {
      return res.status(400).json({ message: "X account not connected. Connect your X account first." });
    }
    await storage.upsertSocialConnection(userId, {
      platform: "x",
      xOauth1Token: accessToken.trim(),
      xOauth1TokenSecret: accessTokenSecret.trim(),
    });
    return res.json({ success: true });
  });

  app.get("/api/x/oauth1/connect", async (req: Request, res: Response) => {
    const apiKey = process.env.X_API_KEY;
    const apiSecret = process.env.X_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.redirect("/dashboard/social-accounts?x_oauth1_error=not_configured");
    }
    const session = req.session as any;
    if (!session.userId) {
      return res.redirect("/auth");
    }
    const conn = await storage.getSocialConnectionByUserId(session.userId, "x");
    if (!conn?.xId) {
      return res.redirect("/dashboard/social-accounts?x_oauth1_error=connect_x_first");
    }
    const callbackUrl = process.env.APP_BASE_URL
      ? `${process.env.APP_BASE_URL}/api/x/oauth1/callback`
      : `${req.headers["x-forwarded-proto"] || req.protocol}://${req.headers["x-forwarded-host"] || req.get("host")}/api/x/oauth1/callback`;
    const authHeader = buildOAuth1HeaderAppOnly(
      "POST",
      X_OAUTH1_REQUEST_TOKEN_URL,
      callbackUrl,
      apiKey,
      apiSecret,
    );
    try {
      const tokenRes = await fetch(X_OAUTH1_REQUEST_TOKEN_URL, {
        method: "POST",
        headers: { Authorization: authHeader },
      });
      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error("[X OAuth1] Request token failed:", tokenRes.status, err);
        return res.redirect("/dashboard/social-accounts?x_oauth1_error=request_token_failed");
      }
      const body = await tokenRes.text();
      const params = new URLSearchParams(body);
      const oauthToken = params.get("oauth_token");
      if (!oauthToken) {
        return res.redirect("/dashboard/social-accounts?x_oauth1_error=request_token_failed");
      }
      session.xOauth1RequestToken = oauthToken;
      session.xOauth1RequestTokenSecret = params.get("oauth_token_secret") || "";
      return res.redirect(`${X_OAUTH1_AUTHORIZE_URL}?oauth_token=${oauthToken}`);
    } catch (err: any) {
      console.error("[X OAuth1] Request token error:", err.message || err);
      return res.redirect("/dashboard/social-accounts?x_oauth1_error=request_token_failed");
    }
  });

  app.get("/api/x/oauth1/callback", async (req: Request, res: Response) => {
    const apiKey = process.env.X_API_KEY;
    const apiSecret = process.env.X_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.redirect("/dashboard/social-accounts?x_oauth1_error=not_configured");
    }
    const session = req.session as any;
    const userId: number | undefined = session.userId;
    const { oauth_token, oauth_verifier } = req.query as Record<string, string>;
    const storedRequestToken: string = session.xOauth1RequestToken || "";
    const requestTokenSecret: string = session.xOauth1RequestTokenSecret || "";
    delete session.xOauth1RequestToken;
    delete session.xOauth1RequestTokenSecret;
    if (!userId || !oauth_token || !oauth_verifier) {
      return res.redirect("/dashboard/social-accounts?x_oauth1_error=missing_params");
    }
    if (storedRequestToken && oauth_token !== storedRequestToken) {
      console.error("[X OAuth1] oauth_token mismatch — possible CSRF");
      return res.redirect("/dashboard/social-accounts?x_oauth1_error=missing_params");
    }
    const authHeader = buildOAuth1Header(
      "POST",
      X_OAUTH1_ACCESS_TOKEN_URL,
      { oauth_verifier },
      apiKey,
      apiSecret,
      oauth_token,
      requestTokenSecret,
    );
    try {
      const tokenRes = await fetch(X_OAUTH1_ACCESS_TOKEN_URL, {
        method: "POST",
        headers: { Authorization: authHeader },
      });
      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error("[X OAuth1] Access token failed:", tokenRes.status, err);
        return res.redirect("/dashboard/social-accounts?x_oauth1_error=access_token_failed");
      }
      const body = await tokenRes.text();
      const params = new URLSearchParams(body);
      const accessToken = params.get("oauth_token");
      const accessTokenSecret = params.get("oauth_token_secret");
      if (!accessToken || !accessTokenSecret) {
        return res.redirect("/dashboard/social-accounts?x_oauth1_error=access_token_failed");
      }
      await storage.upsertSocialConnection(userId, {
        platform: "x",
        xOauth1Token: accessToken,
        xOauth1TokenSecret: accessTokenSecret,
      });
      return res.redirect("/dashboard/social-accounts?x_oauth1_connected=1");
    } catch (err: any) {
      console.error("[X OAuth1] Access token error:", err.message || err);
      return res.redirect("/dashboard/social-accounts?x_oauth1_error=access_token_failed");
    }
  });

  async function handlePostNow(req: Request, res: Response) {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { text, imageUrl, campaignPostId } = req.body;
    if (!text) {
      return res.status(400).json({ message: "text is required" });
    }
    if (text.length > 280) {
      return res.status(400).json({ message: "X posts are limited to 280 characters" });
    }

    const conn = await storage.getSocialConnectionByUserId(userId, "x");
    if (!conn?.xId) {
      return res.status(400).json({ message: "X account not connected. Please connect via the Social Accounts page." });
    }

    const accessToken = await getValidXAccessToken(userId);
    if (!accessToken) {
      return res.status(401).json({ message: "X session expired. Please reconnect.", expired: true });
    }

    const result = await postToX(
      accessToken,
      text,
      imageUrl || undefined,
    );

    if (result.success) {
      if (campaignPostId && result.tweetId) {
        const postUrl = conn.xUsername
          ? `https://x.com/${conn.xUsername}/status/${result.tweetId}`
          : undefined;
        storage.updateCampaignPostPlatformId(Number(campaignPostId), result.tweetId, postUrl).catch(() => {});
      }
      return res.json({ success: true, tweetId: result.tweetId, xUsername: conn.xUsername });
    }

    if (result.errorCode === "TOKEN_EXPIRED") {
      await storage.deleteSocialConnection(userId, "x");
      return res.status(401).json({ message: "X session expired. Please reconnect.", expired: true });
    }

    return res.status(400).json({ message: result.error || "Failed to post to X" });
  }

  app.post("/api/x/post-now", handlePostNow);
  app.post("/api/x/publish-now", handlePostNow);

  app.post("/api/x/schedule", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { text, imageUrl, scheduledAt, campaignPostId } = req.body;
    if (!text || !scheduledAt) {
      return res.status(400).json({ message: "text and scheduledAt are required" });
    }
    if (text.length > 280) {
      return res.status(400).json({ message: "X posts are limited to 280 characters" });
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      return res.status(400).json({ message: "scheduledAt must be a valid future date" });
    }

    const conn = await storage.getSocialConnectionByUserId(userId, "x");
    if (!conn?.xId) {
      return res.status(400).json({ message: "X account not connected." });
    }

    const accessToken = await getValidXAccessToken(userId);
    if (!accessToken) {
      return res.status(401).json({ message: "X session expired. Please reconnect.", expired: true });
    }

    const post = await storage.createScheduledSocialPost({
      userId,
      campaignPostId: campaignPostId || null,
      platform: "x",
      pageId: conn.xId,
      pageName: conn.xUsername || "X User",
      pageAccessToken: accessToken,
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
        console.warn(`[x-schedule] failed to sync campaign_posts.scheduledAt for #${campaignPostId}:`, (e as Error).message);
      }
    }

    const { pageAccessToken: _tok, ...safePost } = post;
    return res.json(safePost);
  });
}
