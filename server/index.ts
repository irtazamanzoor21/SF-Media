import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { ensureSessionTableExists, runStartupMigrations } from "./db";
import { runDrizzleMigrations } from "./startup";
import { startApprovalReminderScheduler } from "./scheduler";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import { postToFacebook, fetchFacebookMetrics } from "./facebook";
import { postToInstagram, fetchInstagramMetrics } from "./instagram";
import { postToLinkedIn, fetchLinkedInMetrics } from "./linkedin";
import { postToX, getValidXAccessToken, fetchXMetrics } from "./x";
import dotenv from "dotenv";
dotenv.config();

// On hosts like Render, default APP_BASE_URL to the service's external URL when not
// explicitly configured. Ensures HTTPS cookies, OAuth redirects, and Companion use
// the correct public origin without a manual first-deploy step. A custom domain can
// still override this by setting APP_BASE_URL explicitly.
if (!process.env.APP_BASE_URL && process.env.RENDER_EXTERNAL_URL) {
  process.env.APP_BASE_URL = process.env.RENDER_EXTERNAL_URL;
}

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function firstForwardedValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(",")[0]?.trim();
}

function isProductionHttpsRequired() {
  return process.env.NODE_ENV === "production" ||
    (!!process.env.APP_BASE_URL && process.env.APP_BASE_URL.startsWith("https://"));
}

app.use((req, res, next) => {
  if (!isProductionHttpsRequired()) {
    return next();
  }

  const forwardedProto = firstForwardedValue(req.headers["x-forwarded-proto"]);
  const isHttps = req.secure || forwardedProto === "https";

  if (isHttps) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
    return next();
  }

  const forwardedHost = firstForwardedValue(req.headers["x-forwarded-host"]);
  const host = forwardedHost || req.get("host");
  if (!host || host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return next();
  }

  return res.redirect(308, `https://${host}${req.originalUrl}`);
});


app.use((req, res, next) => {
  if (req.path.startsWith("/companion")) {
    return next();
  }
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  })(req, res, next);
});

app.use((req, res, next) => {
  if (req.path.startsWith("/companion")) {
    return next();
  }
  express.urlencoded({ extended: false })(req, res, next);
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    await runDrizzleMigrations();
  } catch (err: any) {
    console.error("[startup] drizzle migration failed:", err?.message || err);
    process.exit(1);
  }

  try {
    await runStartupMigrations();
  } catch (err: any) {
    console.warn("[startup] runStartupMigrations failed (non-fatal):", err?.message || err);
  }

  try {
    await ensureSessionTableExists();
  } catch (err: any) {
    console.warn("[startup] ensureSessionTableExists failed (non-fatal):", err?.message || err);
  }

  await registerRoutes(httpServer, app);

  // Trial reminder scheduler removed — subscriptions/trials no longer exist.

  try {
    startApprovalReminderScheduler();
  } catch (err: any) {
    console.warn("[startup] startApprovalReminderScheduler failed (non-fatal):", err?.message || err);
  }

  // Reset any market intelligence jobs that were left in "running" state
  // from a previous server instance (e.g. after a restart mid-analysis).
  try {
    const reset = await storage.resetStuckMarketIntelligenceJobs();
    if (reset > 0) {
      log(`Reset ${reset} stuck market intelligence job(s) to failed`);
    }
  } catch (err) {
    console.warn("Could not reset stuck market intelligence jobs:", err);
  }

  // Background scheduler: publish Facebook/Instagram posts when their scheduled time arrives
  setInterval(async () => {
    try {
      const now = new Date();
      const duePosts = await storage.getPendingScheduledSocialPosts(now);
      for (const post of duePosts) {
        try {
          let result: { success: boolean; postId?: string; tweetId?: string; error?: string };

          if (post.platform === "instagram") {
            if (!post.igUserId || !post.imageUrl) {
              await storage.updateScheduledSocialPost(post.id, {
                status: "failed",
                errorMessage: "Instagram post requires igUserId and imageUrl",
              });
              log(
                `[scheduler] Skipped Instagram post #${post.id}: missing igUserId or imageUrl`,
              );
              continue;
            }
            result = await postToInstagram(
              post.igUserId,
              post.pageAccessToken,
              post.message,
              post.imageUrl,
            );
          } else if (post.platform === "linkedin") {
            result = await postToLinkedIn(
              post.pageId,
              post.pageAccessToken,
              post.message,
              post.imageUrl ?? undefined,
            );
          } else if (post.platform === "x") {
            const freshXToken = await getValidXAccessToken(post.userId);
            if (!freshXToken) {
              result = {
                success: false,
                error:
                  "X account disconnected or token expired. Please reconnect.",
              };
            } else {
              result = await postToX(
                freshXToken,
                post.message,
                post.imageUrl ?? undefined,
              );
            }
          } else {
            result = await postToFacebook(
              post.pageId,
              post.pageAccessToken,
              post.message,
              post.imageUrl ?? undefined,
            );
          }

          if (result.success) {
            await storage.updateScheduledSocialPost(post.id, {
              status: "sent",
              sentAt: new Date(),
              errorMessage: null,
            });
            const platformId = result.tweetId || result.postId;
            if (platformId && post.campaignPostId) {
              try {
                let postUrl: string | undefined;
                if (post.platform === "x" && result.tweetId) {
                  postUrl = `https://x.com/i/status/${result.tweetId}`;
                } else if (post.platform === "facebook" && result.postId) {
                  postUrl = `https://www.facebook.com/${result.postId}`;
                } else if (post.platform === "instagram" && result.postId) {
                  postUrl = `https://www.instagram.com/p/${result.postId}/`;
                } else if (post.platform === "linkedin" && result.postId) {
                  postUrl = `https://www.linkedin.com/feed/update/${result.postId}/`;
                }
                await storage.updateCampaignPostPlatformId(post.campaignPostId, platformId, postUrl);
              } catch (err: any) {
                log(`[scheduler] Could not save platformPostId for campaignPost #${post.campaignPostId}: ${err.message}`);
              }
            }
            log(
              `[scheduler] Published scheduled post #${post.id} (${post.platform}) to ${post.pageName}`,
            );
          } else {
            await storage.updateScheduledSocialPost(post.id, {
              status: "failed",
              errorMessage: result.error || "Unknown error",
            });
            log(
              `[scheduler] Failed to publish scheduled post #${post.id}: ${result.error}`,
            );
            if (
              result.error &&
              (result.error.toLowerCase().includes("token") ||
                result.error.toLowerCase().includes("expired") ||
                result.error.toLowerCase().includes("session"))
            ) {
              await storage.deleteSocialConnection(post.userId, post.platform);
              log(
                `[scheduler] Cleared expired ${post.platform} connection for user #${post.userId}`,
              );
            }
          }
        } catch (postErr: any) {
          await storage.updateScheduledSocialPost(post.id, {
            status: "failed",
            errorMessage: postErr.message || "Unexpected error",
          });
          log(
            `[scheduler] Error publishing post #${post.id}: ${postErr.message}`,
          );
        }
      }
    } catch (err: any) {
      console.warn("[scheduler] Error checking scheduled posts:", err.message);
    }
  }, 60 * 1000);

  // Background metrics sync: every 3 hours, fetch live metrics for all posts with platformPostIds
  const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
  setInterval(async () => {
    try {
      const allUsers = await storage.getAllUsersForAdmin();
      for (const user of allUsers) {
        try {
          const campaignsWithPosts = await storage.getAllCampaignPostsByUserId(user.id);
          for (const { posts } of campaignsWithPosts) {
            for (const post of posts) {
              if (!post.platformPostId) continue;
              try {
                let metrics: { likes: number; comments: number; shares: number; impressions: number; reach?: number; saves?: number; clicks?: number } | null = null;
                if (post.platform === "x") {
                  const token = await getValidXAccessToken(user.id);
                  if (token) metrics = await fetchXMetrics(post.platformPostId, token);
                } else if (post.platform === "facebook") {
                  const conn = await storage.getSocialConnectionByUserId(user.id, "facebook");
                  if (conn?.pageAccessToken) {
                    const fbResult = await fetchFacebookMetrics(post.platformPostId, conn.pageAccessToken, conn.pageId, conn.userAccessToken);
                    if (fbResult && !("permissionError" in fbResult)) metrics = fbResult;
                  }
                } else if (post.platform === "instagram") {
                  const conn = await storage.getSocialConnectionByUserId(user.id, "facebook");
                  if (conn?.pageAccessToken) metrics = await fetchInstagramMetrics(post.platformPostId, conn.pageAccessToken);
                } else if (post.platform === "linkedin") {
                  const conn = await storage.getSocialConnectionByUserId(user.id, "linkedin");
                  if (conn?.pageAccessToken) metrics = await fetchLinkedInMetrics(post.platformPostId, conn.pageAccessToken);
                }
                if (metrics) {
                  await storage.upsertPostMetrics(post.id, {
                    likes: metrics.likes,
                    comments: metrics.comments,
                    shares: metrics.shares,
                    impressions: metrics.impressions,
                    reach: metrics.reach || 0,
                    saves: metrics.saves || 0,
                    clicks: metrics.clicks || 0,
                  });
                  await storage.createMetricSnapshot({
                    postId: post.id,
                    likes: metrics.likes,
                    comments: metrics.comments,
                    shares: metrics.shares,
                    impressions: metrics.impressions,
                    reach: metrics.reach || 0,
                    saves: metrics.saves || 0,
                    clicks: metrics.clicks || 0,
                  });
                }
              } catch (postErr: any) {
                log(`[metrics-sync] Failed to sync post #${post.id} (${post.platform}, user #${user.id}): ${postErr.message}`);
              }
            }
          }
        } catch (userErr: any) {
          log(`[metrics-sync] Failed to process user #${user.id}: ${userErr.message}`);
        }
      }
      log("[metrics-sync] Background sync completed");
    } catch (err: any) {
      console.warn("[metrics-sync] Background sync error:", err.message);
    }
  }, THREE_HOURS_MS);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      // host: "0.0.1.0",
      // reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
