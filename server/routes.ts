import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import { type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import bcrypt from "bcryptjs";
import multer from "multer";
import { OAuth2Client } from "google-auth-library";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import {
  loginSchema, registerSchema, companyInfoSchema, brandProfileUpdateSchema, createCampaignSchema,
  createOrganizationSchema, createRoleSchema, updateRoleSchema, assignRoleSchema, inviteMemberSchema,
  notificationPreferencesUpdateSchema, REMINDER_FREQUENCIES,
  isValidWebsiteUrl,
  campaignParseRequestSchema, campaignParseResponseSchema,
  campaignChatRequestSchema, campaignChatResponseSchema,
  refinePostRequestSchema, refineApplyRequestSchema,
  type RefinePostResponse,
  type ReminderFrequency,
  DEFAULT_CREATOR_PERMISSIONS,
} from "@shared/schema";
import { requireAdmin, requireSuperAdmin, requirePermission, getUserOrgContext, requireNotBlocked } from "./permissions";
import { generateAndUploadImage, uploadStreamToCloudinary, generateMediaImage, uploadBufferToCloudinary, aiEditImage, aiPromptEditImage, generateImageFromPrompt, type AIEditOperation } from "./image-service";
import { runCompetitorAnalysis } from "./competitor-analysis";
import {
  sendInvitationEmail,
  sendWelcomeEmail,
  sendAccountSuspendedEmail,
  sendAdminCreatedOrgEmail,
  sendApprovalReminderEmail,
} from "./email";
import {
  runImportPipeline,
  mergeBrandVoice,
  BRAND_VOICE_FIELDS,
  type BrandVoiceField,
  type FieldAction,
  type ImportProgress,
  type SourceMeta,
} from "./brand-import";
import { registerFacebookRoutes } from "./facebook";
import { registerInstagramRoutes } from "./instagram";
import { registerLinkedInRoutes } from "./linkedin";
import { registerXRoutes } from "./x";
import crypto from "crypto";
import * as pdfParseModule from "pdf-parse";
import * as mammothModule from "mammoth";
import * as companion from "@uppy/companion";
import { WebSocketServer } from "ws";
import { createHmac } from "node:crypto";
import * as fs from "fs";
const pdfParse = (pdfParseModule as any).default || pdfParseModule;

function parseGeminiJson(raw: string): any {
  let text = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  const startIdx = text.search(/[\[{]/);
  if (startIdx === -1) return {};
  const startChar = text[startIdx];
  const endChar = startChar === "[" ? "]" : "}";

  let depth = 0;
  let endIdx = -1;
  let inString = false;
  let escaped = false;
  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === startChar) depth++;
    if (ch === endChar) { depth--; if (depth === 0) { endIdx = i; break; } }
  }

  if (endIdx !== -1) {
    return JSON.parse(text.slice(startIdx, endIdx + 1));
  }

  let truncated = text.slice(startIdx);
  while (truncated.length > 0) {
    const lastComma = truncated.lastIndexOf(",");
    if (lastComma === -1) break;
    truncated = truncated.slice(0, lastComma);
    const closers = startChar === "[" ? "]" : "}";
    let attempt = truncated;
    let openBraces = (attempt.match(/{/g) || []).length - (attempt.match(/}/g) || []).length;
    let openBrackets = (attempt.match(/\[/g) || []).length - (attempt.match(/]/g) || []).length;
    while (openBraces > 0) { attempt += "}"; openBraces--; }
    while (openBrackets > 0) { attempt += "]"; openBrackets--; }
    try {
      return JSON.parse(attempt);
    } catch {}
  }

  throw new Error("Failed to parse Gemini JSON response");
}

function stripMd(text: string): string {
  return text.replace(/\*\*|__|\*|_|`/g, "").trim();
}

// Best-effort: infer what the chat assistant is asking for, from its reply
// text. Used ONLY in the rare validation-failure path (Gemini returned
// unparseable JSON, so there's no captured state to infer from). Analyses
// just the LAST sentence — earlier sentences recap prior answers and would
// cause false positives (e.g. "Got it, a friendly tone… how many posts?").
function detectNextFieldFromReply(reply: string):
  "description" | "platforms" | "tone" | "postsCount" | "callToAction" | "schedule" | null {
  const sentences = (reply || "").split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  const r = (sentences[sentences.length - 1] || reply || "").toLowerCase();

  // If the reply names ≥ 2 platforms in the same message and ends with a
  // question, it's almost certainly asking the user to pick one — covers
  // phrasings like "We can post on LinkedIn, X, Instagram, and Facebook.
  // Which of these would you like to use?" where the word "platforms" never
  // actually appears.
  const platformHits =
    (/\blinkedin\b/.test(r) ? 1 : 0) +
    (/\binstagram\b/.test(r) ? 1 : 0) +
    (/\bfacebook\b/.test(r) ? 1 : 0) +
    (/\b(x|twitter)\b/.test(r) ? 1 : 0);
  if (platformHits >= 2 && /\?/.test(r)) return "platforms";

  // Same idea for tone — if the reply names ≥ 2 of our tone enum values and
  // ends with a question, it's a tone ask.
  const toneHits =
    (/\bprofessional\b/.test(r) ? 1 : 0) +
    (/\bcasual\b/.test(r) ? 1 : 0) +
    (/\benergetic\b/.test(r) ? 1 : 0) +
    (/\bfriendly\b/.test(r) ? 1 : 0) +
    (/\bwitty\b/.test(r) ? 1 : 0);
  if (toneHits >= 2 && /\?/.test(r)) return "tone";

  if (/\b(which|what)\s+(platform|platforms|channel|channels|social network|networks|social media)\b/.test(r)) return "platforms";
  if (/\b(platforms?|channels?)\s+(would|do|will|are|to use|to post)\b/.test(r)) return "platforms";
  if (/\b(post|posting)\s+(on|to|via)\b/.test(r) && /\b(which|what|where)\b/.test(r)) return "platforms";
  if (/\b(which|what)\s+(tone|voice|style|vibe)\b/.test(r)) return "tone";
  if (/\btone\b/.test(r) && /\b(should|prefer|use|like)\b/.test(r)) return "tone";
  if (/\bhow\s+(many|much)\s+(posts?|content pieces?)\b/.test(r)) return "postsCount";
  if (/\b(number of posts|posts per platform|how many social)\b/.test(r)) return "postsCount";
  if (/\bcall.?to.?action\b|\bcta\b/.test(r)) return "callToAction";
  if (/\b(what|which).*(action|do you want.*do|ask.*do)\b/.test(r)) return "callToAction";
  if (/\b(when|schedule|start date|end date|launch|timeline|run from|run between)\b/.test(r)) return "schedule";
  if (/\b(what|tell me)\s+(about|is)\s+(the campaign|this campaign|the topic|the goal)\b/.test(r)) return "description";
  return null;
}

// Authoritative: derive which field still needs to be gathered from the
// captured state, in strict priority order. This is the SINGLE source of
// truth for the chat's nextField/ready — the AI's reply phrasing is not
// consulted because replies recap prior answers and mislead text matching.
// A field is "missing" purely when its value is absent; the extraction
// prompt no longer silently defaults during the chat, so empty == not given.
function inferFieldFromMissingState(e: {
  description?: string;
  platforms?: any[];
  tone?: string | null;
  postsCount?: number | null;
  callToAction?: string;
}): "description" | "platforms" | "tone" | "postsCount" | "callToAction" | null {
  if (!e.description || e.description.trim().length < 3) return "description";
  if (!e.platforms || e.platforms.length === 0) return "platforms";
  if (!e.tone) return "tone";
  if (!e.postsCount) return "postsCount";
  if (!e.callToAction || !e.callToAction.trim()) return "callToAction";
  return null;
}

// Normalize a parsed-but-unvalidated chat state object so it passes Zod.
// Gemini commonly returns slightly-off shapes — capitalized enum values
// ("LinkedIn", "Casual"), "twitter" instead of "x", a string postsCount,
// an over-long CTA. Without this, one malformed field rejects the whole
// object and the user dead-ends with no Review & Create button.
function normalizeChatState(raw: any): Record<string, any> {
  const out: Record<string, any> = {};
  const r = raw && typeof raw === "object" ? raw : {};

  // platforms — accept string or array; lowercase; twitter→x; enum-filter; dedupe.
  const PLATFORM_SET = new Set(["linkedin", "x", "instagram", "facebook"]);
  let platformsIn: any[] = Array.isArray(r.platforms)
    ? r.platforms
    : typeof r.platforms === "string" && r.platforms.trim()
      ? [r.platforms]
      : [];
  const platforms = Array.from(new Set(
    platformsIn
      .map((p) => String(p).trim().toLowerCase())
      .map((p) => (p === "twitter" ? "x" : p))
      .filter((p) => PLATFORM_SET.has(p)),
  ));
  out.platforms = platforms;

  // tone — lowercase; exact enum match, else contains-match, else null.
  const TONES_LIST = ["professional", "casual", "energetic", "friendly", "witty"];
  if (typeof r.tone === "string") {
    const t = r.tone.trim().toLowerCase();
    out.tone = TONES_LIST.includes(t)
      ? t
      : (TONES_LIST.find((tn) => t.includes(tn)) ?? null);
  } else {
    out.tone = null;
  }

  // postsCount — number → round+clamp 1-5; string → first digit run; else null.
  let pc: number | null = null;
  if (typeof r.postsCount === "number" && Number.isFinite(r.postsCount)) {
    pc = Math.round(r.postsCount);
  } else if (typeof r.postsCount === "string") {
    const m = r.postsCount.match(/\d+/);
    if (m) pc = parseInt(m[0], 10);
  }
  out.postsCount = pc != null && pc >= 1 && pc <= 5 ? pc : null;

  // string fields — coerce, trim, truncate.
  out.description = typeof r.description === "string" ? r.description.trim().slice(0, 1000) : "";
  out.callToAction = typeof r.callToAction === "string" ? r.callToAction.trim().slice(0, 80) : "";

  // dates — keep only YYYY-MM-DD strings.
  const isoDate = (v: any) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null);
  out.startDate = isoDate(r.startDate);
  out.endDate = isoDate(r.endDate);

  // defaultedFields — array of strings.
  out.defaultedFields = Array.isArray(r.defaultedFields)
    ? r.defaultedFields.filter((s: any) => typeof s === "string")
    : [];

  return out;
}

function cleanBrandProfileArrays(profile: any): any {
  const arrayFields = ["messagingPillars", "doLanguageRules", "dontLanguageRules", "ctaPreferences", "hashtagThemes"];
  for (const field of arrayFields) {
    if (Array.isArray(profile[field])) {
      profile[field] = profile[field].map((s: any) => typeof s === "string" ? stripMd(s) : s);
    }
  }
  return profile;
}

const mammoth = (mammothModule as any).default || mammothModule;

// Document types the onboarding extractor can actually read (mirrors the client allow-list).
const ONBOARDING_ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/png",
  "image/jpeg",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ONBOARDING_ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.originalname}. Allowed types: PDF, DOCX, TXT, PNG, JPG.`));
    }
  },
});
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 20 } });

interface CachedImport {
  importId: string;
  organizationId: number | null;
  userId: number;
  extracted: Record<string, any>;
  sourceMeta: SourceMeta;
  createdAt: number;
}
const importCache = new Map<string, CachedImport>();
const IMPORT_CACHE_TTL_MS = 10 * 60 * 1000;
function pruneImportCache() {
  const now = Date.now();
  importCache.forEach((v, k) => {
    if (now - v.createdAt > IMPORT_CACHE_TTL_MS) importCache.delete(k);
  });
}

const TEST_REMINDER_RATE_LIMIT = 5;
const TEST_REMINDER_WINDOW_MS = 60 * 60 * 1000;
const testReminderHits = new Map<number, number[]>();
function checkTestReminderRateLimit(userId: number): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - TEST_REMINDER_WINDOW_MS;
  const recent = (testReminderHits.get(userId) || []).filter((t) => t > cutoff);
  if (recent.length >= TEST_REMINDER_RATE_LIMIT) {
    const oldest = recent[0];
    return { allowed: false, retryAfterSec: Math.ceil((oldest + TEST_REMINDER_WINDOW_MS - now) / 1000) };
  }
  recent.push(now);
  testReminderHits.set(userId, recent);
  return { allowed: true, retryAfterSec: 0 };
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Fallback for the campaign chat: when the inline ###STATE### JSON is missing
// or unusable, run ONE focused extraction-only call over the full transcript
// PLUS the assistant's reply. Sees the reply, so it stays consistent with it.
// Never throws — returns a normalized state object or null.
async function runFallbackChatExtraction(
  transcript: string,
  assistantReply: string,
  brandContext: string,
  today: string,
): Promise<Record<string, any> | null> {
  try {
    const prompt = `You are an extraction assistant. Read the conversation between a user and a campaign-setup assistant (including the assistant's latest reply) and produce a JSON object describing ONLY the campaign details the user has actually provided.

Today's date: ${today}
${brandContext}

Conversation:
${transcript}

[assistant]: ${assistantReply}

Return ONLY a JSON object (no markdown fences) with these keys:
- description (string, "" if not given yet)
- platforms (array of "linkedin" | "x" | "instagram" | "facebook"; [] if none yet)
- tone ("professional" | "casual" | "energetic" | "friendly" | "witty" or null)
- postsCount (integer 1-5 or null)
- callToAction (string or "" if not given)
- startDate ("YYYY-MM-DD" or null)
- endDate ("YYYY-MM-DD" or null)
- defaultedFields (array of strings — fields the user explicitly told you to default/skip)

Output JSON only.`;
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
    });
    const result = await model.generateContent(prompt);
    const raw = result.response.text() || "";
    if (!raw.trim()) return null;
    return normalizeChatState(parseGeminiJson(raw));
  } catch (e) {
    console.error("Campaign chat — fallback extraction failed:", (e as Error).message);
    return null;
  }
}

declare module "express-session" {
  interface SessionData {
    userId: number;
    pendingOAuthToken?: { token: string; pluginId: string; urlProvider: string; expiresAt: number };
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

function generateUploadToken(userId: number): string {
  const secret = process.env.COMPANION_SECRET || "companion-fallback-secret-change-me";
  return createHmac("sha256", secret).update(userId.toString()).digest("hex");
}

function verifyUploadToken(token: string, userId: number): boolean {
  return token === generateUploadToken(userId);
}

async function extractTextFromFile(file: Express.Multer.File): Promise<string> {
  const type = file.mimetype;
  try {
    if (type === "text/plain") {
      return file.buffer.toString("utf-8").slice(0, 50000);
    }
    if (type === "application/pdf") {
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent([
          {
            inlineData: {
              mimeType: "application/pdf",
              data: file.buffer.toString("base64"),
            },
          },
          "Extract all the text content from this PDF document. Return only the extracted text, preserving the structure and formatting as much as possible. No commentary or summaries — just the raw text.",
        ]);
        return (result.response.text() || "").slice(0, 50000);
      } catch (pdfError: any) {
        console.error("PDF AI extraction error:", pdfError.message);
        return "";
      }
    }
    if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      return result.value.slice(0, 50000);
    }
    if (type.startsWith("image/")) {
      const base64Image = file.buffer.toString("base64");
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: type,
            data: base64Image,
          },
        },
        "Extract all visible text from this image. If there is no text, describe the visual branding elements (colors, logos, style, mood). Return only the extracted/described content, no commentary.",
      ]);
      return result.response.text() || "";
    }
  } catch (e: any) {
    console.error(`Error extracting text from ${file.originalname}:`, e.message);
  }
  return "";
}

function cleanHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function tryFetchUrl(targetUrl: string): Promise<string | null> {
  try {
    const fetchRes = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"macOS"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });

    console.log(`URL fetch ${targetUrl}: status=${fetchRes.status}`);

    if (fetchRes.ok) {
      const html = await fetchRes.text();
      const cleaned = cleanHtml(html);

      if (cleaned.length < 50) {
        console.log(`URL fetch ${targetUrl}: content too short (${cleaned.length} chars), may be blocked`);
        return null;
      }

      return cleaned.slice(0, 10000);
    } else {
      console.error(`URL fetch ${targetUrl}: HTTP ${fetchRes.status} ${fetchRes.statusText}`);
    }
  } catch (e: any) {
    console.error(`URL fetch ${targetUrl} error:`, e.message);
  }
  return null;
}

async function extractTextFromUrl(url: string): Promise<string> {
  let baseUrl = url.trim();
  if (!/^https?:\/\//i.test(baseUrl)) {
    baseUrl = "https://" + baseUrl;
  }

  const urlObj = new URL(baseUrl);
  const hostname = urlObj.hostname;

  const variations: string[] = [baseUrl];

  if (hostname.startsWith("www.")) {
    variations.push(baseUrl.replace("://www.", "://"));
  } else {
    variations.push(baseUrl.replace("://", "://www."));
  }

  if (baseUrl.startsWith("https://")) {
    variations.push(baseUrl.replace("https://", "http://"));
  }

  for (const tryUrl of variations) {
    const result = await tryFetchUrl(tryUrl);
    if (result) return result;
  }

  console.log(`All URL variations failed for ${url}, using AI knowledge fallback`);
  return `[WEBSITE_UNREACHABLE] The website at ${url} could not be accessed directly (likely has bot protection). Please use your training knowledge about this website/company to inform the brand analysis. The URL is: ${url}`;
}

async function analyzeBrandVoiceWithAI(
  companyName: string,
  industry: string,
  textContent: string,
  url?: string
): Promise<any> {
  const hasWebsiteContent = textContent.includes("[WEBSITE_UNREACHABLE]");
  const urlContext = url ? `Website: ${url}` : "";

  const prompt = `You are a brand strategist. Analyze the following brand content and extract a structured brand voice profile.

Company: ${companyName}
Industry: ${industry}
${urlContext}

${hasWebsiteContent ? `NOTE: The company's website could not be crawled directly. Use your training knowledge about this company and their website (${url}) to inform the brand analysis. Combine any available content below with your own knowledge to create a comprehensive profile.` : ""}

Content to analyze:
${textContent.slice(0, 15000)}

Return a JSON object with these fields:
- brandSummary: A 2-3 sentence summary of the brand's identity and mission
- targetAudience: A description of the ideal target audience
- messagingPillars: An array of 3-5 key messaging themes
- toneStyle: A brief description of the brand's tone (e.g., "Professional yet approachable, with a focus on empowerment")
- doLanguageRules: An array of 3-5 "do" rules for brand communication
- dontLanguageRules: An array of 3-5 "don't" rules for brand communication
- ctaPreferences: An array of 2-4 preferred call-to-action styles
- hashtagThemes: An array of 3-5 hashtag categories or themes

Return ONLY valid JSON, no markdown code fences.`;

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { temperature: 0.7, maxOutputTokens: 4000 } });
  const result = await model.generateContent(prompt);

  const content = result.response.text() || "{}";
  return cleanBrandProfileArrays(parseGeminiJson(content));
}

async function generateSamplePosts(profile: any): Promise<{ linkedin: string; instagram: string }> {
  const prompt = `You are a social media content strategist. Based on this brand profile, generate one LinkedIn post and one Instagram post.

Brand: ${profile.companyName} (${profile.industry})
Summary: ${profile.brandSummary}
Audience: ${profile.targetAudience}
Tone: ${profile.toneStyle}
Messaging Pillars: ${(profile.messagingPillars || []).join(", ")}
Do: ${(profile.doLanguageRules || []).join("; ")}
Don't: ${(profile.dontLanguageRules || []).join("; ")}
Hashtag Themes: ${(profile.hashtagThemes || []).join(", ")}

Requirements:
- LinkedIn: Professional tone, 150-250 words, thought leadership style, include a call to action
- Instagram: Casual and engaging, 50-150 words, include relevant hashtags (5-8), use line breaks for readability

Return ONLY valid JSON with fields "linkedin" and "instagram". No markdown fences.`;

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { temperature: 0.8, maxOutputTokens: 3000 } });
  const result = await model.generateContent(prompt);

  const content = result.response.text() || "{}";
  return parseGeminiJson(content);
}

async function generateCampaignPosts(
  brandProfile: any,
  campaignSettings: {
    companyName: string;
    description: string;
    platform: string;
    tone: string;
    postsCount: number;
    callToAction: string;
  },
  topPerformingPosts?: Array<{ content: string; platform: string; impressions: number; reach: number; likes: number; comments: number; shares: number; saves: number; clicks: number; compositeScore: number }>,
  marketIntelligenceData?: { keywordInsights: Array<{ keyword: string; searchVolume: number; difficulty: number; cpc: number; intent: string; relatedKeywords: string[] }>; discoveredCompetitors: Array<{ domain: string; score: number }> } | null
): Promise<Array<{ content: string; imagePrompt: string }>> {
  const { PLATFORM_SETTINGS } = await import("@shared/schema");
  const platformKey = campaignSettings.platform as keyof typeof PLATFORM_SETTINGS;
  const platSettings = PLATFORM_SETTINGS[platformKey];
  const currentDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  let topPostsSection = "";
  if (topPerformingPosts && topPerformingPosts.length > 0) {
    const postEntries = topPerformingPosts.map((p, i) => {
      const engRate = p.reach > 0 ? ((p.likes + p.comments + p.shares + p.saves) / p.reach * 100).toFixed(2) : "0";
      const ctr = p.impressions > 0 ? ((p.clicks / p.impressions) * 100).toFixed(2) : "0";
      return `Post #${i + 1} (${p.platform}, Score: ${p.compositeScore}):
Content: "${p.content}"
Metrics: ${p.impressions} impressions, ${p.reach} reach, ${p.likes} likes, ${p.comments} comments, ${p.shares} shares, ${p.saves} saves, ${p.clicks} clicks
Engagement Rate: ${engRate}% | CTR: ${ctr}%`;
    }).join("\n\n");

    topPostsSection = `
=== LEARNING FROM TOP PERFORMING POSTS ===
The following are the user's highest-performing posts ranked by a composite score (engagement rate, click-through rate, and save rate). Analyze what made these posts successful — their hooks, tone, structure, CTA placement, hashtag strategy, and emotional triggers. Apply these winning patterns to the new posts.

${postEntries}

Platform Match Rule: If any source post above is from a different platform than ${platSettings.label}, extract only its structural and emotional patterns (hook type, pacing, emotional trigger, CTA logic). Ignore its length, format, and hashtag conventions entirely.
Rewrite Rule: Rewrite all ideas entirely in the context of "${campaignSettings.description}". Every post must be original — no phrase, structure, or sentence should resemble the source posts.
`;
  }

  const prompt = `=== PLATFORM-SPECIFIC RULES ===
Platform: ${platSettings.label}
Character Limit: ${platSettings.characterLimit} characters maximum.
Recommended Post Length: ${platSettings.recommendedLength}
Soft Length Target: Aim for 60–70% of the character limit. Do not write to the ceiling on every post.
Hashtag Limit: Maximum ${platSettings.hashtagLimit} hashtags per post.
Hashtag Best Practice: ${platSettings.hashtagTip}
Image Dimensions: ${platSettings.imageWidth}x${platSettings.imageHeight} pixels (${platSettings.imageLabel})

=== PRIMARY FOCUS: CAMPAIGN TOPIC ===
You are a social media content strategist. Generate exactly ${campaignSettings.postsCount} ${platSettings.label} posts for a campaign.
Company: ${campaignSettings.companyName}
Campaign Topic / Description: ${campaignSettings.description}
Communication Tone: ${campaignSettings.tone}
Call To Action: ${campaignSettings.callToAction}
Current Date: ${currentDate} — use this for any time-sensitive language. Do not infer or hallucinate dates.
Tone Priority Rule: The Communication Tone above overrides Brand Voice tone in the brand voice section if they conflict. Brand Voice is for style and vocabulary only.
Hook Variety Rule: Across all ${campaignSettings.postsCount} posts, vary the opening hook type. Use at least one of each: a direct question, a statistic or bold claim, a story opener, and a direct address to the reader. No two posts may share the same opening sentence structure.
CTA Variety Rule: Each post must close with a different CTA phrasing. Do not repeat the same CTA wording across posts.
Character Limit Rule: Strictly respect the ${platSettings.characterLimit} character limit. If a post needs trimming, cut from the middle body — never from the hook or the CTA.
${platformKey === "x" ? `X (Twitter) Hard Limit — CRITICAL:
- The TOTAL tweet including body AND hashtags combined must be 280 characters or fewer. No exceptions.
- Hashtags count toward the 280-char cap — plan accordingly.
- Keep the post BODY to 200 characters MAXIMUM to leave room for hashtags.
- Count every character carefully: letters, spaces, punctuation, newlines all count.
- If your draft body exceeds 200 characters, rewrite it shorter before proceeding.
- A body of 200 chars + 2 newlines (2 chars) + 3 hashtags (~30 chars) = ~232 chars total — well within limit.` : ""}
Banned Phrases: Never use any of the following — they are generic and damage authenticity:
"In today's world," "Game-changer," "We're excited to announce," "Dive in," "Elevate your," "It's no secret that," "Unlock the power of," "Revolutionize your," "Take your [X] to the next level," "At the end of the day"
${topPostsSection}
=== SECONDARY: BRAND VOICE (STYLE & VOCABULARY ONLY) ===
Company: ${brandProfile.companyName} (${brandProfile.industry})
Brand Summary: ${brandProfile.brandSummary || "N/A"}
Target Audience: ${brandProfile.targetAudience || "N/A"}
Tone Style: ${brandProfile.toneStyle || "N/A"} — apply to word choice and vocabulary only. Campaign tone takes priority.
Messaging Pillars: ${(brandProfile.messagingPillars || []).join(", ")}
Language Do's: ${(brandProfile.doLanguageRules || []).join("; ")}
Language Don'ts: ${(brandProfile.dontLanguageRules || []).join("; ")}
${marketIntelligenceData && marketIntelligenceData.keywordInsights.length > 0 ? `
=== MARKET INTELLIGENCE (USE TO SHARPEN ANGLES & TOPIC RELEVANCE) ===
These insights are derived from real competitor keyword analysis in this industry. Use them to craft posts that are aligned with what the market is actively searching for.

Keyword Intelligence (sorted by search demand):
${[...marketIntelligenceData.keywordInsights]
  .filter(k => k.intent !== "navigational")
  .sort((a, b) => b.searchVolume - a.searchVolume)
  .slice(0, 10)
  .map(k => {
    const normalizedIntent = k.intent.toLowerCase();
    const intentDirective =
      normalizedIntent === "transactional" ? "→ write action-driven posts with strong CTA" :
      (normalizedIntent === "commercial" || normalizedIntent === "commercial investigation") ? "→ write comparison, proof, or social-proof posts" :
      "→ write educational, how-to, or insight-led posts";
    const related = k.relatedKeywords && k.relatedKeywords.length > 0 ? ` | related: ${k.relatedKeywords.slice(0, 3).join(", ")}` : "";
    return `- "${k.keyword}" — ${k.searchVolume.toLocaleString()} searches/mo | difficulty: ${k.difficulty}/100 | CPC: $${k.cpc} | intent: ${k.intent} ${intentDirective}${related}`;
  }).join("\n")}

Market Competitors: ${marketIntelligenceData.discoveredCompetitors.slice(0, 5).map(c => c.domain).join(", ")}
Market Intelligence Rules:
- Use the keyword insights to choose post angles — higher search volume + lower difficulty = higher opportunity topic
- Match post format to search intent: informational → educational content; transactional → CTA-led; commercial → proof/comparison
- Incorporate related keywords naturally to increase post relevance and reach
- Do NOT mention competitor brand names directly in the posts
- Only use market intelligence to inspire topic angles and vocabulary — brand voice and campaign tone remain primary` : ""}

=== OUTPUT FORMAT ===
Return ONLY a valid JSON array with exactly ${campaignSettings.postsCount} objects. No preamble, no explanation, no markdown — raw JSON only.
Each object must follow this exact schema:
{
  "platform": "string — the target platform label",
  "content": "string — the post text, hashtags excluded",
  "hashtags": ["string", "string"],
  "imagePrompt": "string — 50 to 100 words describing the visual: subject, setting, mood, color palette, lighting style, and what to avoid",
  "strategyNote": "string — one sentence naming which pattern from the top-performing posts was applied and how"
}`;

  function mapParsedPosts(parsed: any[]): Array<{ content: string; imagePrompt: string }> {
    return parsed.map((post: any) => {
      if (post.content && typeof post.content === "string" && post.imagePrompt) {
        let fullContent = post.content;
        if (Array.isArray(post.hashtags) && post.hashtags.length > 0) {
          const hashtagStr = post.hashtags.map((h: string) => h.startsWith("#") ? h : `#${h}`).join(" ");
          fullContent = fullContent.trim() + "\n\n" + hashtagStr;
        }
        if (platformKey === "x") {
          const plain = fullContent.replace(/<[^>]*>/g, "");
          if (plain.length > 280) {
            fullContent = truncateTo280(plain);
          }
        }
        return { content: fullContent, imagePrompt: post.imagePrompt };
      }
      let fallbackContent = post.content || "";
      if (platformKey === "x") {
        const plain = fallbackContent.replace(/<[^>]*>/g, "");
        if (plain.length > 280) fallbackContent = truncateTo280(plain);
      }
      return { content: fallbackContent, imagePrompt: post.imagePrompt || "" };
    });
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { temperature: 0.7, maxOutputTokens: 16000 } });
  const result = await model.generateContent(prompt);

  const rawContent = result.response.text() || "[]";
  const parsed = parseGeminiJson(rawContent);
  let posts = mapParsedPosts(parsed)
    .filter(p => p.content && p.content.trim().length > 0)
    .slice(0, campaignSettings.postsCount);

  if (posts.length < campaignSettings.postsCount) {
    const missing = campaignSettings.postsCount - posts.length;
    console.warn(`[generateCampaignPosts] Got ${posts.length}/${campaignSettings.postsCount} posts for ${platformKey}, retrying for ${missing} more.`);
    try {
      const retryPrompt = prompt.replace(
        `Generate exactly ${campaignSettings.postsCount} ${platSettings.label} posts`,
        `Generate exactly ${missing} ${platSettings.label} posts`
      ).replace(
        `Return ONLY a valid JSON array with exactly ${campaignSettings.postsCount} objects`,
        `Return ONLY a valid JSON array with exactly ${missing} objects`
      ).replace(
        `Across all ${campaignSettings.postsCount} posts, vary the opening hook type`,
        `Across all ${missing} posts, vary the opening hook type`
      );
      const retryResult = await model.generateContent(retryPrompt);
      const retryRaw = retryResult.response.text() || "[]";
      const retryParsed = parseGeminiJson(retryRaw);
      const retryPosts = mapParsedPosts(retryParsed).filter(p => p.content && p.content.trim().length > 0);
      posts = [...posts, ...retryPosts].slice(0, campaignSettings.postsCount);
    } catch (retryErr: any) {
      console.error(`[generateCampaignPosts] Retry failed for ${platformKey}:`, retryErr?.message || retryErr);
    }
  }

  if (posts.length < campaignSettings.postsCount) {
    console.warn(`[generateCampaignPosts] Final post count short for ${platformKey}: expected ${campaignSettings.postsCount}, got ${posts.length} after retry.`);
  }

  return posts;
}

function truncateTo280(text: string): string {
  if (text.length <= 280) return text;
  const candidate = text.slice(0, 279);
  const lastSpace = candidate.lastIndexOf(" ");
  const trimmed = lastSpace > 0 ? candidate.slice(0, lastSpace) : candidate;
  return trimmed + "…";
}

// Structured refinement prompt for a single post's caption.
// Loads the same brief used by generateCampaignPosts (brand + platform rules
// + campaign settings) so the model sees the full context the original was
// produced from, then applies the user's feedback verbatim. Vague prompts
// drift off-brand and break char limits — the labeled sections + explicit
// "preserve unless contradicted" instruction prevent that.
async function refinePostContent(args: {
  currentContent: string;
  feedback: string;
  platform: string;
  campaign: { description: string; tone: string; callToAction: string; companyName: string };
  brandProfile: any | null;
  marketIntelligence: { keywords: string[] } | null;
}): Promise<string> {
  const { PLATFORM_SETTINGS } = await import("@shared/schema");
  const platformKey = args.platform as keyof typeof PLATFORM_SETTINGS;
  const platSettings = PLATFORM_SETTINGS[platformKey];
  const brand = args.brandProfile;

  const sanitizedFeedback = args.feedback.trim();

  const prompt = `You are revising a single social media post based on user feedback.
Your job: produce a NEW caption that addresses the feedback while keeping
everything else faithful to the original brief.

<original_brief>
  Company:           ${brand?.companyName || args.campaign.companyName}
  Industry:          ${brand?.industry || "(unspecified)"}
  Campaign topic:    ${args.campaign.description}
  Platform:          ${platSettings.label}
  Tone:              ${args.campaign.tone}
  Call to action:    ${args.campaign.callToAction}
  Brand summary:     ${brand?.brandSummary || "(none provided)"}
  Target audience:   ${brand?.targetAudience || "(none provided)"}
  Brand tone style:  ${brand?.toneStyle || "(none provided)"}
  Messaging pillars: ${(brand?.messagingPillars || []).join("; ") || "(none)"}
  Language do's:     ${(brand?.doLanguageRules || []).join("; ") || "(none)"}
  Language don'ts:   ${(brand?.dontLanguageRules || []).join("; ") || "(none)"}
  Market keywords:   ${(args.marketIntelligence?.keywords || []).join(", ") || "(none)"}
</original_brief>

<platform_rules>
  Max characters:        ${platSettings.characterLimit} (HARD limit — count before responding)
  Recommended length:    ${platSettings.recommendedLength}
  Hashtag limit:         ${platSettings.hashtagLimit}
  Hashtag best practice: ${platSettings.hashtagTip}
</platform_rules>

<current_caption>
${args.currentContent}
</current_caption>

<user_feedback>
${sanitizedFeedback}
</user_feedback>

<instructions>
1. Apply the user's feedback to <current_caption>.
2. Preserve the original brief (topic, tone, CTA, brand voice, banned-phrase
   avoidance) UNLESS the feedback explicitly contradicts it. If it
   contradicts (e.g. user says "drop the CTA" or "be more casual"), follow
   the feedback.
3. Stay within <platform_rules>. Character count is HARD — count before
   responding. Hashtags count toward the limit on X (Twitter).
4. Output ONLY the new caption text. No preamble, no quotes around the
   caption, no "Here is the revised post:", no explanation, no markdown
   fences. Just the caption text the user will publish.
</instructions>`;

  if (process.env.NODE_ENV !== "production") {
    console.log("[refinePostContent] prompt:\n", prompt);
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0.7, maxOutputTokens: 4000 },
  });
  const result = await model.generateContent(prompt);
  let out = (result.response.text() || "").trim();

  // Strip surrounding quotes / code fences if the model adds them anyway.
  if (out.startsWith("```")) {
    out = out.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/i, "").trim();
  }
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) {
    out = out.slice(1, -1).trim();
  }

  // Safety net: enforce platform char cap (LLMs miscount).
  if (platformKey === "x") {
    const plain = out.replace(/<[^>]*>/g, "");
    if (plain.length > 280) {
      console.warn(`[refinePostContent] X caption ${plain.length} chars > 280, truncating`);
      out = truncateTo280(plain);
    }
  } else if (platSettings.characterLimit > 0 && out.length > platSettings.characterLimit) {
    console.warn(`[refinePostContent] ${platSettings.label} caption ${out.length} > ${platSettings.characterLimit}, truncating`);
    out = out.slice(0, platSettings.characterLimit - 1) + "…";
  }

  return out;
}

// Refines an existing image based on user feedback. Returns a base64
// data URL (NOT uploaded to Cloudinary — that happens on apply, so
// discarded previews don't accumulate orphan uploads).
// Rewrites the original image prompt into a new, complete image prompt that
// incorporates the user's feedback. Run as a separate Gemini text call before
// the actual image generation — produces something the text-to-image model
// can render from scratch without any reference image.
//
// Why a separate call: feeding the model vague feedback like "more realistic"
// or "more attractive" along with a long structured directive yields weak
// results. Asking a text model to first translate the feedback into a concrete
// image-generation prompt produces specifics ("photorealistic photography,
// natural lighting") that the image model can actually render.
async function buildRefinedImagePrompt(args: {
  currentImagePrompt: string;
  feedback: string;
  campaign: { description: string; tone: string };
  brandProfile: any | null;
  platform: string;
}): Promise<string> {
  const { PLATFORM_SETTINGS } = await import("@shared/schema");
  const platSettings = PLATFORM_SETTINGS[args.platform as keyof typeof PLATFORM_SETTINGS];

  const metaPrompt = `You are rewriting an image-generation prompt for a social media post, based on the original prompt, the campaign brief, and the user's feedback about how the next image should differ.

Produce a NEW, complete image-generation prompt that:
1. Stays as close as possible to the ORIGINAL IMAGE PROMPT (subject, setting, composition, style, characters) EXCEPT where the USER FEEDBACK calls for change. Preservation is the default; only change what the feedback asks to change.
2. Fully expresses the USER FEEDBACK in concrete visual terms. Translate vague language into specifics — e.g., "more realistic" → "photorealistic photography, real photo aesthetic, natural lighting"; "different palette" → name the new palette; "more energetic" → describe the visual cues (motion, contrast, bold color).
3. Stays on-brand and on-topic with the CAMPAIGN BRIEF.
4. Is suitable for the ${platSettings.label} platform.

The new prompt will be sent to a text-to-image model with NO input image, so it MUST contain every detail the model needs to reproduce what should be preserved. Be explicit and concrete; do not say "as before" or "same as the previous" — the model has no memory of the previous image.

ORIGINAL IMAGE PROMPT:
${args.currentImagePrompt || "(none recorded — infer a reasonable starting point from the campaign brief below)"}

CAMPAIGN BRIEF:
- Topic:    ${args.campaign.description}
- Tone:     ${args.campaign.tone}
- Brand:    ${args.brandProfile?.companyName || "(unspecified)"} — ${args.brandProfile?.industry || ""}
- Brand summary: ${args.brandProfile?.brandSummary || "(none)"}

USER FEEDBACK (what to change about the next image):
${args.feedback.trim()}

Output ONLY the new image prompt. No preamble, no labels, no quotes, no commentary. Just the prompt the image model will receive.`;

  if (process.env.NODE_ENV !== "production") {
    console.log("[buildRefinedImagePrompt] meta-prompt:\n", metaPrompt);
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
  });
  const result = await model.generateContent(metaPrompt);
  let out = (result.response.text() || "").trim();

  // Strip surrounding code fences and quotes if the model adds them anyway.
  if (out.startsWith("```")) {
    out = out.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/i, "").trim();
  }
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) {
    out = out.slice(1, -1).trim();
  }

  return out;
}

async function refinePostImageDataUrl(args: {
  currentImageUrl: string;   // unused for now — kept for call-site stability
  currentImagePrompt: string;
  feedback: string;
  platform: string;
  campaign: { description: string; tone: string };
  brandProfile: any | null;
}): Promise<{ dataUrl: string; refinedPrompt: string }> {
  // Step 1: build a fresh, complete image prompt from original + feedback.
  // A Gemini text call translates vague feedback ("more realistic",
  // "more attractive") into concrete visual language the image model
  // can render.
  const refinedPrompt = await buildRefinedImagePrompt({
    currentImagePrompt: args.currentImagePrompt,
    feedback: args.feedback,
    campaign: args.campaign,
    brandProfile: args.brandProfile,
    platform: args.platform,
  });

  if (process.env.NODE_ENV !== "production") {
    console.log("[refinePostImage] refined prompt:\n", refinedPrompt);
  }

  // Step 2: text-to-image. No input image → no style anchoring. This
  // fixes the v3 limitation where image-to-image edit (aiPromptEditImage)
  // kept the input image's rendering style even when the feedback asked
  // for a different style ("more realistic" applied to an illustrated
  // input still came back illustrated). Generating from scratch frees
  // the model to render in whatever style the feedback implies.
  const resultBuffer = await generateImageFromPrompt(refinedPrompt, args.platform as any);
  const dataUrl = `data:image/png;base64,${resultBuffer.toString("base64")}`;
  return { dataUrl, refinedPrompt };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const PgSession = ConnectPgSimple(session);
  // Avoid runtime filesystem dependency on connect-pg-simple table.sql in bundled deploys.
  const pgSessionStore = new PgSession({ pool, createTableIfMissing: false });
  const sessionSecret = process.env.SESSION_SECRET || "campaign-ai-secret-key";
  const isProduction = process.env.NODE_ENV === "production" ||
    (!!process.env.APP_BASE_URL && process.env.APP_BASE_URL.startsWith("https://"));
  const sessionCookie = {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
  };

  console.log(`[companion] isProduction=${isProduction} (NODE_ENV=${process.env.NODE_ENV || "(unset)"}, APP_BASE_URL=${process.env.APP_BASE_URL || "(unset)"})`);

  app.use(
    session({
      store: pgSessionStore,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: sessionCookie,
    })
  );

  app.use(requireNotBlocked());

  async function getCurrentBrandProfile(userId: number) {
    const ctx = await getUserOrgContext(userId);
    if (ctx?.organization) {
      const orgProfile = await storage.getBrandProfileByOrganizationId(ctx.organization.id);
      if (orgProfile) return { profile: orgProfile, ctx };
    }
    const profile = await storage.getBrandProfileByUserId(userId);
    return { profile, ctx };
  }

  async function loadCampaignForUser(userId: number, campaignId: number) {
    const campaign = await storage.getCampaignById(campaignId);
    if (!campaign) return null;

    const ctx = await getUserOrgContext(userId);
    if (campaign.organizationId) {
      if (!ctx?.organization || ctx.organization.id !== campaign.organizationId) return null;
      return { campaign, ctx };
    }

    if (campaign.userId === userId) return { campaign, ctx };
    if (ctx?.organization) {
      const ownerMembership = await storage.getOrganizationMember(campaign.userId, ctx.organization.id);
      if (ownerMembership) return { campaign, ctx };
    }
    return null;
  }

  // ── Super admin setup endpoints ───────────────────────────────────────────
  // POST /api/setup/super-admin — create a super admin account (token-gated, no limit)
  app.post("/api/setup/super-admin", async (req, res) => {
    try {
      const setupToken = process.env.SUPER_ADMIN_SETUP_TOKEN;
      if (!setupToken) {
        return res.status(503).json({ message: "Setup is not configured. Set the SUPER_ADMIN_SETUP_TOKEN environment variable to enable this endpoint." });
      }

      const { token, fullName, email, password } = req.body as { token?: string; fullName?: string; email?: string; password?: string };

      if (!token || !fullName?.trim() || !email || !password?.trim()) {
        return res.status(400).json({ message: "All fields are required: token, fullName, email, password." });
      }

      if (token !== setupToken) {
        return res.status(403).json({ message: "Invalid setup token." });
      }

      const emailSchema = z.string().email();
      if (!emailSchema.safeParse(email).success) {
        return res.status(400).json({ message: "Invalid email address." });
      }

      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters." });
      }

      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists." });
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      await storage.createUser({
        fullName,
        email,
        password: hashedPassword,
        systemRole: "super_admin",
        onboardingCompleted: true,
        onboardingStep: 0,
        blocked: false,
      });

      return res.json({ message: "Super admin account created successfully." });
    } catch (err: any) {
      console.error("Setup error:", err);
      return res.status(500).json({ message: "Internal server error." });
    }
  });

  const companionFilePath = "/tmp/companion";
  if (!fs.existsSync(companionFilePath)) {
    fs.mkdirSync(companionFilePath, { recursive: true });
  }

  function resolveCompanionHost(req?: any): string {
    if (process.env.APP_BASE_URL) {
      try {
        return new URL(process.env.APP_BASE_URL).host;
      } catch {
        console.warn("[companion] APP_BASE_URL is set but could not be parsed:", process.env.APP_BASE_URL);
      }
    }
    if (process.env.COMPANION_HOST) {
      return process.env.COMPANION_HOST;
    }
    if (req) {
      // req.hostname reads X-Forwarded-Host when trust proxy is enabled (set in index.ts).
      // This gives the correct external hostname on Azure, where req.get("host") would return
      // the raw Host header which can be an internal Azure hostname from health-check probes.
      return req.hostname || req.get("host") || "localhost";
    }
    return "localhost";
  }

  // ── Companion startup diagnostics ────────────────────────────────────────
  console.log("[companion] ══ BUILD: cookie=companion_sid (underscore fix active) ══");
  console.log("[companion] ── startup config ──────────────────────────────");
  console.log(`[companion] NODE_ENV        : ${process.env.NODE_ENV || "(not set)"}`);
  console.log(`[companion] APP_BASE_URL    : ${process.env.APP_BASE_URL || "(not set)"}`);
  console.log(`[companion] isProduction    : ${isProduction}`);
  console.log(`[companion] COMPANION_SECRET: ${process.env.COMPANION_SECRET ? `SET (length=${process.env.COMPANION_SECRET.length})` : "NOT SET — using hardcoded fallback (token verification will fail if secret changes between restarts)"}`);
  console.log(`[companion] ONEDRIVE key    : ${process.env.COMPANION_ONEDRIVE_KEY ? "SET" : "(not set)"}`);
  console.log(`[companion] GOOGLE key      : ${process.env.COMPANION_GOOGLE_KEY ? "SET" : "(not set)"}`);
  if (!process.env.COMPANION_SECRET) {
    console.warn("[companion] WARNING: COMPANION_SECRET is not set. All OAuth tokens are signed with a hardcoded fallback. Set this env var in production (Azure) to ensure token consistency.");
  }
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[companion] WARNING: NODE_ENV is "${process.env.NODE_ENV || "(unset)"}" — not "production". Session cookie will use sameSite=lax unless APP_BASE_URL overrides it. Set NODE_ENV=production on Azure.`);
  }
  if (!process.env.APP_BASE_URL) {
    console.warn("[companion] WARNING: APP_BASE_URL is not set. Companion hostname will be derived from each incoming request. Set APP_BASE_URL=https://springpost.buildingagents.ai on Azure to guarantee correct OAuth redirect URLs.");
  }

  if (process.env.APP_BASE_URL || process.env.COMPANION_HOST) {
    const staticHost = resolveCompanionHost();
    console.log(`[companion] Host resolved from env: ${staticHost}`);
    console.log(`[companion] Google Drive redirect URI: https://${staticHost}/companion/googledrive/redirect`);
    console.log(`[companion] OneDrive redirect URI: https://${staticHost}/companion/onedrive/redirect`);
  } else {
    console.log("[companion] No APP_BASE_URL or COMPANION_HOST set — host will be derived per-request (one companion instance cached per hostname).");
    console.log("[companion] For production deployments (e.g. Azure at https://springpost.buildingagents.ai), set APP_BASE_URL=https://springpost.buildingagents.ai and NODE_ENV=production in your environment variables.");
  }
  console.log("[companion] ────────────────────────────────────────────────");

  const companionCookie = {
    ...sessionCookie,
    sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
    // Do NOT set path: "/companion" — that restricts the cookie to /companion/*
    // paths only, which can cause the browser to omit it on the OAuth redirect
    // chain (e.g. when the popup navigates back from Microsoft/Google). Default
    // path "/" ensures the companion_sid cookie travels with every request.
  };
  console.log(`[companion] session cookie  : sameSite=${companionCookie.sameSite}, secure=${companionCookie.secure}, httpOnly=${companionCookie.httpOnly}`);

  console.log(`[companion] Cookie config: sameSite=${companionCookie.sameSite}, secure=${companionCookie.secure}, path=(default "/")`);

  if (isProduction && !process.env.APP_BASE_URL && !process.env.COMPANION_HOST) {
    console.warn("[companion] WARNING: Running in production mode but neither APP_BASE_URL nor COMPANION_HOST is set. The companion host will be derived per-request, which can cause OAuth session mismatches between the /connect and /callback steps. Set APP_BASE_URL=https://<your-domain> in your environment variables.");
  }

  // ── OAuth token polling endpoint ────────────────────────────────────────────
  // After send-token fires, the token is stored in the main session.  The main
  // browser window polls this endpoint every ~800ms until it receives the token
  // (or times out after 30s).  This is a belt-and-suspenders fallback for when
  // BroadcastChannel doesn't deliver the token (stale client bundle, timing race,
  // Azure multi-replica where client JS is old, etc).
  app.get("/api/companion/auth-token", requireAuth, (req: Request, res: Response) => {
    // Provider is required and must match what was stored at send-token time.
    // This prevents token cross-routing if two provider OAuth flows overlap.
    const providerParam = (req.query.provider as string || "").toLowerCase().trim();
    if (!providerParam) {
      return res.status(400).json({ token: null, error: "provider query param required" });
    }
    // Accept both the URL segment form ("onedrive") and pluginId form ("OneDrive")
    const pluginIdMap: Record<string, string> = {
      onedrive: "OneDrive",
      googledrive: "GoogleDrive",
      drive: "GoogleDrive",
      dropbox: "Dropbox",
      box: "Box",
      unsplash: "Unsplash",
    };
    const expectedPluginId = pluginIdMap[providerParam] || providerParam;

    const pending = req.session.pendingOAuthToken;
    if (!pending || Date.now() > pending.expiresAt) {
      if (pending) {
        delete req.session.pendingOAuthToken;
        req.session.save(() => {});
      }
      return res.json({ token: null });
    }
    // Enforce provider match — don't hand out a OneDrive token to a GoogleDrive poller
    if (pending.pluginId !== expectedPluginId && pending.urlProvider !== providerParam) {
      return res.json({ token: null });
    }
    // Consume the token (delete so it can't be replayed)
    const { token, pluginId } = pending;
    delete req.session.pendingOAuthToken;
    req.session.save((err) => {
      if (err) console.error("[companion] ✗ failed to delete pendingOAuthToken after delivery:", err);
      else console.log(`[companion] ✓ pendingOAuthToken delivered via polling (pluginId=${pluginId})`);
    });
    return res.json({ token, pluginId });
  });

  // Save a reference to the main Express session BEFORE the companion session
  // middleware replaces req.session with a new companion session.  This lets the
  // companion request handler fall back to the main session's grant data if the
  // companion_sid cookie is absent (e.g. while the cookie-fix is rolling out).
  app.use("/companion", (req: any, _res: any, next: any) => {
    (req as any).mainSession = req.session;
    next();
  });

  app.use(
    "/companion",
    session({
      // Use underscore instead of dot to avoid Azure reverse-proxy URL-encoding
      // "companion.sid" → "companion%2Esid", which makes cookie.parse() return
      // a key that doesn't match "companion.sid" and silently loses the session.
      name: "companion_sid",
      store: pgSessionStore,
      secret: sessionSecret,
      resave: true,
      saveUninitialized: true,
      // proxy: true tells express-session to read X-Forwarded-Proto directly
      // when deciding whether to set the Secure flag on the cookie — independent
      // of whether req.secure is already true.  Without this, if Azure Container
      // Apps doesn't surface X-Forwarded-Proto to req.secure (trustProxy mismatch),
      // issecure() returns false and Set-Cookie is silently suppressed even though
      // saveUninitialized: true is set.
      proxy: true,
      cookie: companionCookie,
    })
  );

  // Cache one companion app instance per resolved hostname.
  // A Map prevents a single bad initialization from poisoning future requests —
  // e.g. Azure health-check probes can arrive first carrying an internal hostname;
  // the next real request (with the external hostname) gets its own correct instance.
  const companionApps = new Map<string, any>();

  const MAX_COMPANION_HOSTS = 10;

  function getOrCreateCompanionApp(host: string): any {
    if (!companionApps.has(host)) {
      if (companionApps.size >= MAX_COMPANION_HOSTS) {
        // Safety cap: if we're accumulating too many hosts, something is wrong.
        // Return the first cached instance as a best-effort fallback and log a warning.
        console.warn(`[companion] WARNING: reached limit of ${MAX_COMPANION_HOSTS} cached companion instances. Refusing to create another for host "${host}". Set APP_BASE_URL to avoid per-request host derivation.`);
        return companionApps.values().next().value;
      }
      console.log(`[companion] Initializing new instance for host: ${host}`);
      console.log(`[companion] OneDrive send-token URL: https://${host}/companion/onedrive/send-token`);
      console.log(`[companion] OneDrive redirect URI:   https://${host}/companion/onedrive/redirect`);
      console.log(`[companion] Google Drive redirect URI: https://${host}/companion/googledrive/redirect`);
      if (!process.env.APP_BASE_URL && !process.env.COMPANION_HOST) {
        console.warn(`[companion] WARNING: host "${host}" was derived from the request. If this is an internal hostname, set APP_BASE_URL=https://springpost.buildingagents.ai in your Azure environment variables.`);
      }
      const { app: companionApp } = companion.app({
        providerOptions: {
          drive: {
            key: process.env.COMPANION_GOOGLE_KEY || "",
            secret: process.env.COMPANION_GOOGLE_SECRET || "",
          },
          onedrive: {
            key: process.env.COMPANION_ONEDRIVE_KEY || "",
            secret: process.env.COMPANION_ONEDRIVE_SECRET || "",
          },
          unsplash: {
            key: process.env.COMPANION_UNSPLASH_KEY || "",
          },
        },
        server: {
          host,
          protocol: "https",
          path: "/companion",
        },
        filePath: companionFilePath,
        secret: process.env.COMPANION_SECRET || "companion-fallback-secret-change-me",
        uploadUrls: [/./],
        corsOrigins: true,
      });
      companionApps.set(host, companionApp);
    }
    return companionApps.get(host)!;
  }

  app.use("/companion", async (req: any, res: any, next: any) => {
    const host = resolveCompanionHost(req);
    const url = req.url || "";
    const isSendToken = url.includes("/send-token");
    const isCallback = url.includes("/callback");
    // Parse cookie names only (never values) — used by send-token warn conditions.
    const rawCookie = req.headers?.cookie || "";
    const cookieNames: string[] = rawCookie
      ? rawCookie.split(";").map((c: string) => c.trim().split("=")[0].trim()).filter(Boolean)
      : [];
    const hasSidCookie = cookieNames.includes("companion_sid");

    if (isSendToken) {
      const grant        = req.session?.grant;
      if (!hasSidCookie) {
        console.warn(`[companion] ⚠ companion_sid cookie MISSING on send-token — cookie names present: [${cookieNames.join(",")}]. Session cannot be loaded; grant state will be null.`);
      }
      if (!hasSidCookie && !!(req.session?.grant)) {
        console.warn(`[companion] ⚠ session has grant data but companion_sid cookie is absent — possible session-store cross-contamination or middleware ordering issue.`);
      }
      if (!grant?.dynamic?.state) {
        console.warn(`[companion] ⚠ grant.dynamic.state is null — sendToken will call next() → 404. Session may not have been saved during the /connect step.`);
      }
    }

    const companionApp = getOrCreateCompanionApp(host);

    // ── Main-session grant fallback ────────────────────────────────────────
    // If the companion_sid cookie was absent (so req.session is a brand-new
    // empty companion session) but the main connect.sid session already contains
    // grant data from the /connect step, copy that grant object into the
    // companion session.  This lets send-token and the OAuth callback work even
    // when the companion_sid Set-Cookie was suppressed (e.g. proxy: true fix
    // not yet effective, or first request before the cookie round-trip).
    const mainSession = (req as any).mainSession;
    if (mainSession?.grant && !req.session?.grant) {
      (req.session as any).grant = mainSession.grant;
      console.log(`[companion] ✓ Copied grant state from main session → companion session (companion_sid was missing, using main-session fallback)`);
    }

    // ── req.query fix ─────────────────────────────────────────────────────
    // Parse the query string directly from req.url using URLSearchParams so we
    // never rely on Express's lazy prototype-getter, which can return an empty
    // object after setPrototypeOf(req, companionExpressApp.request) runs inside
    // companion's expressInit — the exact root cause of the 401 "token.verify.unset"
    // error seen on Azure: uppyAuthToken was in the URL but req.query was {}.
    const rawQueryStr = (() => {
      const qi = url.indexOf("?");
      return qi >= 0 ? url.slice(qi + 1) : "";
    })();
    const parsedQuery: Record<string, string> = {};
    if (rawQueryStr) {
      try {
        for (const [k, v] of new URLSearchParams(rawQueryStr).entries()) {
          parsedQuery[k] = v;
        }
      } catch {
        // Malformed query string — ignore, parsedQuery stays {}
      }
    }
    // Always overwrite req.query with the own data property to prevent the
    // prototype-getter from re-evaluating after expressInit.
    Object.defineProperty(req, 'query', {
      value: parsedQuery,
      writable: true,
      enumerable: true,
      configurable: true,
    });

    // Belt-and-suspenders: mirror uppyAuthToken into the uppy-auth-token header.
    // companion's getCompanionMiddleware reads EITHER the header OR req.query —
    // whichever is non-null. By setting the header here (before companionApp runs)
    // the token survives even if something inside companion re-evaluates req.query.
    if (parsedQuery.uppyAuthToken && !req.headers["uppy-auth-token"]) {
      req.headers = { ...req.headers, "uppy-auth-token": parsedQuery.uppyAuthToken };
    }

    // ── Session-null guard for send-token ─────────────────────────────────
    // Without this guard, if grant.dynamic.state is absent, companion's
    // sendToken controller calls next() and Express falls through to a 404.
    // The guard returns a 400 with a diagnostic body so the failure is
    // immediately visible in logs instead of being a silent blank popup.
    // Check BOTH the companion session and the main session (fallback) so the
    // guard doesn't block when grant state was copied from the main session above.
    const effectiveGrantState =
      req.session?.grant?.dynamic?.state ||
      mainSession?.grant?.dynamic?.state;
    if (isSendToken && !effectiveGrantState) {
      const reason = !req.session
        ? "no session (companion_sid cookie missing or session expired)"
        : !req.session.grant
        ? "req.session.grant is null (OAuth connect step never completed or session was not saved)"
        : "req.session.grant.dynamic.state is null (session present but grant state missing)";
      console.error(`[companion] ✗ send-token blocked — ${reason}`);
      res.status(400).send(
        `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>` +
        `<p>OAuth session state missing: ${reason}. ` +
        `Please close this window and try connecting again.</p>` +
        `<script>window.close();</script>` +
        `</body></html>`
      );
      return;
    }

    // ── BroadcastChannel send-token override ──────────────────────────────
    // companionApp's default send-token HTML uses window.opener.postMessage,
    // which breaks when Microsoft/Google OAuth pages sever window.opener via
    // their own COOP headers.  We return our own HTML that ALSO broadcasts
    // the token via BroadcastChannel (same-origin, COOP-immune) so the main
    // window can receive it regardless of opener state.
    if (isSendToken && parsedQuery.uppyAuthToken) {
      const tokenVal = parsedQuery.uppyAuthToken;
      // Map URL provider path segment → Uppy plugin ID used by the client.
      const providerMatch = url.match(/^\/([^/?]+)\/send-token/);
      const urlProvider = (providerMatch?.[1] || "").toLowerCase();
      const pluginIdMap: Record<string, string> = {
        onedrive: "OneDrive",
        googledrive: "GoogleDrive",
        drive: "GoogleDrive",
        dropbox: "Dropbox",
        box: "Box",
        unsplash: "Unsplash",
      };
      const pluginId = pluginIdMap[urlProvider] || urlProvider;
      console.log(`[companion] ✓ send-token BroadcastChannel override: provider=${urlProvider} pluginId=${pluginId} tokenLen=${tokenVal.length}`);

      // ── Server-side token store (belt-and-suspenders fallback) ────────────
      // Store the token in BOTH req.session (companion session in scope here)
      // AND mainSession (main connect.sid session, shared across all Azure replicas
      // via PostgreSQL) so the main window can poll /api/companion/auth-token even
      // if BroadcastChannel doesn't fire (stale client bundle, timing race, etc).
      const pendingToken = { token: tokenVal, pluginId, urlProvider, expiresAt: Date.now() + 120_000 };
      try {
        // Write to companion req.session (belt)
        (req.session as any).pendingOAuthToken = pendingToken;
        await new Promise<void>((resolve) => req.session.save((err: any) => {
          if (err) console.error(`[companion] ✗ failed to save pendingOAuthToken to companion session:`, err);
          resolve();
        }));
        // Write to main session (suspenders) — visible to /api/companion/auth-token
        if (mainSession) {
          (mainSession as any).pendingOAuthToken = pendingToken;
          await new Promise<void>((resolve) => mainSession.save((err: any) => {
            if (err) console.error(`[companion] ✗ failed to save pendingOAuthToken to main session:`, err);
            else console.log(`[companion] ✓ pendingOAuthToken stored in main session (provider=${urlProvider})`);
            resolve();
          }));
        }
      } catch (e) {
        console.error(`[companion] ✗ exception saving pendingOAuthToken:`, e);
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Connecting...</title></head><body>` +
        `<script>(function(){` +
        `var token=${JSON.stringify(tokenVal)};` +
        `var pluginId=${JSON.stringify(pluginId)};` +
        `var origin=window.location.origin;` +
        `var data=JSON.stringify({token:token});` +
        // Primary: postMessage via opener (works when COOP not severed)
        `try{if(window.opener&&!window.opener.closed){window.opener.postMessage(data,origin);}}catch(e){}` +
        // Fallback: BroadcastChannel (same-origin, not affected by COOP)
        `try{var ch=new BroadcastChannel('uppy-auth-token');ch.postMessage({token:token,pluginId:pluginId});ch.close();}catch(e){}` +
        // Always close — never show "Something went wrong"
        `window.close();` +
        `})();</script></body></html>`
      );
      return;
    }

    // Intercept the response to log status codes for debugging and to capture
    // the OAuth token at callback time (Task #69).
    const origWriteHead = res.writeHead.bind(res);
    res.writeHead = function (statusCode: number, ...args: any[]) {
      if (statusCode >= 400) {
        console.warn(`[companion] ✗ ${req.method} ${url} → HTTP ${statusCode}`);
      }
      // ── Capture OAuth token at callback time ───────────────────────────────
      // The /onedrive/callback and /googledrive/callback requests ALWAYS land
      // on the same Azure replica as the polling endpoint (confirmed by logs:
      // same sessionID in same log stream). Companion puts uppyAuthToken in the
      // 302 Location header here.  We extract it and write it into mainSession
      // (the connect.sid PostgreSQL session) so any replica serving the poll
      // can return it — completely bypassing the send-token replica problem.
      // Fire-and-forget: writeHead is sync so we use a callback, not await.
      // The client polls every 800 ms so a brief DB write delay is fine.
      if (isCallback && statusCode === 302 && mainSession) {
        const rawLoc = res.getHeader("location");
        const location: string = Array.isArray(rawLoc) ? rawLoc[0] : (rawLoc as string) || "";
        const tokenMatch = location.match(/uppyAuthToken=([^&\s]+)/);
        if (tokenMatch) {
          const tokenVal = decodeURIComponent(tokenMatch[1]);
          const providerMatch = url.match(/^\/([^/?]+)\/callback/);
          const urlProvider = (providerMatch?.[1] || "").toLowerCase();
          const cbPluginIdMap: Record<string, string> = {
            onedrive: "OneDrive",
            googledrive: "GoogleDrive",
            drive: "GoogleDrive",
            dropbox: "Dropbox",
            box: "Box",
            unsplash: "Unsplash",
          };
          const cbPluginId = cbPluginIdMap[urlProvider] || urlProvider;
          const pendingToken = { token: tokenVal, pluginId: cbPluginId, urlProvider, expiresAt: Date.now() + 120_000 };
          (mainSession as any).pendingOAuthToken = pendingToken;
          mainSession.save((err: any) => {
            if (err) {
              console.error(`[companion] ✗ failed to save pendingOAuthToken at callback (provider=${urlProvider}):`, err);
            } else {
              console.log(`[companion] ✓ pendingOAuthToken stored at callback (provider=${urlProvider} pluginId=${cbPluginId})`);
            }
          });
        }
      }
      return origWriteHead(statusCode, ...args);
    };

    // Wrap in try/catch so synchronous throws from companion surface in logs.
    try {
      return companionApp(req, res, (err?: any) => {
        if (err) {
          console.error(`[companion] ✗ error from companionApp on ${url}:`, err);
        }
        return next(err);
      });
    } catch (err) {
      console.error(`[companion] ✗ synchronous throw from companionApp on ${url}:`, err);
      next(err);
    }
  });

  // Dedicated async error-handler middleware for /companion.
  app.use("/companion", (err: any, req: any, res: any, next: any) => {
    console.error(`[companion] ✗ async error on ${req.method} ${req.path}:`, err?.message || err);
    if (res.headersSent) {
      return next(err);
    }
    res.status(500).json({ error: "Companion middleware error", message: err.message });
  });

  const companionWss = new WebSocketServer({ noServer: true });
  let companionEmitter: any = null;
  try {
    const { pathToFileURL } = await import("node:url");
    const { join } = await import("node:path");
    const emitterAbsPath = join(process.cwd(), "node_modules", "@uppy", "companion", "lib", "server", "emitter", "index.js");
    const emitterModule = await import(
      /* @vite-ignore */
      pathToFileURL(emitterAbsPath).href
    );
    companionEmitter = (emitterModule.default || emitterModule)();
  } catch (err) {
    console.error("[companion] Failed to load emitter, WebSocket progress will not work:", err);
  }

  companionWss.on("connection", (ws: any, req: any) => {
    const fullPath = req.url || "";
    const token = fullPath.replace(/^.*\/api\//, "");
    console.log(`[companion] WebSocket connection received from ${token}`);

    const send = (data: any) => {
      ws.send(JSON.stringify(data), (err: any) => {
        if (err) console.error("[companion] WebSocket send error:", err);
      });
    };

    if (companionEmitter) {
      companionEmitter.emit(`connection:${token}`);
      companionEmitter.on(token, send);

      ws.on("message", (jsonData: any) => {
        try {
          const data = JSON.parse(jsonData.toString());
          if (["pause", "resume", "cancel"].includes(data.action)) {
            companionEmitter.emit(`${data.action}:${token}`);
          }
        } catch (err) {
          console.error("[companion] WebSocket message error:", err);
        }
      });

      ws.on("close", () => {
        companionEmitter.removeListener(token, send);
      });
    }
  });

  httpServer.on("upgrade", (request: any, socket: any, head: any) => {
    const pathname = request.url || "";
    if (pathname.startsWith("/companion")) {
      companionWss.handleUpgrade(request, socket, head, (ws: any) => {
        companionWss.emit("connection", ws, request);
      });
    }
  });

  // Get current user
  app.get("/api/user", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    if (user.blocked) {
      req.session.destroy(() => {});
      return res.status(403).json({ message: "Your account has been blocked. Please contact support." });
    }
    const { password, ...safeUser } = user;
    console.log(`[/api/user] userId=${user.id} mustChangePassword=${user.mustChangePassword} onboardingCompleted=${user.onboardingCompleted}`);
    res.json(safeUser);
  });

  app.get("/api/media/upload-token", requireAuth, (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const token = generateUploadToken(userId);
    res.json({ token, userId });
  });

  const companionUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  app.post("/api/media/files/companion-upload", companionUpload.any(), async (req: Request, res: Response) => {
    try {
      const uploadToken = req.headers["x-upload-token"] as string;
      const userId = parseInt(req.body.userId);
      if (!uploadToken || !userId || isNaN(userId) || !verifyUploadToken(uploadToken, userId)) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const files = req.files as Express.Multer.File[] | undefined;
      const uploadedFile = files?.[0] || req.file;
      if (!uploadedFile) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "tiff", "ico", "heic", "heif", "avif"];
      const ext = (uploadedFile.originalname.split(".").pop() || "").toLowerCase();
      const isImage = uploadedFile.mimetype.startsWith("image/") || imageExtensions.includes(ext);
      if (!isImage) {
        return res.status(400).json({ message: "Only image files are allowed" });
      }
      const folderId = req.body.folderId ? parseInt(req.body.folderId) : null;
      if (folderId) {
        const folder = await storage.getMediaFolderById(folderId);
        if (!folder || folder.userId !== userId) {
          return res.status(404).json({ message: "Folder not found" });
        }
      }
      const publicId = `media_${userId}_${Date.now()}`;
      const { url, size } = await uploadStreamToCloudinary(
        uploadedFile.buffer,
        `campaignai/media/${userId}`,
        publicId,
        ext || "png",
      );
      const mimeType = uploadedFile.mimetype.startsWith("image/") ? uploadedFile.mimetype : `image/${ext || "png"}`;
      const mediaFile = await storage.createMediaFile({
        userId,
        folderId,
        name: uploadedFile.originalname,
        url,
        size: size || uploadedFile.size,
        mimeType,
      });
      res.json(mediaFile);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Register with email/password
  app.post("/api/register", async (req: Request, res: Response) => {
    try {
      const data = registerSchema.parse(req.body);
      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }
      const hashedPassword = await bcrypt.hash(data.password, 12);
      const user = await storage.createUser({
        fullName: data.fullName,
        email: data.email,
        password: hashedPassword,
        onboardingCompleted: false,
        onboardingStep: 0,
      });
      req.session.userId = user.id;
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0]?.message || "Invalid input" });
      }
      console.error("Register error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Login with email/password
  app.post("/api/login", async (req: Request, res: Response) => {
    try {
      const data = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(data.email);
      if (!user || !user.password) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      const valid = await bcrypt.compare(data.password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      if (user.blocked) {
        return res.status(403).json({ message: "Your account has been blocked. Please contact support." });
      }
      req.session.userId = user.id;
      await new Promise<void>((resolve, reject) => req.session.save((err) => err ? reject(err) : resolve()));
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0]?.message || "Invalid input" });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/request-reset-otp", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email is required" });
      }
      const user = await storage.getUserByEmail(email.trim());
      if (!user) {
        return res.json({ success: true });
      }
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await storage.createOtp({ email: user.email, code, expiresAt });
      const { sendPasswordResetOtpEmail } = await import("./email");
      await sendPasswordResetOtpEmail({ toEmail: user.email, fullName: user.fullName, otp: code });
      res.json({ success: true });
    } catch (error: any) {
      console.error("request-reset-otp error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/auth/verify-reset-otp", async (req: Request, res: Response) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ message: "Email and code are required" });
      }
      const otp = await storage.getOtpByEmailAndCode(email.trim(), String(code).trim());
      if (!otp) {
        return res.status(400).json({ message: "Invalid or expired code. Please check and try again." });
      }
      await storage.markOtpUsed(otp.id);
      const resetToken = `reset_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const resetExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await storage.createOtp({ email: otp.email, code: resetToken, expiresAt: resetExpiresAt });
      res.json({ success: true, resetToken });
    } catch (error: any) {
      console.error("verify-reset-otp error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword || typeof newPassword !== "string" || newPassword.trim().length === 0 || newPassword.length < 6 || newPassword.length > 72) {
        return res.status(400).json({ message: "Token and a valid new password (6–72 characters) are required" });
      }
      if (!token.startsWith("reset_")) return res.status(400).json({ message: "Invalid or expired reset token" });
      const otp = await storage.getOtpByCode(token);
      if (!otp) return res.status(400).json({ message: "Invalid or expired reset token" });
      const user = await storage.getUserByEmail(otp.email);
      if (!user) return res.status(404).json({ message: "User not found" });
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await storage.updateUser(user.id, { password: hashedPassword });
      await storage.markOtpUsed(otp.id);
      res.json({ success: true, message: "Password updated successfully. You can now log in." });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/user/change-password", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { newPassword, currentPassword } = req.body as { newPassword?: string; currentPassword?: string };
      if (!newPassword || typeof newPassword !== "string" || newPassword.trim().length === 0 || newPassword.length < 6) {
        return res.status(400).json({ message: "A new password of at least 6 characters is required." });
      }
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      if (!user.mustChangePassword) {
        if (!currentPassword || !user.password) {
          return res.status(400).json({ message: "Current password is required." });
        }
        const ok = await bcrypt.compare(currentPassword, user.password);
        if (!ok) return res.status(400).json({ message: "Current password is incorrect." });
      }

      const hashed = await bcrypt.hash(newPassword, 12);
      const updated = await storage.updateUser(userId, { password: hashed, mustChangePassword: false });
      const reRead = await storage.getUser(userId);
      console.log(`[change-password] userId=${userId} updated.mustChangePassword=${updated.mustChangePassword} reRead.mustChangePassword=${reRead?.mustChangePassword}`);
      const { password: _pw, ...safeUser } = updated;
      res.json({ success: true, user: { ...safeUser, mustChangePassword: false } });
    } catch (error: any) {
      console.error("[change-password] error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/auth/verify-email-token", async (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ message: "Token is required" });
      if (!token.startsWith("verify_")) return res.status(400).json({ message: "Invalid or expired verification token" });
      const otp = await storage.getOtpByCode(token);
      if (!otp) return res.status(400).json({ message: "Invalid or expired verification token" });
      const user = await storage.getUserByEmail(otp.email);
      if (!user) return res.status(404).json({ message: "User not found" });
      await storage.updateUser(user.id, { emailVerifiedAt: new Date() });
      await storage.markOtpUsed(otp.id);
      res.json({ success: true, message: "Email verified successfully. You can now log in." });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Google OAuth - redirect to Google
  app.get("/api/auth/google", (_req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ message: "Google OAuth not configured" });
    }
    const redirectUri = `${getBaseUrl(_req)}/api/auth/google/callback`;
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&access_type=offline`;
    res.redirect(url);
  });

  // Google OAuth callback
  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    try {
      const { code } = req.query;
      if (!code) return res.redirect("/auth?error=no_code");

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) return res.redirect("/auth?error=not_configured");

      const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;
      const client = new OAuth2Client(clientId, clientSecret, redirectUri);
      const { tokens } = await client.getToken(code as string);
      client.setCredentials(tokens);

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token!,
        audience: clientId,
      });
      const payload = ticket.getPayload()!;
      const googleId = payload.sub;
      const email = payload.email!;
      const fullName = payload.name || email.split("@")[0];
      const profileImage = payload.picture;

      let user = await storage.getUserByGoogleId(googleId);
      if (!user) {
        const existingByEmail = await storage.getUserByEmail(email);
        if (existingByEmail) {
          user = await storage.updateUser(existingByEmail.id, {
            googleId,
            profileImage,
          });
        } else {
          user = await storage.createUser({
            fullName,
            email,
            googleId,
            profileImage,
            onboardingCompleted: false,
            onboardingStep: 0,
          });
        }
      }

      req.session.userId = user.id;
      if (!user.onboardingCompleted) {
        res.redirect("/onboarding");
      } else {
        res.redirect("/dashboard");
      }
    } catch (error: any) {
      console.error("Google auth error:", error);
      res.redirect("/auth?error=google_failed");
    }
  });

  // Logout
  app.post("/api/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  // Extract content from uploaded files and URL
  app.post(
    "/api/onboarding/extract-content",
    requireAuth,
    (req: Request, res: Response, next) => {
      upload.array("files", 3)(req, res, (err: any) => {
        // fileFilter rejections and size-limit errors surface here as a clean 400
        // instead of falling through to the generic 500 handler.
        if (err) return res.status(400).json({ message: err.message || "File upload failed. Please check your files and try again." });
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const { url } = req.body;
        const files = (req.files as Express.Multer.File[]) || [];

        if (url && !isValidWebsiteUrl(url)) {
          return res.status(400).json({ message: "Please enter a valid website URL (e.g. https://yourcompany.com)." });
        }
        if (files.length === 0 && !url?.trim()) {
          return res.status(400).json({ message: "Upload at least one document or provide a website URL to continue." });
        }

        const extractions: Array<{ source: string; text: string }> = [];

        for (const file of files) {
          const text = await extractTextFromFile(file);
          if (text) {
            extractions.push({ source: file.originalname, text });
          } else {
            extractions.push({ source: file.originalname, text: "[Could not extract content from this file]" });
          }
        }

        if (url) {
          const text = await extractTextFromUrl(url);
          if (text) {
            if (text.includes("[WEBSITE_UNREACHABLE]")) {
              extractions.push({ source: url, text, unreachable: true } as any);
            } else {
              extractions.push({ source: url, text });
            }
          } else {
            extractions.push({ source: url, text: "[Could not fetch content from this URL]" });
          }
        }

        res.json({ extractions });
      } catch (error: any) {
        console.error("Extract content error:", error);
        res.status(500).json({ message: "Failed to extract content. Please try again." });
      }
    }
  );

  // Analyze brand voice from pre-extracted text
  app.post(
    "/api/onboarding/analyze-brand",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const { companyName, industry, extractedText, url } = req.body;
        if (!companyName?.trim() || !industry?.trim()) {
          return res.status(400).json({ message: "Company name and industry are required" });
        }

        let allText = extractedText || "";
        if (!allText.trim()) {
          allText = `Company: ${companyName}, Industry: ${industry}. Generate a brand profile based on typical companies in this industry.`;
        }

        const brandData = await analyzeBrandVoiceWithAI(companyName, industry, allText, url);
        res.json(brandData);
      } catch (error: any) {
        console.error("Brand analysis error:", error);
        res.status(500).json({ message: "Failed to analyze brand voice. Please try again." });
      }
    }
  );

  app.patch("/api/onboarding/step", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { step } = req.body;
      if (typeof step !== "number" || step < 0 || step > 4) {
        return res.status(400).json({ message: "Invalid step" });
      }
      const updated = await storage.updateUser(userId, { onboardingStep: step });
      res.json({ step: updated.onboardingStep });
    } catch (error: any) {
      console.error("Update onboarding step error:", error);
      res.status(500).json({ message: "Failed to update step" });
    }
  });

  // Save brand profile and generate sample posts
  app.post("/api/onboarding/save-brand-profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const data = req.body;

      const profileData = {
        companyName: data.companyName,
        industry: data.industry,
        websiteUrl: data.websiteUrl || data.url || null,
        brandSummary: data.brandSummary,
        targetAudience: data.targetAudience,
        messagingPillars: data.messagingPillars,
        toneStyle: data.toneStyle,
        doLanguageRules: data.doLanguageRules,
        dontLanguageRules: data.dontLanguageRules,
        ctaPreferences: data.ctaPreferences,
        customCtas: data.customCtas,
        hashtagThemes: data.hashtagThemes,
        rawBrandVoiceJson: data,
      };

      await storage.updateUser(userId, { onboardingCompleted: true });

      const existingCtx = await getUserOrgContext(userId);
      let profileOrganizationId = existingCtx?.organization?.id ?? null;
      if (!existingCtx || !existingCtx.organization) {
        const orgName = data.companyName?.trim() || "My Organization";
        const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        let finalSlug = slug;
        let counter = 1;
        while (await storage.getOrganizationBySlug(finalSlug)) {
          finalSlug = `${slug}-${counter}`;
          counter++;
        }
        const org = await storage.createOrganization({ name: orgName, slug: finalSlug });
        profileOrganizationId = org.id;
        await storage.addOrganizationMember({
          userId,
          organizationId: org.id,
          systemRole: "admin",
          roleId: null,
        });
        await storage.updateUser(userId, { systemRole: "admin" } as any);
        const defaultRole = await storage.createRole({
          organizationId: org.id,
          name: "Standard Creator",
          description: "Default role with standard content creation permissions",
          isDefault: true,
          isProtected: true,
        });
        const defaultPerms = DEFAULT_CREATOR_PERMISSIONS.map(p => ({
          roleId: defaultRole.id,
          module: p.module,
          action: p.action,
          granted: true,
        }));
        await storage.setRolePermissions(defaultRole.id, defaultPerms);
        await storage.createAuditLog({
          organizationId: org.id,
          userId,
          action: "organization_created",
          newValue: { name: org.name, slug: org.slug },
        });
        const orgCreatedAt = new Date(org.createdAt);
        const trialEnd = new Date(orgCreatedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
        await storage.createOrganizationSubscription({
          organizationId: org.id,
          status: "trialing",
          tier: "trial",
          tierAssignedAt: orgCreatedAt,
          trialStartedAt: orgCreatedAt,
          trialEndsAt: trialEnd,
        });
        await storage.updateOrganization(org.id, {
          tier: "trial",
          tierAssignedAt: orgCreatedAt,
          trialExpiresAt: trialEnd,
        });
        await storage.updateUser(userId, {
          tier: "trial",
          tierAssignedAt: orgCreatedAt,
          trialExpiresAt: trialEnd,
          accountStatus: "active",
        });
        const welcomeUser = await storage.getUser(userId);
        if (welcomeUser) {
          sendWelcomeEmail({ toEmail: welcomeUser.email, fullName: welcomeUser.fullName, trialExpiresAt: trialEnd }).catch((e) =>
            console.warn("[email] Welcome email failed:", e.message)
          );
        }
      } else if (data.companyName && data.companyName.trim() && data.companyName.trim() !== existingCtx.organization.name) {
        await storage.updateOrganization(existingCtx.organization.id, { name: data.companyName.trim() });
      }

      const existing = profileOrganizationId
        ? await storage.getBrandProfileByOrganizationId(profileOrganizationId)
        : await storage.getBrandProfileByUserId(userId);
      let profile;

      if (existing) {
        profile = await storage.updateBrandProfile(existing.id, profileData);
      } else {
        profile = await storage.createBrandProfile({
          userId,
          organizationId: profileOrganizationId,
          ...profileData,
        } as any);
      }

      try {
        const samplePosts = await generateSamplePosts(data);
        const updateData: Record<string, any> = {};
        if (samplePosts.linkedin) updateData.sampleLinkedinPost = samplePosts.linkedin;
        if (samplePosts.instagram) updateData.sampleInstagramPost = samplePosts.instagram;
        if (Object.keys(updateData).length > 0) {
          profile = await storage.updateBrandProfile(profile.id, updateData);
        }
      } catch {
      }

      // Auto-trigger market intelligence analysis in the background (non-blocking)
      try {
        const websiteUrl = profile.websiteUrl;
        if (websiteUrl && typeof websiteUrl === "string" && websiteUrl.trim()) {
          const orgCtx = await getUserOrgContext(userId);
          if (orgCtx?.organization) {
            const orgId = orgCtx.organization.id;
            const existingIntel = await storage.getMarketIntelligenceByOrgId(orgId);
            if (!existingIntel) {
              storage.upsertMarketIntelligence(orgId, { status: "running", targetDomain: websiteUrl }).then(() => {
                runCompetitorAnalysis(websiteUrl).then(async (result) => {
                  await storage.upsertMarketIntelligence(orgId, {
                    status: "completed",
                    targetDomain: result.targetDomain,
                    seedKeywords: [result.targetDomain],
                    discoveredCompetitors: result.discoveredCompetitors,
                    keywordInsights: result.keywordInsights,
                    lastRefreshedAt: new Date(),
                  });
                }).catch(async (err) => {
                  console.error("Competitor analysis failed:", err);
                  await storage.upsertMarketIntelligence(orgId, { status: "failed" });
                });
              }).catch((err) => console.error("Failed to set market intelligence status:", err));
            }
          }
        }
      } catch (err) {
        console.error("Failed to trigger market intelligence analysis:", err);
      }

      res.json(profile);
    } catch (error: any) {
      console.error("Save brand profile error:", error);
      res.status(500).json({ message: "Failed to save brand profile" });
    }
  });

  app.get("/api/brand-profile", requireAuth, requirePermission("BRAND_VOICE", "view"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { profile } = await getCurrentBrandProfile(userId);
      if (!profile) {
        return res.status(404).json({ message: "Brand profile not found" });
      }
      res.json(profile);
    } catch (error: any) {
      console.error("Get brand profile error:", error);
      res.status(500).json({ message: "Failed to get brand profile" });
    }
  });

  app.patch("/api/brand-profile", requireAuth, requirePermission("BRAND_VOICE", "customize"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { profile: existing } = await getCurrentBrandProfile(userId);
      if (!existing) {
        return res.status(404).json({ message: "Brand profile not found" });
      }

      const parseResult = brandProfileUpdateSchema.extend({
        companyName: z.string().min(1).optional(),
        industry: z.string().min(1).optional(),
      }).safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid data", errors: parseResult.error.flatten() });
      }

      const data = parseResult.data;
      const updatedProfile = await storage.updateBrandProfile(existing.id, {
        companyName: data.companyName ?? existing.companyName,
        industry: data.industry ?? existing.industry,
        brandSummary: data.brandSummary ?? existing.brandSummary,
        targetAudience: data.targetAudience ?? existing.targetAudience,
        messagingPillars: data.messagingPillars ?? existing.messagingPillars,
        toneStyle: data.toneStyle ?? existing.toneStyle,
        doLanguageRules: data.doLanguageRules ?? existing.doLanguageRules,
        dontLanguageRules: data.dontLanguageRules ?? existing.dontLanguageRules,
        ctaPreferences: data.ctaPreferences ?? existing.ctaPreferences,
        customCtas: data.customCtas ?? existing.customCtas,
        hashtagThemes: data.hashtagThemes ?? existing.hashtagThemes,
      });

      res.json(updatedProfile);
    } catch (error: any) {
      console.error("Update brand profile error:", error);
      res.status(500).json({ message: "Failed to update brand profile" });
    }
  });

  // Brand voice import — preview (parse + filter + summarize + extract)
  app.post(
    "/api/brand-profile/import/preview",
    requireAuth,
    requirePermission("BRAND_VOICE", "customize"),
    importUpload.array("files", 20),
    async (req: Request, res: Response) => {
      pruneImportCache();
      const userId = req.session.userId!;
      const { profile } = await getCurrentBrandProfile(userId);
      if (!profile) {
        return res.status(404).json({ message: "Brand profile not found. Complete onboarding first." });
      }

      // Soft rate limit via existing audit trail in rawBrandVoiceJson.imports[]
      const ctx = await getUserOrgContext(userId);
      const sub = ctx?.organization ? await storage.getOrganizationSubscription(ctx.organization.id) : null;
      const tier = (sub?.tier ?? ctx?.organization?.tier ?? "trial") as string;
      const dailyLimit = tier === "trial" ? 1 : tier === "founder" ? 1000 : 10;
      const raw = (profile.rawBrandVoiceJson as any) || {};
      const recentImports: any[] = Array.isArray(raw.imports) ? raw.imports : [];
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const recentCount = recentImports.filter((i) => {
        const t = i?.createdAt ? new Date(i.createdAt).getTime() : 0;
        return t > dayAgo;
      }).length;
      if (recentCount >= dailyLimit) {
        return res.status(429).json({
          message: `You've reached your daily import limit (${dailyLimit}). Try again tomorrow.`,
        });
      }

      const files = (req.files as Express.Multer.File[]) || [];
      const pasteText: string | undefined = typeof req.body?.text === "string" ? req.body.text : undefined;
      const pasteTag = req.body?.tag;
      const includeAssistant = req.body?.includeAssistant === "true" || req.body?.includeAssistant === true;

      if (files.length === 0 && (!pasteText || !pasteText.trim())) {
        return res.status(400).json({ message: "Please paste some text or upload at least one file." });
      }

      const ALLOWED_EXT = /\.(md|markdown|txt)$/i;
      const ALLOWED_MIMES = new Set(["text/plain", "text/markdown", "text/x-markdown", "application/octet-stream"]);
      const fileInputs: Array<{ name: string; text: string }> = [];
      for (const f of files) {
        if (!ALLOWED_EXT.test(f.originalname) && !ALLOWED_MIMES.has(f.mimetype)) {
          return res.status(400).json({ message: `Unsupported file: ${f.originalname}. Only .md, .markdown, and .txt are allowed.` });
        }
        const text = f.buffer.toString("utf-8");
        fileInputs.push({ name: f.originalname, text });
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const sendEvent = (eventData: any) => {
        res.write(`data: ${JSON.stringify(eventData)}\n\n`);
      };

      try {
        sendEvent({ type: "status", stage: "parsing", message: "Reading your chats…" });

        const result = await runImportPipeline(
          { files: fileInputs, pasteText, pasteTag, includeAssistant },
          { companyName: profile.companyName, industry: profile.industry },
          genAI,
          (p: ImportProgress) => {
            if (p.stage === "filtering") {
              sendEvent({ type: "status", stage: "filtering", message: "Finding the brand-relevant parts…", kept: p.kept, total: p.total });
            } else if (p.stage === "summarizing") {
              sendEvent({ type: "status", stage: "summarizing", message: `Summarizing chunk ${p.current} of ${p.total}…`, current: p.current, total: p.total });
            } else if (p.stage === "parsing") {
              sendEvent({ type: "status", stage: "parsing", message: "Reading your chats…", current: p.current, total: p.total });
            }
          },
        );

        sendEvent({ type: "status", stage: "extracting", message: "Pulling out your brand voice…" });

        const condensed = result.condensedText;
        if (!condensed.trim()) {
          sendEvent({ type: "error", message: "No usable content was found. Try pasting longer text or uploading more files." });
          return res.end();
        }

        const extracted = await analyzeBrandVoiceWithAI(profile.companyName, profile.industry, condensed);

        const importId = crypto.randomUUID();
        importCache.set(importId, {
          importId,
          organizationId: profile.organizationId ?? null,
          userId,
          extracted,
          sourceMeta: result.sourceMeta,
          createdAt: Date.now(),
        });

        sendEvent({
          type: "done",
          importId,
          extracted,
          sourceMeta: result.sourceMeta,
          blocksKept: result.blocksKept,
          blocksTotal: result.blocksTotal,
        });
        res.end();
      } catch (error: any) {
        console.error("Brand import preview error:", error);
        sendEvent({ type: "error", message: error?.message || "Import failed. Please try again." });
        res.end();
      }
    },
  );

  // Brand voice import — apply (merge per-field actions and persist)
  app.post(
    "/api/brand-profile/import/apply",
    requireAuth,
    requirePermission("BRAND_VOICE", "customize"),
    async (req: Request, res: Response) => {
      try {
        pruneImportCache();
        const userId = req.session.userId!;
        const { profile } = await getCurrentBrandProfile(userId);
        if (!profile) {
          return res.status(404).json({ message: "Brand profile not found." });
        }

        const { importId, fieldsToApply } = req.body || {};
        if (!importId || typeof importId !== "string") {
          return res.status(400).json({ message: "Missing importId." });
        }

        const cached = importCache.get(importId);
        if (!cached) {
          return res.status(410).json({ message: "This import preview has expired. Please run the import again." });
        }
        if (cached.userId !== userId) {
          return res.status(403).json({ message: "Access denied." });
        }
        const sameOrg =
          (cached.organizationId ?? null) === (profile.organizationId ?? null);
        if (!sameOrg) {
          return res.status(403).json({ message: "This import does not match your current workspace." });
        }

        const actions: Partial<Record<BrandVoiceField, FieldAction>> = {};
        if (fieldsToApply && typeof fieldsToApply === "object") {
          for (const f of BRAND_VOICE_FIELDS) {
            const v = fieldsToApply[f];
            if (v === "keep" || v === "replace" || v === "append") {
              actions[f] = v;
            }
          }
        }

        const update = mergeBrandVoice(profile as any, cached.extracted, actions);
        const cleaned = cleanBrandProfileArrays({ ...update });

        const raw = (profile.rawBrandVoiceJson as any) || {};
        const auditEntries: any[] = Array.isArray(raw.imports) ? [...raw.imports] : [];
        auditEntries.push({
          importId,
          createdAt: new Date().toISOString(),
          appliedFields: actions,
          sourceMeta: cached.sourceMeta,
          extractedSnapshot: cached.extracted,
        });
        const newRawJson = { ...raw, imports: auditEntries.slice(-25) };

        const updated = await storage.updateBrandProfile(profile.id, {
          ...cleaned,
          rawBrandVoiceJson: newRawJson,
        });

        importCache.delete(importId);
        res.json(updated);
      } catch (error: any) {
        console.error("Brand import apply error:", error);
        res.status(500).json({ message: "Failed to apply brand voice changes." });
      }
    },
  );

  // Notification preferences (approval reminder digest)
  app.get("/api/notification-preferences", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const ctx = await getUserOrgContext(userId);
      if (!ctx?.organization) {
        return res.json({
          approvalRemindersEnabled: true,
          approvalReminderFrequency: "weekly",
          approvalReminderLastSentAt: null,
        });
      }
      const prefs = await storage.getNotificationPreferences(userId, ctx.organization.id);
      if (!prefs) {
        return res.json({
          approvalRemindersEnabled: true,
          approvalReminderFrequency: "weekly",
          approvalReminderLastSentAt: null,
        });
      }
      res.json({
        approvalRemindersEnabled: prefs.approvalRemindersEnabled,
        approvalReminderFrequency: prefs.approvalReminderFrequency,
        approvalReminderLastSentAt: prefs.approvalReminderLastSentAt,
      });
    } catch (error: any) {
      console.error("Get notification preferences error:", error);
      res.status(500).json({ message: "Failed to load notification preferences" });
    }
  });

  app.patch("/api/notification-preferences", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const ctx = await getUserOrgContext(userId);
      if (!ctx?.organization) {
        return res.status(400).json({ message: "Join an organization first." });
      }

      const parsed = notificationPreferencesUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
      }

      const existing = await storage.getNotificationPreferences(userId, ctx.organization.id);
      const wasEnabled = existing?.approvalRemindersEnabled ?? true;
      const willBeEnabled = parsed.data.approvalRemindersEnabled ?? wasEnabled;

      const update: Record<string, any> = { ...parsed.data };
      if (!wasEnabled && willBeEnabled) {
        update.approvalReminderLastSentAt = new Date();
      }

      const saved = await storage.upsertNotificationPreferences(userId, ctx.organization.id, update);
      res.json({
        approvalRemindersEnabled: saved.approvalRemindersEnabled,
        approvalReminderFrequency: saved.approvalReminderFrequency,
        approvalReminderLastSentAt: saved.approvalReminderLastSentAt,
      });
    } catch (error: any) {
      console.error("Update notification preferences error:", error);
      res.status(500).json({ message: "Failed to save notification preferences" });
    }
  });

  app.post("/api/notification-preferences/test-reminder", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const limit = checkTestReminderRateLimit(userId);
      if (!limit.allowed) {
        res.setHeader("Retry-After", String(limit.retryAfterSec));
        return res.status(429).json({
          message: `Too many test emails — try again in ${Math.ceil(limit.retryAfterSec / 60)} min.`,
        });
      }
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const ctx = await getUserOrgContext(userId);
      if (!ctx?.organization) {
        return res.status(400).json({ message: "Join an organization first." });
      }

      const prefs = await storage.getNotificationPreferences(userId, ctx.organization.id);
      const rawFreq = prefs?.approvalReminderFrequency ?? "weekly";
      const frequency = (REMINDER_FREQUENCIES.includes(rawFreq as ReminderFrequency) ? rawFreq : "weekly") as ReminderFrequency;
      const windowMs = frequency === "daily" ? 24*60*60*1000
                     : frequency === "weekly" ? 7*24*60*60*1000
                     : 30*24*60*60*1000;
      const windowLabel = frequency === "daily" ? "in the next 24 hours"
                        : frequency === "weekly" ? "in the next 7 days"
                        : "in the next 30 days";

      const now = new Date();
      const windowEnd = new Date(now.getTime() + windowMs);
      const upcoming = await storage.getUpcomingScheduledPostsForOrg(ctx.organization.id, now, windowEnd);

      const baseUrl = (process.env.APP_URL || process.env.APP_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");
      const baseAbs = /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`;

      const previewPosts = upcoming.length > 0 ? upcoming : [{
        id: 0,
        content: "This is a sample post — when real posts are scheduled in your selected window, they'll appear here. Click 'Review post' to edit, reschedule, or delete.",
        platform: "linkedin",
        scheduledAt: new Date(now.getTime() + 24*60*60*1000),
        campaignId: 0,
        campaignName: "Sample campaign",
      }];

      await sendApprovalReminderEmail({
        toEmail: user.email,
        fullName: user.fullName,
        organizationName: ctx.organization.name,
        frequency,
        windowLabel,
        posts: previewPosts.map((p) => ({
          id: p.id,
          content: p.content,
          platform: p.platform,
          scheduledAt: p.scheduledAt,
          campaignName: p.campaignName,
          detailUrl: p.campaignId ? `${baseAbs}/campaigns/${p.campaignId}` : `${baseAbs}/scheduled-posts`,
        })),
        preferencesUrl: `${baseAbs}/settings`,
      });

      res.json({ ok: true, postCount: upcoming.length });
    } catch (error: any) {
      console.error("Test reminder error:", error);
      res.status(500).json({ message: "Failed to send test email" });
    }
  });

  // Market Intelligence routes
  app.get("/api/organizations/:orgId/market-intelligence", requireAuth, async (req: Request, res: Response) => {
    try {
      const orgId = parseInt(req.params.orgId);
      if (isNaN(orgId)) return res.status(400).json({ message: "Invalid organization ID" });
      const userId = req.session.userId!;
      const member = await storage.getOrganizationMember(userId, orgId);
      if (!member) return res.status(403).json({ message: "Access denied" });
      const intel = await storage.getMarketIntelligenceByOrgId(orgId);
      return res.json(intel || null);
    } catch (error: any) {
      console.error("Get market intelligence error:", error);
      res.status(500).json({ message: "Failed to get market intelligence" });
    }
  });

  app.post("/api/organizations/:orgId/market-intelligence/analyze", requireAuth, async (req: Request, res: Response) => {
    try {
      const orgId = parseInt(req.params.orgId);
      if (isNaN(orgId)) return res.status(400).json({ message: "Invalid organization ID" });
      const userId = req.session.userId!;
      const member = await storage.getOrganizationMember(userId, orgId);
      if (!member) return res.status(403).json({ message: "Access denied" });

      const existing = await storage.getMarketIntelligenceByOrgId(orgId);
      if (existing?.status === "running") {
        const lastRefresh = existing.lastRefreshedAt ? new Date(existing.lastRefreshedAt).getTime() : 0;
        const minutesSinceLast = (Date.now() - lastRefresh) / 60000;
        if (minutesSinceLast < 10) {
          return res.status(409).json({ message: "Analysis is already running" });
        }
        // Stuck for more than 10 minutes — allow a fresh run
      }

      const { domain } = req.body || {};
      const rawDomain = typeof domain === "string" ? domain.trim() : null;
      const targetDomain = rawDomain || existing?.targetDomain;
      if (!targetDomain || typeof targetDomain !== "string" || !targetDomain.includes(".")) {
        return res.status(400).json({ message: "Please enter a valid website domain (e.g., example.com)." });
      }

      await storage.upsertMarketIntelligence(orgId, { status: "running", targetDomain, lastRefreshedAt: new Date() });
      res.json({ message: "Analysis started" });

      runCompetitorAnalysis(targetDomain).then(async (result) => {
        await storage.upsertMarketIntelligence(orgId, {
          status: "completed",
          targetDomain: result.targetDomain,
          seedKeywords: [result.targetDomain],
          discoveredCompetitors: result.discoveredCompetitors,
          keywordInsights: result.keywordInsights,
          lastRefreshedAt: new Date(),
        });
      }).catch(async (err) => {
        console.error("Competitor analysis failed:", err);
        await storage.upsertMarketIntelligence(orgId, { status: "failed" });
      });
    } catch (error: any) {
      console.error("Market intelligence analyze error:", error);
      res.status(500).json({ message: "Failed to start analysis" });
    }
  });

  app.post("/api/upload-edited-image", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { imageBase64, context, campaignId, postId, mediaFileId } = req.body;

      if (!imageBase64 || typeof imageBase64 !== "string") {
        return res.status(400).json({ message: "Missing image data" });
      }

      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");

      let folder = "campaignai/edited";
      let publicId = `edited_${Date.now()}`;

      if (context === "campaign" && campaignId && postId) {
        folder = `campaignai/campaigns/${campaignId}`;
        publicId = `post_${postId}_edited_${Date.now()}`;
      } else if (context === "media" && mediaFileId) {
        folder = `campaignai/media/${userId}`;
        publicId = `media_${mediaFileId}_edited_${Date.now()}`;
      }

      const url = await uploadBufferToCloudinary(imageBuffer, folder, publicId);

      if (context === "campaign" && campaignId && postId) {
        const posts = await storage.getCampaignPosts(campaignId);
        const post = posts.find((p) => p.id === postId);
        if (post) {
          const existingUrls = post.imageUrls || (post.imageUrl ? [post.imageUrl] : []);
          const updatedUrls = [...existingUrls];
          if (updatedUrls.length > 0) {
            updatedUrls[0] = url;
          } else {
            updatedUrls.push(url);
          }
          await storage.updateCampaignPost(postId, {
            imageUrl: url,
            imageUrls: updatedUrls,
          });
        }
      } else if (context === "media" && mediaFileId) {
        await storage.updateMediaFile(mediaFileId, { url });
      }

      res.json({ url });
    } catch (error: any) {
      console.error("Upload edited image error:", error);
      res.status(500).json({ message: "Failed to save edited image" });
    }
  });

  app.post("/api/brainstorm", requireAuth, requirePermission("MEDIA_LIBRARY", "customize"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { profile: brandProfile } = await getCurrentBrandProfile(userId);
      if (!brandProfile) {
        return res.status(404).json({ message: "Brand profile not found. Complete onboarding first." });
      }

      const prompt = `You are a creative social media strategist. Based on this brand profile, brainstorm 6 unique campaign ideas that would resonate with the target audience.

BRAND PROFILE:
Company: ${brandProfile.companyName} (${brandProfile.industry})
Brand Summary: ${brandProfile.brandSummary || "N/A"}
Target Audience: ${brandProfile.targetAudience || "N/A"}
Tone: ${brandProfile.toneStyle || "N/A"}
Messaging Pillars: ${(brandProfile.messagingPillars || []).join(", ")}
Hashtag Themes: ${(brandProfile.hashtagThemes || []).join(", ")}

Generate 6 diverse campaign ideas. Each idea should be different in theme and approach.

Return ONLY valid JSON as an array of objects with these fields:
- title: A catchy campaign name (3-6 words)
- description: A 1-2 sentence description of the campaign concept
- platforms: An array of suggested platforms from ["linkedin", "x", "instagram", "facebook"] (pick 1-3 most suitable)
- tone: One of ["professional", "casual", "energetic", "friendly", "witty"]
- cta: One of ["Learn More", "Shop Now", "Signup", "Get Started", "Contact Us", "Download Now"]

No markdown code fences. Return ONLY the JSON array.`;

      const brainstormModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { temperature: 0.9, maxOutputTokens: 4000 } });
      const brainstormResult = await brainstormModel.generateContent(prompt);

      const content = brainstormResult.response.text() || "[]";
      let ideas: any[];
      try {
        ideas = parseGeminiJson(content);
        if (!Array.isArray(ideas)) ideas = [];
      } catch {
        ideas = [];
      }
      res.json({ ideas });
    } catch (error: any) {
      console.error("Brainstorm error:", error);
      res.status(500).json({ message: "Failed to generate ideas" });
    }
  });

  // Parse a natural-language campaign description into structured fields.
  // Used by the chat-first campaign-creation flow. Does not persist anything.
  app.post("/api/campaigns/parse", requireAuth, requirePermission("CAMPAIGN", "customize"), async (req: Request, res: Response) => {
    try {
      const parsed = campaignParseRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Please include a longer prompt (3–2000 characters)." });
      }

      const userId = req.session.userId!;
      const { profile } = await getCurrentBrandProfile(userId);
      if (!profile) {
        return res.status(400).json({ message: "Complete onboarding first so I have brand context to work with." });
      }

      const today = new Date().toISOString().slice(0, 10);
      const customCtas = (profile.customCtas || []).slice(0, 3);
      const geminiPrompt = `You are a campaign-setup assistant for a social-media marketing tool. Extract the user's natural-language description into a structured campaign config. Use the brand profile for sensible defaults when a field is not explicit.

Today's date: ${today}

Brand profile context:
- Company: ${profile.companyName}
- Industry: ${profile.industry}
- Tone style: ${profile.toneStyle || "(not set)"}
- Brand summary: ${profile.brandSummary || "(not set)"}
- Saved custom CTAs: ${customCtas.length > 0 ? customCtas.join(", ") : "(none — fall back to standard defaults)"}

User prompt:
"""
${parsed.data.prompt}
"""

Return a JSON object with EXACTLY these keys. No prose, no markdown fences:

- description (string, 1–1000 chars): What the campaign is about, in the user's own framing. Required.
- platforms (array of one or more of "linkedin" | "x" | "instagram" | "facebook"): Which platforms to post on. If the user doesn't specify, default to ["linkedin"] and add "platforms" to defaultedFields.
- tone (one of "professional" | "casual" | "energetic" | "friendly" | "witty"): Match the user's wording (e.g. "fun", "playful" → "casual" or "friendly"). If absent, map from brand tone style if the mapping is clear, otherwise "professional". If you defaulted it, add "tone" to defaultedFields.
- postsCount (integer 1–5): How many posts per platform. If absent, default to 3 and add "postsCount" to defaultedFields. Cap at 5.
- callToAction (string 1–80 chars): The CTA. If absent, use the first saved custom CTA above; if none, use "Learn More". If you defaulted it, add "callToAction" to defaultedFields.
- startDate (ISO date string like "2026-05-15") or null: Inferred from phrases like "next Monday", "starting next week". null if not specified.
- endDate (ISO date string) or null: Same.
- defaultedFields (array of strings): Names of the fields above that you defaulted (not explicit in the user prompt). Required, even if empty.

Rules:
- Be conservative — only mark a field as extracted (NOT defaulted) if the user clearly said it.
- Tone mapping: "professional/formal/serious" → professional; "casual/relaxed" → casual; "energetic/excited/punchy" → energetic; "friendly/warm" → friendly; "witty/clever/funny" → witty.
- Platforms: "LinkedIn"→linkedin, "Twitter"/"X"→x, "Instagram"/"IG"→instagram, "Facebook"/"FB"→facebook, "all platforms"/"everywhere"→all four.
- Output JSON only.`;

      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
      });
      const result = await model.generateContent(geminiPrompt);
      const raw = result.response.text() || "{}";

      let extracted: any;
      try {
        extracted = parseGeminiJson(raw);
      } catch (e) {
        console.error("Campaign parse — JSON parse error:", (e as Error).message, "raw:", raw.slice(0, 500));
        return res.status(422).json({
          message: "I couldn't quite parse that. Try giving a bit more detail about what the campaign is about.",
        });
      }

      const validated = campaignParseResponseSchema.safeParse(extracted);
      if (!validated.success) {
        console.error("Campaign parse — schema validation failed:", validated.error.flatten(), "extracted:", extracted);
        return res.status(422).json({
          message: "I couldn't quite parse that. Try giving a bit more detail — for example, mention what the campaign is about and which platforms you want.",
        });
      }

      res.json(validated.data);
    } catch (error: any) {
      console.error("Campaign parse error:", error);
      res.status(500).json({ message: "Couldn't process your prompt. Try again." });
    }
  });

  // Conversational campaign-setup chat. Each turn streams the assistant reply
  // token-by-token via SSE, then runs a fast structured-extraction pass and
  // sends a final { extracted, ready } event the UI uses to populate the
  // review card and surface the "Review & Create" button.
  app.post("/api/campaigns/chat", requireAuth, requirePermission("CAMPAIGN", "customize"), async (req: Request, res: Response) => {
    const parsed = campaignChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid conversation. Try again with a fresh chat." });
    }

    const userId = req.session.userId!;
    const { profile } = await getCurrentBrandProfile(userId);
    if (!profile) {
      return res.status(400).json({ message: "Complete onboarding first so I have brand context to work with." });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const sendEvent = (eventData: any) => {
      res.write(`data: ${JSON.stringify(eventData)}\n\n`);
    };

    const today = new Date().toISOString().slice(0, 10);
    const customCtas = (profile.customCtas || []).slice(0, 3);
    const brandContext = `Brand profile:
- Company: ${profile.companyName}
- Industry: ${profile.industry}
- Tone style: ${profile.toneStyle || "(not set)"}
- Brand summary: ${profile.brandSummary || "(not set)"}
- Saved custom CTAs: ${customCtas.length > 0 ? customCtas.join(", ") : "(none)"}`;

    const transcript = parsed.data.messages
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n\n");

    // One combined prompt: the model writes a conversational reply, then a
    // ###STATE### marker, then a JSON object of what's been captured. Because
    // it's a SINGLE model invocation, the reply and the state cannot
    // contradict each other — if the reply asks for a field, the JSON reports
    // that field as empty.
    const STATE_MARKER = "###STATE###";
    const combinedPrompt = `You are a friendly, concise campaign-setup assistant for a social-media marketing tool. The user wants to create a campaign. Your job is to chat with them and gather these fields:
- description (what the campaign is about)
- platforms (one or more of LinkedIn, X, Instagram, Facebook)
- tone (professional, casual, energetic, friendly, witty)
- postsCount (1–5 posts per platform)
- callToAction (1–80 chars)
- startDate / endDate (optional schedule range)

STRICT SCOPE: You only help with creating a social-media campaign. If the user asks about anything else — weather, math, code, jokes, current events, other tools, personal questions — do NOT engage with it. Reply with exactly one sentence: "I can only help you set up a campaign. What would you like the campaign to be about?" and stop. Never invent or reveal information unrelated to campaign setup.

Conversation rules:
- Be conversational. 1–3 sentences per reply. Ask ONE focused question at a time when something is missing.
- Lean on the brand profile defaults silently — don't pester the user when their request makes the answer obvious.
- If the user's first message already gives you everything, skip clarifying questions and reply with a brief confirmation summary ("Got it — 4 LinkedIn and Instagram posts about your new pricing, friendly tone, CTA Try free. Ready when you are.").
- When you ask about a specific field, keep it natural — do NOT list options as numbered choices in your reply. The UI surfaces clickable buttons automatically.
- In the conversational reply itself, do NOT output JSON, code blocks, or field labels.
- Don't claim to have scheduled or published anything — you only gather inputs; the user creates the campaign in a later step.

Today's date: ${today}
${brandContext}

Conversation so far:
${transcript}

OUTPUT FORMAT — follow exactly:
1. First, your conversational reply for the next turn (plain text only).
2. Then a line containing exactly: ${STATE_MARKER}
3. Then a single JSON object (no markdown fences) capturing ONLY what the user has actually provided so far:
{
  "description": "<the campaign topic in the user's words, or empty string if not given yet>",
  "platforms": [<only platforms the user explicitly named/implied; [] if none yet>],
  "tone": <"professional"|"casual"|"energetic"|"friendly"|"witty" or null if not given>,
  "postsCount": <integer 1-5 or null if not given>,
  "callToAction": "<the call to action, or empty string if not given>",
  "startDate": <"YYYY-MM-DD" or null>,
  "endDate": <"YYYY-MM-DD" or null>,
  "defaultedFields": [<names of fields the user explicitly told you to default/skip — fill those with a sensible value and list them here; otherwise empty>]
}

CRITICAL RULES for the output:
- The JSON must AGREE with your reply. If your reply is asking the user for a field, that field MUST be empty/null in the JSON. Never report a field as captured while you are still asking about it.
- You MUST emit ${STATE_MARKER} and the JSON on EVERY turn — including the final summary/confirmation turn where you tell the user everything is ready. NEVER skip the marker or the JSON.
- The JSON must include EVERY field captured across the WHOLE conversation so far — never drop a field you already have from an earlier turn.
- platforms values must be lowercase exactly: "linkedin", "x", "instagram", "facebook". tone must be lowercase exactly. postsCount must be a bare integer, not a string.
- Nothing after the JSON.

Example of a final summary turn (note it STILL ends with the marker + full JSON):
Perfect — that's everything! 3 friendly LinkedIn posts about your spring sale, CTA "Shop Now". Ready to review.
${STATE_MARKER}
{"description":"spring sale","platforms":["linkedin"],"tone":"friendly","postsCount":3,"callToAction":"Shop Now","startDate":null,"endDate":null,"defaultedFields":[]}`;

    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: { temperature: 0.6, maxOutputTokens: 700 },
      });

      const streamResult = await model.generateContentStream(combinedPrompt);

      // Stream every char BEFORE the marker as a delta; buffer everything
      // after. The marker can be split across chunks, so we hold back the
      // last (MARKER.length - 1) chars until we're sure they aren't a
      // partial marker.
      let fullText = "";
      let emittedLen = 0;
      let markerHit = false;

      for await (const chunk of streamResult.stream) {
        let t = "";
        try { t = chunk.text() || ""; } catch { t = ""; }
        if (!t) continue;
        fullText += t;
        if (markerHit) continue;

        const idx = fullText.indexOf(STATE_MARKER);
        if (idx === -1) {
          const safeEnd = Math.max(emittedLen, fullText.length - (STATE_MARKER.length - 1));
          if (safeEnd > emittedLen) {
            sendEvent({ type: "delta", text: fullText.slice(emittedLen, safeEnd) });
            emittedLen = safeEnd;
          }
        } else {
          if (idx > emittedLen) {
            sendEvent({ type: "delta", text: fullText.slice(emittedLen, idx) });
          }
          emittedLen = idx;
          markerHit = true;
          sendEvent({ type: "reply_complete" });
        }
      }

      // Reconcile against the aggregated response in case a chunk was missed.
      try {
        const finalText = (await streamResult.response).text();
        if (finalText && finalText.length > fullText.length) fullText = finalText;
      } catch {}

      // Marker never streamed (model forgot it) — flush the rest of the reply.
      if (!markerHit) {
        if (fullText.length > emittedLen) {
          sendEvent({ type: "delta", text: fullText.slice(emittedLen) });
        }
        sendEvent({ type: "reply_complete" });
      }

      // Split reply vs inline state JSON.
      const markerIdx = fullText.indexOf(STATE_MARKER);
      const fullReply = (markerIdx === -1 ? fullText : fullText.slice(0, markerIdx)).trim();
      const stateRaw = markerIdx === -1 ? "" : fullText.slice(markerIdx + STATE_MARKER.length).trim();

      // Try the inline JSON first: parse → normalize → validate.
      let validatedState: any = null;
      if (stateRaw) {
        try {
          const norm = normalizeChatState(parseGeminiJson(stateRaw));
          const v = campaignChatResponseSchema.safeParse(norm);
          if (v.success) validatedState = v.data;
          else console.error("Campaign chat — inline state validation failed:", JSON.stringify(v.error.flatten()).slice(0, 400));
        } catch (e) {
          console.error("Campaign chat — inline state parse failed:", (e as Error).message, "raw:", stateRaw.slice(0, 300));
        }
      }

      // Fallback: no usable inline state → one focused extraction call that
      // sees the full transcript plus the assistant's reply.
      if (!validatedState) {
        const fb = await runFallbackChatExtraction(transcript, fullReply, brandContext, today);
        if (fb) {
          const v = campaignChatResponseSchema.safeParse(fb);
          if (v.success) validatedState = v.data;
          else console.error("Campaign chat — fallback state validation failed:", JSON.stringify(v.error.flatten()).slice(0, 400));
        }
      }

      if (validatedState) {
        // nextField + ready derived deterministically from captured state.
        const extracted = validatedState as any;
        const missing = inferFieldFromMissingState(extracted);
        extracted.nextField = missing;
        extracted.ready = missing === null;

        if (extracted.ready) {
          if (!extracted.description || extracted.description.trim().length < 1) extracted.description = "Campaign";
          if (!extracted.platforms || extracted.platforms.length === 0) extracted.platforms = ["linkedin"];
          if (!extracted.tone) extracted.tone = "professional";
          if (!extracted.postsCount) extracted.postsCount = 3;
          if (!extracted.callToAction) extracted.callToAction = customCtas[0] || "Learn More";
        }

        sendEvent({ type: "done", fullReply, extracted, ready: extracted.ready });
      } else {
        // Both inline AND fallback failed — genuinely rare. Log loudly so a
        // regression is visible, not silent. Best-effort nextField from the
        // reply so the user at least sometimes gets chips.
        console.error("Campaign chat — NO usable state from inline OR fallback. reply:", fullReply.slice(0, 200));
        sendEvent({
          type: "done",
          fullReply,
          extracted: {
            description: "",
            platforms: [],
            tone: null,
            postsCount: null,
            callToAction: "",
            startDate: null,
            endDate: null,
            defaultedFields: [],
            ready: false,
            nextField: detectNextFieldFromReply(fullReply),
          },
          ready: false,
        });
      }
      res.end();
    } catch (error: any) {
      console.error("Campaign chat error:", error);
      sendEvent({ type: "error", message: error?.message || "Something went wrong. Try again." });
      res.end();
    }
  });

  // Create campaign and generate posts + images (SSE stream)
  app.post("/api/campaigns", requireAuth, requirePermission("CAMPAIGN", "customize"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const parseResult = createCampaignSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid data", errors: parseResult.error.flatten() });
      }

      const data = parseResult.data;
      const { profile: brandProfile } = await getCurrentBrandProfile(userId);
      if (!brandProfile) {
        return res.status(400).json({ message: "Please complete onboarding first to create campaigns" });
      }

      const ctx = await getUserOrgContext(userId);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const sendEvent = (eventData: any) => {
        res.write(`data: ${JSON.stringify(eventData)}\n\n`);
      };

      sendEvent({ type: "status", message: "Creating campaign..." });

      const hasSchedule = data.startDate && data.endDate;
      const status = hasSchedule ? "scheduled" : "draft";
      const totalPosts = data.postsCount * data.platforms.length;
      const campaign = await storage.createCampaign({
        userId,
        organizationId: ctx?.organization?.id ?? null,
        companyName: data.companyName,
        description: data.description,
        platforms: data.platforms,
        tone: data.tone,
        postsCount: totalPosts,
        callToAction: data.callToAction,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        status,
      });

      const posts = [];
      let orderIndex = 0;
      const startDate = data.startDate ? new Date(data.startDate) : null;
      const endDate = data.endDate ? new Date(data.endDate) : null;

      const topPerformingPosts = ctx?.organization
        ? await storage.getTopPerformingPostsByOrganizationId(ctx.organization.id, 5)
        : await storage.getTopPerformingPosts(userId, 5);

      // Load market intelligence for the campaign (use if not older than 30 days)
      let marketIntelligenceData: { keywordInsights: Array<{ keyword: string; searchVolume: number; difficulty: number; cpc: number; intent: string; relatedKeywords: string[] }>; discoveredCompetitors: Array<{ domain: string; score: number }> } | null = null;
      try {
        const orgCtx = await getUserOrgContext(userId);
        if (orgCtx?.organization) {
          const intel = await storage.getMarketIntelligenceByOrgId(orgCtx.organization.id);
          if (intel && intel.status === "completed" && intel.lastRefreshedAt) {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            if (intel.lastRefreshedAt > thirtyDaysAgo) {
              marketIntelligenceData = {
                keywordInsights: (intel.keywordInsights as Array<{ keyword: string; searchVolume: number; difficulty: number; cpc: number; intent: string; relatedKeywords: string[] }>) || [],
                discoveredCompetitors: (intel.discoveredCompetitors as Array<{ domain: string; score: number }>) || [],
              };
            }
          }
        }
      } catch {
        // Market intelligence is optional — don't fail the campaign creation
      }

      for (const platformKey of data.platforms) {
        const { PLATFORM_SETTINGS: PS } = await import("@shared/schema");
        const platLabel = PS[platformKey as keyof typeof PS]?.label || platformKey;
        sendEvent({ type: "status", message: `Generating ${platLabel} posts...` });

        const generatedPosts = await generateCampaignPosts(brandProfile, {
          companyName: data.companyName,
          description: data.description,
          platform: platformKey,
          tone: data.tone,
          postsCount: data.postsCount,
          callToAction: data.callToAction,
        }, topPerformingPosts, marketIntelligenceData);

        const miSources = marketIntelligenceData ? {
          keywords: [...marketIntelligenceData.keywordInsights]
            .filter(k => k.intent !== "navigational")
            .sort((a, b) => b.searchVolume - a.searchVolume)
            .slice(0, 10)
            .map(k => {
              const ni = k.intent.toLowerCase();
              const angle = ni === "transactional" ? "Action-driven"
                : (ni === "commercial" || ni === "commercial investigation") ? "Comparison"
                : "Educational";
              return { keyword: k.keyword, intent: k.intent, angle, searchVolume: k.searchVolume };
            }),
          domains: marketIntelligenceData.discoveredCompetitors.slice(0, 5).map(c => c.domain),
        } : undefined;

        for (let i = 0; i < generatedPosts.length; i++) {
          const generatedPost = generatedPosts[i];
          if (!generatedPost.content || generatedPost.content.trim().length === 0) {
            console.warn(`[campaign] Skipping empty post ${i + 1} for platform ${platformKey}`);
            continue;
          }

          let postScheduledAt: Date | undefined = undefined;
          if (startDate && endDate && totalPosts > 0) {
            const rangeMs = endDate.getTime() - startDate.getTime();
            const intervalMs = totalPosts > 1 ? rangeMs / (totalPosts - 1) : 0;
            postScheduledAt = new Date(startDate.getTime() + intervalMs * orderIndex);
          }

          const postIdentifier = `POST-${String(orderIndex + 1).padStart(3, '0')}`;
          const post = await storage.createCampaignPost({
            campaignId: campaign.id,
            postIdentifier,
            platform: platformKey,
            content: generatedPost.content,
            imagePrompt: generatedPost.imagePrompt,
            order: orderIndex++,
            scheduledAt: postScheduledAt,
            ...(miSources && { sources: miSources }),
          });
          posts.push(post);
        }
      }

      sendEvent({ type: "posts_created", campaign, posts });
      sendEvent({ type: "complete", campaign, posts });
      res.end();
    } catch (error: any) {
      console.error("Create campaign error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to create campaign. Please try again." });
      } else {
        res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
        res.end();
      }
    }
  });

  app.get("/api/campaigns", requireAuth, requirePermission("CAMPAIGN", "view"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const orgContext = await getUserOrgContext(userId);
      let userCampaigns;
      if (orgContext) {
        userCampaigns = await storage.getCampaignsByOrganizationId(orgContext.membership.organizationId);
      } else {
        userCampaigns = await storage.getCampaignsByUserId(userId);
      }
      const publishedCounts = await storage.getPublishedPostCountsByCampaign(userCampaigns.map(c => c.id));
      const withPublishState = userCampaigns.map(c => ({ ...c, publishedPostsCount: publishedCounts[c.id] ?? 0 }));
      res.json(withPublishState);
    } catch (error: any) {
      console.error("Get campaigns error:", error);
      res.status(500).json({ message: "Failed to get campaigns" });
    }
  });

  // Get single campaign with posts
  app.get("/api/campaigns/:id", requireAuth, requirePermission("CAMPAIGN", "view"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const campaignId = parseInt(req.params.id);
      if (isNaN(campaignId)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }

      const access = await loadCampaignForUser(userId, campaignId);
      if (!access) return res.status(404).json({ message: "Campaign not found" });
      const { campaign } = access;

      const posts = await storage.getCampaignPosts(campaignId);
      res.json({ campaign, posts });
    } catch (error: any) {
      console.error("Get campaign error:", error);
      res.status(500).json({ message: "Failed to get campaign" });
    }
  });

  // Update a campaign post
  app.patch("/api/campaigns/:id/posts/:postId", requireAuth, requirePermission("CAMPAIGN", "customize"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const campaignId = parseInt(req.params.id);
      const postId = parseInt(req.params.postId);
      if (isNaN(campaignId) || isNaN(postId)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      const access = await loadCampaignForUser(userId, campaignId);
      if (!access) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      const existingPosts = await storage.getCampaignPosts(campaignId);
      const postBelongsToCampaign = existingPosts.some((p) => p.id === postId);
      if (!postBelongsToCampaign) {
        return res.status(404).json({ message: "Post not found in this campaign" });
      }

      const { content, imagePrompt } = req.body;
      if (!content && !imagePrompt) {
        return res.status(400).json({ message: "Content or image prompt is required" });
      }

      const updateData: Record<string, any> = {};
      if (content && typeof content === "string") updateData.content = content;
      if (imagePrompt && typeof imagePrompt === "string") updateData.imagePrompt = imagePrompt;

      const updated = await storage.updateCampaignPost(postId, updateData);
      res.json(updated);
    } catch (error: any) {
      console.error("Update post error:", error);
      res.status(500).json({ message: "Failed to update post" });
    }
  });

  // Delete a post
  app.delete("/api/campaigns/:id/posts/:postId", requireAuth, requirePermission("CAMPAIGN", "customize"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const campaignId = parseInt(req.params.id);
      const postId = parseInt(req.params.postId);

      if (isNaN(campaignId) || isNaN(postId)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      const access = await loadCampaignForUser(userId, campaignId);
      if (!access) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      await storage.deleteCampaignPost(postId);

      const remainingPosts = await storage.getCampaignPosts(campaignId);
      const activePlatforms = [...new Set(remainingPosts.map(p => p.platform))];
      await storage.updateCampaign(campaignId, { platforms: activePlatforms });

      res.sendStatus(204);
    } catch (error: any) {
      console.error("Delete post error:", error);
      res.status(500).json({ message: "Failed to delete post" });
    }
  });

  app.delete("/api/campaigns/:id", requireAuth, requirePermission("CAMPAIGN", "customize"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const campaignId = parseInt(req.params.id);

      if (isNaN(campaignId)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }

      const access = await loadCampaignForUser(userId, campaignId);
      if (!access) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      await storage.deleteCampaign(campaignId);
      res.sendStatus(204);
    } catch (error: any) {
      console.error("Delete campaign error:", error);
      res.status(500).json({ message: "Failed to delete campaign" });
    }
  });

  // Add posts to existing campaign with auto image generation (SSE stream)
  app.post("/api/campaigns/:id/add-posts", requireAuth, requirePermission("CAMPAIGN", "customize"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const campaignId = parseInt(req.params.id);
      if (isNaN(campaignId)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }

      const access = await loadCampaignForUser(userId, campaignId);
      if (!access) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      const { campaign, ctx: campaignCtx } = access;

      const { postsCount, idea, platforms: requestedPlatforms } = req.body;
      const count = parseInt(postsCount);
      if (isNaN(count) || count < 1 || count > 5) {
        return res.status(400).json({ message: "Posts count must be between 1 and 5" });
      }

      const { profile: brandProfile } = await getCurrentBrandProfile(userId);
      if (!brandProfile) {
        return res.status(400).json({ message: "Brand profile not found" });
      }

      // Resolve platforms before quota check (same logic used later in the loop)
      const platforms = requestedPlatforms && Array.isArray(requestedPlatforms) && requestedPlatforms.length > 0
        ? requestedPlatforms
        : (campaign.platforms || ["linkedin"]);

      const addPostsCtx = campaignCtx ?? await getUserOrgContext(userId);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const sendEvent = (eventData: any) => {
        res.write(`data: ${JSON.stringify(eventData)}\n\n`);
      };

      sendEvent({ type: "status", message: "Generating post content..." });

      const existingPosts = await storage.getCampaignPosts(campaignId);
      const maxOrder = existingPosts.length > 0 ? Math.max(...existingPosts.map(p => p.order)) : -1;

      const description = idea && idea.trim()
        ? `${campaign.description}. Additional focus: ${idea.trim()}`
        : campaign.description;
      const posts = [];
      let currentOrder = maxOrder + 1;

      const topPerformingPosts = addPostsCtx?.organization
        ? await storage.getTopPerformingPostsByOrganizationId(addPostsCtx.organization.id, 5)
        : await storage.getTopPerformingPosts(userId, 5);

      let marketIntelligenceDataAddPosts: { keywordInsights: Array<{ keyword: string; searchVolume: number; difficulty: number; cpc: number; intent: string; relatedKeywords: string[] }>; discoveredCompetitors: Array<{ domain: string; score: number }> } | null = null;
      try {
        const orgCtxAdd = await getUserOrgContext(userId);
        if (orgCtxAdd?.organization) {
          const intel = await storage.getMarketIntelligenceByOrgId(orgCtxAdd.organization.id);
          if (intel && intel.status === "completed" && intel.lastRefreshedAt) {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            if (intel.lastRefreshedAt > thirtyDaysAgo) {
              marketIntelligenceDataAddPosts = {
                keywordInsights: (intel.keywordInsights as Array<{ keyword: string; searchVolume: number; difficulty: number; cpc: number; intent: string; relatedKeywords: string[] }>) || [],
                discoveredCompetitors: (intel.discoveredCompetitors as Array<{ domain: string; score: number }>) || [],
              };
            }
          }
        }
      } catch {
        // Optional — don't fail
      }

      for (const platformKey of platforms) {
        const generatedPosts = await generateCampaignPosts(brandProfile, {
          companyName: campaign.companyName,
          description,
          platform: platformKey,
          tone: campaign.tone,
          postsCount: count,
          callToAction: campaign.callToAction,
        }, topPerformingPosts, marketIntelligenceDataAddPosts);

        const miSourcesAdd = marketIntelligenceDataAddPosts ? {
          keywords: [...marketIntelligenceDataAddPosts.keywordInsights]
            .filter(k => k.intent !== "navigational")
            .sort((a, b) => b.searchVolume - a.searchVolume)
            .slice(0, 10)
            .map(k => {
              const ni = k.intent.toLowerCase();
              const angle = ni === "transactional" ? "Action-driven"
                : (ni === "commercial" || ni === "commercial investigation") ? "Comparison"
                : "Educational";
              return { keyword: k.keyword, intent: k.intent, angle, searchVolume: k.searchVolume };
            }),
          domains: marketIntelligenceDataAddPosts.discoveredCompetitors.slice(0, 5).map(c => c.domain),
        } : undefined;

        for (let i = 0; i < generatedPosts.length; i++) {
          const postIdentifier = `POST-${String(currentOrder + 1).padStart(3, '0')}`;
          const post = await storage.createCampaignPost({
            campaignId: campaign.id,
            postIdentifier,
            platform: platformKey,
            content: generatedPosts[i].content,
            imagePrompt: generatedPosts[i].imagePrompt,
            order: currentOrder++,
            ...(miSourcesAdd && { sources: miSourcesAdd }),
          });
          posts.push(post);
        }
      }

      const existingPlatforms = campaign.platforms || [];
      const mergedPlatforms = Array.from(new Set([...existingPlatforms, ...platforms]));
      await storage.updateCampaign(campaignId, {
        postsCount: existingPosts.length + posts.length,
        platforms: mergedPlatforms,
      });

      sendEvent({ type: "posts_created", posts });
      sendEvent({ type: "complete", posts });
      res.end();
    } catch (error: any) {
      console.error("Add posts error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to generate additional posts. Please try again." });
      } else {
        res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
        res.end();
      }
    }
  });

  // Regenerate image for a single post
  app.post("/api/campaigns/:id/posts/:postId/regenerate-image", requireAuth, requirePermission("CAMPAIGN", "customize"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const campaignId = parseInt(req.params.id);
      const postId = parseInt(req.params.postId);
      if (isNaN(campaignId) || isNaN(postId)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      const access = await loadCampaignForUser(userId, campaignId);
      if (!access) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      const existingPosts = await storage.getCampaignPosts(campaignId);
      const post = existingPosts.find((p) => p.id === postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found in this campaign" });
      }

      const { imagePrompt } = req.body;
      if (!imagePrompt || typeof imagePrompt !== "string") {
        return res.status(400).json({ message: "Image prompt is required" });
      }

      await storage.updateCampaignPost(postId, { imagePrompt });

      const imageUrl = await generateAndUploadImage(imagePrompt, campaignId, postId, post.platform as any);
      const currentUrls = post.imageUrls || [];
      const updatedUrls = [...currentUrls, imageUrl];
      const updated = await storage.updateCampaignPost(postId, { imageUrl, imageUrls: updatedUrls });

      res.json(updated);
    } catch (error: any) {
      console.error("Regenerate image error:", error);
      res.status(500).json({ message: "Failed to regenerate image" });
    }
  });

  // AI refinement preview — caption and/or image. Does NOT save; returns
  // the new content for the client to display side-by-side with the
  // current version. The user then calls /refine/apply to commit, or
  // discards client-side at zero cost.
  app.post("/api/campaigns/:id/posts/:postId/refine", requireAuth, requirePermission("CAMPAIGN", "customize"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const campaignId = parseInt(req.params.id as string);
      const postId = parseInt(req.params.postId as string);
      if (isNaN(campaignId) || isNaN(postId)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      const access = await loadCampaignForUser(userId, campaignId);
      if (!access) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      const existingPosts = await storage.getCampaignPosts(campaignId);
      const post = existingPosts.find((p) => p.id === postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found in this campaign" });
      }

      const parsed = refinePostRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }
      const { feedback, target } = parsed.data;

      // Reject image-target if the post has no image to refine.
      if ((target === "image" || target === "both") && !post.imageUrl) {
        return res.status(400).json({
          message: "This post has no image yet. Generate an image first, or refine the caption only.",
        });
      }

      // Load the full brief — same fields generateCampaignPosts uses.
      const ctx = access.ctx;
      let brandProfile: any = null;
      if (ctx?.organization) {
        brandProfile = await storage.getBrandProfileByOrganizationId(ctx.organization.id);
      }
      if (!brandProfile) {
        brandProfile = await storage.getBrandProfileByUserId(userId);
      }

      let marketIntelligence: { keywords: string[] } | null = null;
      if (ctx?.organization) {
        try {
          const intel = await storage.getMarketIntelligenceByOrgId(ctx.organization.id);
          if (intel && intel.status === "completed" && intel.lastRefreshedAt) {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            if (intel.lastRefreshedAt > thirtyDaysAgo) {
              const insights = (intel.keywordInsights as Array<{ keyword: string; intent: string; searchVolume: number }>) || [];
              marketIntelligence = {
                keywords: insights
                  .filter((k) => k.intent?.toLowerCase() !== "navigational")
                  .sort((a, b) => b.searchVolume - a.searchVolume)
                  .slice(0, 10)
                  .map((k) => k.keyword),
              };
            }
          }
        } catch {
          // Market intel is optional.
        }
      }

      const campaignBrief = {
        description: access.campaign.description,
        tone: access.campaign.tone,
        callToAction: access.campaign.callToAction,
        companyName: access.campaign.companyName,
      };

      const response: RefinePostResponse = {};

      // Run text + image in parallel when both are requested.
      const tasks: Promise<void>[] = [];

      if (target === "content" || target === "both") {
        tasks.push(
          refinePostContent({
            currentContent: post.content,
            feedback,
            platform: post.platform,
            campaign: campaignBrief,
            brandProfile,
            marketIntelligence,
          }).then((newContent) => {
            response.newContent = newContent;
          }),
        );
      }

      if (target === "image" || target === "both") {
        tasks.push(
          refinePostImageDataUrl({
            currentImageUrl: post.imageUrl!,
            currentImagePrompt: post.imagePrompt || "",
            feedback,
            platform: post.platform,
            campaign: { description: campaignBrief.description, tone: campaignBrief.tone },
            brandProfile,
          }).then(({ dataUrl, refinedPrompt }) => {
            response.newImageBase64 = dataUrl;
            response.newImagePrompt = refinedPrompt;
          }),
        );
      }

      await Promise.all(tasks);
      res.json(response);
    } catch (error: any) {
      console.error("Refine post error:", error);
      res.status(500).json({ message: error?.message || "Failed to refine post" });
    }
  });

  // Commit a previewed refinement. Pushes the previous caption into
  // contentVersions[], uploads any previewed image to Cloudinary, and
  // appends to imageUrls[]. Splitting from /refine means discarded
  // previews cost nothing.
  app.post("/api/campaigns/:id/posts/:postId/refine/apply", requireAuth, requirePermission("CAMPAIGN", "customize"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const campaignId = parseInt(req.params.id as string);
      const postId = parseInt(req.params.postId as string);
      if (isNaN(campaignId) || isNaN(postId)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      const access = await loadCampaignForUser(userId, campaignId);
      if (!access) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      const existingPosts = await storage.getCampaignPosts(campaignId);
      const post = existingPosts.find((p) => p.id === postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found in this campaign" });
      }

      const parsed = refineApplyRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }
      const { newContent, newImageBase64, newImagePrompt } = parsed.data;

      const updates: Record<string, unknown> = {};

      if (typeof newContent === "string") {
        const versions = post.contentVersions || [];
        updates.content = newContent;
        updates.contentVersions = [...versions, post.content];
      }

      if (typeof newImageBase64 === "string") {
        // Strip "data:image/png;base64," prefix if present.
        const base64Only = newImageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
        const buf = Buffer.from(base64Only, "base64");
        const folder = `campaignai/campaigns/${campaignId}`;
        const publicId = `post_${postId}_refined_${Date.now()}`;
        const url = await uploadBufferToCloudinary(buf, folder, publicId);
        updates.imageUrl = url;
        updates.imageUrls = [...(post.imageUrls || []), url];
        if (newImagePrompt) {
          updates.imagePrompt = newImagePrompt;
        }
      }

      const updated = await storage.updateCampaignPost(postId, updates as any);
      res.json(updated);
    } catch (error: any) {
      console.error("Refine apply error:", error);
      res.status(500).json({ message: error?.message || "Failed to apply refinement" });
    }
  });

  app.get("/api/calendar/posts", requireAuth, requirePermission("CALENDAR", "view"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const ctx = await getUserOrgContext(userId);
      const data = ctx?.organization
        ? await storage.getAllCampaignPostsByOrganizationId(ctx.organization.id)
        : await storage.getAllCampaignPostsByUserId(userId);
      res.json(data);
    } catch (error: any) {
      console.error("Get calendar posts error:", error);
      res.status(500).json({ message: "Failed to get calendar posts" });
    }
  });

  app.patch("/api/campaigns/:id/posts/:postId/schedule", requireAuth, requirePermission("CALENDAR", "customize"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const campaignId = parseInt(req.params.id);
      const postId = parseInt(req.params.postId);
      if (isNaN(campaignId) || isNaN(postId)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      const access = await loadCampaignForUser(userId, campaignId);
      if (!access) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      const existingPosts = await storage.getCampaignPosts(campaignId);
      const post = existingPosts.find((p) => p.id === postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found in this campaign" });
      }

      const { scheduledAt } = req.body;
      if (scheduledAt === null) {
        const updated = await storage.updateCampaignPost(postId, { scheduledAt: null });
        return res.json(updated);
      }
      if (!scheduledAt || typeof scheduledAt !== "string") {
        return res.status(400).json({ message: "scheduledAt date string is required" });
      }

      const updated = await storage.updateCampaignPost(postId, { scheduledAt: new Date(scheduledAt) });
      res.json(updated);
    } catch (error: any) {
      console.error("Schedule post error:", error);
      res.status(500).json({ message: "Failed to schedule post" });
    }
  });

  app.patch("/api/campaigns/:id/posts/:postId/attach-image", requireAuth, requirePermission("CAMPAIGN", "customize"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const campaignId = parseInt(req.params.id);
      const postId = parseInt(req.params.postId);
      if (isNaN(campaignId) || isNaN(postId)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      const access = await loadCampaignForUser(userId, campaignId);
      if (!access) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      const existingPosts = await storage.getCampaignPosts(campaignId);
      const post = existingPosts.find((p) => p.id === postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found in this campaign" });
      }

      const { imageUrl } = req.body;
      if (!imageUrl || typeof imageUrl !== "string") {
        return res.status(400).json({ message: "Image URL is required" });
      }

      const currentUrls = post.imageUrls || [];
      const updatedUrls = [...currentUrls, imageUrl];
      const updated = await storage.updateCampaignPost(postId, { imageUrl, imageUrls: updatedUrls });
      res.json(updated);
    } catch (error: any) {
      console.error("Attach image error:", error);
      res.status(500).json({ message: "Failed to attach image" });
    }
  });

  app.patch("/api/campaigns/:id/posts/:postId/remove-image", requireAuth, requirePermission("CAMPAIGN", "customize"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const campaignId = parseInt(req.params.id);
      const postId = parseInt(req.params.postId);
      if (isNaN(campaignId) || isNaN(postId)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      const access = await loadCampaignForUser(userId, campaignId);
      if (!access) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      const existingPosts = await storage.getCampaignPosts(campaignId);
      const post = existingPosts.find((p) => p.id === postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found in this campaign" });
      }

      const { imageIndex } = req.body;
      if (typeof imageIndex !== "number") {
        return res.status(400).json({ message: "imageIndex is required" });
      }

      const currentUrls = post.imageUrls || [];
      if (imageIndex < 0 || imageIndex >= currentUrls.length) {
        return res.status(400).json({ message: "Invalid image index" });
      }

      const updatedUrls = currentUrls.filter((_, i) => i !== imageIndex);
      const newPrimaryUrl = updatedUrls.length > 0 ? updatedUrls[0] : null;
      const updated = await storage.updateCampaignPost(postId, { imageUrl: newPrimaryUrl, imageUrls: updatedUrls });
      res.json(updated);
    } catch (error: any) {
      console.error("Remove image error:", error);
      res.status(500).json({ message: "Failed to remove image" });
    }
  });

  const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

  app.get("/api/campaigns/:id/metrics/sample-csv", requireAuth, requirePermission("CAMPAIGN", "view"), async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.id);
      if (isNaN(campaignId)) return res.status(400).json({ message: "Invalid campaign ID" });

      const userId = req.session.userId!;
      const access = await loadCampaignForUser(userId, campaignId);
      if (!access) return res.status(404).json({ message: "Campaign not found" });

      const posts = await storage.getCampaignPosts(campaignId);
      const headers = "post_identifier,platform,impressions,reach,likes,comments,shares,saves,clicks";
      const rows = posts.map(p => `${p.postIdentifier || `POST-${String(p.order + 1).padStart(3, '0')}`},${p.platform},0,0,0,0,0,0,0`);
      const csv = [headers, ...rows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="campaign-${campaignId}-metrics-sample.csv"`);
      res.send(csv);
    } catch (error: any) {
      console.error("Sample CSV error:", error);
      res.status(500).json({ message: "Failed to generate sample CSV" });
    }
  });

  app.post("/api/campaigns/:id/metrics/upload-csv", requireAuth, requirePermission("CAMPAIGN", "customize"), csvUpload.single("file"), async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.id);
      if (isNaN(campaignId)) return res.status(400).json({ message: "Invalid campaign ID" });

      const userId = req.session.userId!;
      const access = await loadCampaignForUser(userId, campaignId);
      if (!access) return res.status(404).json({ message: "Campaign not found" });

      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const csvText = req.file.buffer.toString("utf-8");
      const lines = csvText.replace(/^\uFEFF/, '').trim().split("\n").map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length < 2) return res.status(400).json({ message: "CSV must have a header row and at least one data row" });

      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let c = 0; c < line.length; c++) {
          const ch = line[c];
          if (inQuotes) {
            if (ch === '"') {
              if (c + 1 < line.length && line[c + 1] === '"') {
                current += '"';
                c++;
              } else {
                inQuotes = false;
              }
            } else {
              current += ch;
            }
          } else {
            if (ch === '"') {
              inQuotes = true;
            } else if (ch === ',') {
              result.push(current.trim());
              current = '';
            } else {
              current += ch;
            }
          }
        }
        result.push(current.trim());
        return result;
      };

      const requiredHeaders = ["post_identifier", "platform", "impressions", "reach", "likes", "comments", "shares", "saves", "clicks"];
      const headers = parseCSVLine(lines[0].toLowerCase());
      const missing = requiredHeaders.filter(rh => !headers.includes(rh));
      if (missing.length > 0) return res.status(400).json({ message: `Missing columns: ${missing.join(", ")}` });

      const posts = await storage.getCampaignPosts(campaignId);
      const postMap = new Map(posts.map(p => [p.postIdentifier || `POST-${String(p.order + 1).padStart(3, '0')}`, p]));

      const errors: string[] = [];
      const results: any[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ""; });

        const identifier = row["post_identifier"];
        const post = postMap.get(identifier);
        if (!post) {
          errors.push(`Row ${i + 1}: Post identifier "${identifier}" not found in this campaign`);
          continue;
        }

        const numFields = ["impressions", "reach", "likes", "comments", "shares", "saves", "clicks"] as const;
        const parsed: Record<string, number> = {};
        let rowValid = true;
        for (const field of numFields) {
          const cleaned = row[field].replace(/,/g, '');
          const val = parseInt(cleaned);
          if (isNaN(val) || val < 0) {
            errors.push(`Row ${i + 1}: "${field}" must be a non-negative number (got "${row[field]}")`);
            rowValid = false;
            break;
          }
          parsed[field] = val;
        }
        if (!rowValid) continue;

        const metric = await storage.upsertPostMetrics(post.id, {
          impressions: parsed.impressions,
          reach: parsed.reach,
          likes: parsed.likes,
          comments: parsed.comments,
          shares: parsed.shares,
          saves: parsed.saves,
          clicks: parsed.clicks,
        });
        results.push(metric);
      }

      if (errors.length > 0 && results.length === 0) {
        return res.status(400).json({ message: "No valid rows found", errors });
      }

      res.json({
        message: `Successfully imported metrics for ${results.length} post(s)`,
        imported: results.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      console.error("Upload CSV error:", error);
      res.status(500).json({ message: "Failed to process CSV" });
    }
  });

  app.get("/api/campaigns/:id/metrics", requireAuth, requirePermission("CAMPAIGN", "view"), async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.id);
      if (isNaN(campaignId)) return res.status(400).json({ message: "Invalid campaign ID" });

      const userId = req.session.userId!;
      const access = await loadCampaignForUser(userId, campaignId);
      if (!access) return res.status(404).json({ message: "Campaign not found" });

      const metricsWithPosts = await storage.getMetricsByCampaignId(campaignId);

      const postMetricsData = metricsWithPosts.map(m => {
        const totalEngagement = m.likes + m.comments + m.shares + m.saves;
        const engagementRate = m.reach > 0 ? (totalEngagement / m.reach) * 100 : 0;
        const ctr = m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0;
        return {
          postId: m.postId,
          postIdentifier: m.post.postIdentifier,
          platform: m.post.platform,
          impressions: m.impressions,
          reach: m.reach,
          likes: m.likes,
          comments: m.comments,
          shares: m.shares,
          saves: m.saves,
          clicks: m.clicks,
          engagementRate: Math.round(engagementRate * 100) / 100,
          ctr: Math.round(ctr * 100) / 100,
          uploadedAt: m.uploadedAt,
        };
      });

      const totals = {
        impressions: postMetricsData.reduce((sum, m) => sum + m.impressions, 0),
        reach: postMetricsData.reduce((sum, m) => sum + m.reach, 0),
        likes: postMetricsData.reduce((sum, m) => sum + m.likes, 0),
        comments: postMetricsData.reduce((sum, m) => sum + m.comments, 0),
        shares: postMetricsData.reduce((sum, m) => sum + m.shares, 0),
        saves: postMetricsData.reduce((sum, m) => sum + m.saves, 0),
        clicks: postMetricsData.reduce((sum, m) => sum + m.clicks, 0),
      };
      const totalEngagement = totals.likes + totals.comments + totals.shares + totals.saves;
      const avgEngagementRate = totals.reach > 0 ? (totalEngagement / totals.reach) * 100 : 0;
      const avgCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

      res.json({
        campaign: {
          ...totals,
          totalEngagement,
          engagementRate: Math.round(avgEngagementRate * 100) / 100,
          ctr: Math.round(avgCtr * 100) / 100,
          postsWithMetrics: postMetricsData.length,
        },
        posts: postMetricsData,
      });
    } catch (error: any) {
      console.error("Get metrics error:", error);
      res.status(500).json({ message: "Failed to fetch metrics" });
    }
  });

  app.post("/api/posts/:postId/link-url", requireAuth, requirePermission("CAMPAIGN", "customize"), async (req: Request, res: Response) => {
    try {
      const postId = parseInt(req.params.postId);
      if (isNaN(postId)) return res.status(400).json({ message: "Invalid post ID" });

      const urlValue = (req.body.url || req.body.platformPostUrl);
      if (!urlValue || typeof urlValue !== "string") {
        return res.status(400).json({ message: "url is required" });
      }
      const url = urlValue.trim();
      if (!url.startsWith("http")) return res.status(400).json({ message: "Invalid URL — must start with http" });

      const userId = req.session.userId!;
      const post = await storage.getCampaignPostById(postId);
      if (!post) return res.status(404).json({ message: "Post not found" });

      const access = await loadCampaignForUser(userId, post.campaignId);
      if (!access) return res.status(403).json({ message: "Access denied" });

      // Validate URL domain against expected platform domain
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ message: "Invalid URL format" });
      }
      const hostname = parsedUrl.hostname.toLowerCase();
      const PLATFORM_DOMAINS: Record<string, string[]> = {
        x: ["twitter.com", "x.com"],
        twitter: ["twitter.com", "x.com"],
        facebook: ["facebook.com", "www.facebook.com", "fb.com"],
        instagram: ["instagram.com", "www.instagram.com"],
        linkedin: ["linkedin.com", "www.linkedin.com"],
      };
      const expectedDomains = PLATFORM_DOMAINS[post.platform] ?? [];
      if (expectedDomains.length > 0 && !expectedDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
        return res.status(400).json({ message: `URL does not match expected ${post.platform} domain` });
      }

      let extractedPostId: string | null = null;
      const parts = parsedUrl.pathname.split("/").filter(Boolean);
      if (post.platform === "x" || post.platform === "twitter") {
        const statusIdx = parts.findIndex((p) => p === "status");
        if (statusIdx >= 0 && parts[statusIdx + 1]) extractedPostId = parts[statusIdx + 1].split("?")[0];
      } else if (post.platform === "facebook") {
        // Handles:
        //   facebook.com/{page}/posts/{postId}
        //   facebook.com/permalink.php?story_fbid=...
        //   facebook.com/photo?fbid=...
        const storyFbid = parsedUrl.searchParams.get("story_fbid");
        const fbid = parsedUrl.searchParams.get("fbid");
        if (storyFbid && fbid) {
          extractedPostId = `${fbid}_${storyFbid}`;
        } else if (storyFbid) {
          extractedPostId = storyFbid;
        } else if (fbid) {
          extractedPostId = fbid;
        } else {
          // Try path: look for numeric segments >= 10 digits that aren't profile IDs (posts/ suffix)
          const postsIdx = parts.findIndex((p) => p === "posts" || p === "photos");
          if (postsIdx >= 0 && parts[postsIdx + 1]) {
            extractedPostId = parts[postsIdx + 1].split("?")[0];
          } else {
            // Last resort: grab the longest numeric segment
            const numericIds = parts.filter((p) => /^\d{10,}$/.test(p.split("?")[0]));
            if (numericIds.length > 0) extractedPostId = numericIds[numericIds.length - 1].split("?")[0];
          }
        }
      } else if (post.platform === "instagram") {
        const pIdx = parts.findIndex((p) => p === "p" || p === "reel" || p === "tv");
        if (pIdx >= 0 && parts[pIdx + 1]) extractedPostId = parts[pIdx + 1].split("?")[0];
      } else if (post.platform === "linkedin") {
        // Handles multiple real-world LinkedIn URL patterns:
        //   linkedin.com/posts/{slug}-{ugcPostId}-{suffix}/
        //   linkedin.com/feed/update/urn:li:activity:{id}/
        //   linkedin.com/feed/update/urn:li:ugcPost:{id}/
        //   linkedin.com/feed/update/urn:li:share:{id}/
        // Try urn: in path segments first (URL-encoded or raw)
        const fullUrl = decodeURIComponent(url);
        const urnMatch = fullUrl.match(/urn:li:(?:activity|ugcPost|share|post):(\d+)/);
        if (urnMatch) {
          const type = fullUrl.match(/urn:li:(activity|ugcPost|share|post)/)?.[1];
          extractedPostId = `urn:li:${type || "activity"}:${urnMatch[1]}`;
        } else {
          // Fallback: linkedin.com/posts/{slug}-{numericId}-{hash}/ — last numeric segment at end of slug
          const postsIdx = parts.findIndex((p) => p === "posts");
          if (postsIdx >= 0 && parts[postsIdx + 1]) {
            const slug = parts[postsIdx + 1].split("?")[0];
            const slugParts = slug.split("-");
            // Find a numeric segment that looks like a post ID (6+ digits) before final hash
            const numericCandidates = slugParts.filter((s) => /^\d{6,}$/.test(s));
            if (numericCandidates.length > 0) {
              extractedPostId = `urn:li:share:${numericCandidates[numericCandidates.length - 1]}`;
            }
          }
          if (!extractedPostId) {
            const activityPart = parts.find((p) => p.includes("activity-"));
            if (activityPart) {
              const rawId = activityPart.replace("activity-", "").split("?")[0];
              extractedPostId = `urn:li:activity:${rawId}`;
            }
          }
        }
      }

      // Require successful ID extraction for supported platforms — do not silently succeed
      if (!extractedPostId) {
        return res.status(400).json({
          message: `Could not extract a post ID from this ${post.platform} URL. Please check the URL and try again.`,
        });
      }

      await storage.updateCampaignPostPlatformId(postId, extractedPostId, url);

      // Fetch metrics immediately after linking (skip Instagram shortcode and LinkedIn)
      let fetchedMetrics: Record<string, number> | null = null;
      let metricsNote: string | undefined;
      if (extractedPostId) {
        if (post.platform === "linkedin") {
          metricsNote = "LinkedIn analytics require partner-level API access and are not available";
        } else {
          try {
            const { fetchXMetrics, getValidXAccessToken } = await import("./x");
            const { fetchFacebookMetrics } = await import("./facebook");
            const { fetchInstagramMetrics, resolveInstagramShortcodeToMediaId } = await import("./instagram");
            let metrics: { likes: number; comments: number; shares: number; impressions: number; reach?: number; saves?: number; clicks?: number } | null = null;
            let resolvedPostId = extractedPostId;
            if (post.platform === "x") {
              const token = await getValidXAccessToken(userId);
              if (token) metrics = await fetchXMetrics(extractedPostId, token);
            } else if (post.platform === "facebook") {
              const conn = await storage.getSocialConnectionByUserId(userId, "facebook");
              if (conn?.pageAccessToken) {
                const fbResult = await fetchFacebookMetrics(extractedPostId, conn.pageAccessToken, conn.pageId, conn.userAccessToken);
                if (fbResult && "permissionError" in fbResult) {
                  metricsNote = "Facebook metrics unavailable — please reconnect your Facebook account with pages_read_engagement permission.";
                } else {
                  metrics = fbResult;
                }
              }
            } else if (post.platform === "instagram") {
              const conn = await storage.getSocialConnectionByUserId(userId, "facebook");
              if (conn?.pageAccessToken && conn.igUserId) {
                // Instagram shortcode from URL cannot be used directly — resolve to media ID via the user's media feed
                const resolvedId = await resolveInstagramShortcodeToMediaId(conn.igUserId, extractedPostId, conn.pageAccessToken);
                if (resolvedId) {
                  resolvedPostId = resolvedId;
                  await storage.updateCampaignPostPlatformId(postId, resolvedId, url);
                  metrics = await fetchInstagramMetrics(resolvedId, conn.pageAccessToken);
                } else {
                  metricsNote = "Could not resolve this Instagram post from your connected account. Ensure the post was made from the linked account.";
                }
              } else {
                metricsNote = "Connect your Instagram account to fetch metrics for this post.";
              }
            }
            if (metrics) {
              await storage.upsertPostMetrics(postId, {
                likes: metrics.likes,
                comments: metrics.comments,
                shares: metrics.shares,
                impressions: metrics.impressions,
                reach: metrics.reach || 0,
                saves: metrics.saves || 0,
                clicks: metrics.clicks || 0,
              });
              await storage.createMetricSnapshot({
                postId,
                likes: metrics.likes,
                comments: metrics.comments,
                shares: metrics.shares,
                impressions: metrics.impressions,
                reach: metrics.reach || 0,
                saves: metrics.saves || 0,
                clicks: metrics.clicks || 0,
              });
              fetchedMetrics = {
                likes: metrics.likes,
                comments: metrics.comments,
                shares: metrics.shares,
                impressions: metrics.impressions,
                reach: metrics.reach || 0,
                saves: metrics.saves || 0,
                clicks: metrics.clicks || 0,
              };
            }
          } catch (metricsErr: any) {
            console.warn(`[link-url] Could not fetch initial metrics for post #${postId}:`, metricsErr.message);
          }
        }
      }

      // Return updated post + metrics
      const updatedPost = await storage.getCampaignPostById(postId);
      return res.json({
        success: true,
        platformPostId: extractedPostId,
        platformPostUrl: url,
        post: updatedPost,
        metrics: fetchedMetrics,
        ...(metricsNote ? { metricsNote } : {}),
      });
    } catch (error: any) {
      console.error("Link URL error:", error);
      res.status(500).json({ message: "Failed to link URL" });
    }
  });

  app.post("/api/campaigns/:id/metrics/sync", requireAuth, requirePermission("CAMPAIGN", "view"), async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.id);
      if (isNaN(campaignId)) return res.status(400).json({ message: "Invalid campaign ID" });
      const userId = req.session.userId!;
      const access = await loadCampaignForUser(userId, campaignId);
      if (!access) return res.status(404).json({ message: "Campaign not found" });

      const posts = await storage.getCampaignPostsWithPlatformIds(campaignId);
      if (posts.length === 0) return res.json({ synced: 0, message: "No posts with platform IDs to sync" });

      const { fetchXMetrics } = await import("./x");
      const { fetchFacebookMetrics } = await import("./facebook");
      const { fetchInstagramMetrics } = await import("./instagram");
      const { fetchLinkedInMetrics } = await import("./linkedin");
      const { getValidXAccessToken } = await import("./x");

      let synced = 0;
      let facebookNeedsReconnect = false;
      for (const post of posts) {
        if (!post.platformPostId) continue;
        try {
          let metrics: { likes: number; comments: number; shares: number; impressions: number; reach?: number; saves?: number; clicks?: number } | null = null;
          if (post.platform === "x") {
            const conn = await storage.getSocialConnectionByUserId(userId, "x");
            if (conn?.xAccessToken) {
              const token = await getValidXAccessToken(userId);
              if (token) metrics = await fetchXMetrics(post.platformPostId, token);
            }
          } else if (post.platform === "facebook") {
            const conn = await storage.getSocialConnectionByUserId(userId, "facebook");
            if (conn?.pageAccessToken) {
              const fbResult = await fetchFacebookMetrics(post.platformPostId, conn.pageAccessToken, conn.pageId, conn.userAccessToken);
              if (fbResult && "permissionError" in fbResult) {
                facebookNeedsReconnect = true;
                console.warn(`[metrics-sync] Facebook post #${post.id} needs pages_read_engagement — only shares available without it`);
              } else {
                metrics = fbResult;
              }
            }
          } else if (post.platform === "instagram") {
            const conn = await storage.getSocialConnectionByUserId(userId, "facebook");
            if (conn?.pageAccessToken) metrics = await fetchInstagramMetrics(post.platformPostId, conn.pageAccessToken);
          } else if (post.platform === "linkedin") {
            const conn = await storage.getSocialConnectionByUserId(userId, "linkedin");
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
            synced++;
          }
        } catch (err: any) {
          console.warn(`[metrics-sync] Failed to sync post #${post.id}:`, err.message);
        }
      }
      res.json({
        synced,
        total: posts.length,
        syncedAt: new Date().toISOString(),
        ...(facebookNeedsReconnect ? { facebookNeedsReconnect: true } : {}),
      });
    } catch (error: any) {
      console.error("Metrics sync error:", error);
      res.status(500).json({ message: "Failed to sync metrics" });
    }
  });

  app.get("/api/posts/:postId/metric-snapshots", requireAuth, requirePermission("CAMPAIGN", "view"), async (req: Request, res: Response) => {
    try {
      const postId = parseInt(req.params.postId);
      if (isNaN(postId)) return res.status(400).json({ message: "Invalid post ID" });

      const userId = req.session.userId!;
      const post = await storage.getCampaignPostById(postId);
      if (!post) return res.status(404).json({ message: "Post not found" });
      const access = await loadCampaignForUser(userId, post.campaignId);
      if (!access) return res.status(403).json({ message: "Access denied" });

      const snapshots = await storage.getMetricSnapshotsByPostId(postId, 10);
      return res.json(snapshots);
    } catch (error: any) {
      console.error("Get snapshots error:", error);
      res.status(500).json({ message: "Failed to fetch snapshots" });
    }
  });

  // Get metrics for a single post
  app.get("/api/posts/:postId/metrics", requireAuth, requirePermission("CAMPAIGN", "view"), async (req: Request, res: Response) => {
    try {
      const postId = parseInt(req.params.postId);
      if (isNaN(postId)) return res.status(400).json({ message: "Invalid post ID" });

      const userId = req.session.userId!;
      const post = await storage.getCampaignPostById(postId);
      if (!post) return res.status(404).json({ message: "Post not found" });
      const access = await loadCampaignForUser(userId, post.campaignId);
      if (!access) return res.status(403).json({ message: "Access denied" });

      const metrics = await storage.getMetricsByPostId(postId);
      if (!metrics) return res.json({ postId, platform: post.platform, metrics: null });

      const totalEngagement = metrics.likes + metrics.comments + metrics.shares + metrics.saves;
      const engagementRate = metrics.reach > 0 ? Math.round((totalEngagement / metrics.reach) * 10000) / 100 : 0;
      const ctr = metrics.impressions > 0 ? Math.round((metrics.clicks / metrics.impressions) * 10000) / 100 : 0;

      return res.json({
        postId,
        platform: post.platform,
        platformPostId: post.platformPostId,
        metrics: {
          impressions: metrics.impressions,
          reach: metrics.reach,
          likes: metrics.likes,
          comments: metrics.comments,
          shares: metrics.shares,
          saves: metrics.saves,
          clicks: metrics.clicks,
          engagementRate,
          ctr,
        },
        updatedAt: metrics.uploadedAt,
      });
    } catch (error: any) {
      console.error("Get single post metrics error:", error);
      res.status(500).json({ message: "Failed to fetch metrics" });
    }
  });

  // Refresh metrics for a single post on demand
  app.post("/api/posts/:postId/metrics/refresh", requireAuth, requirePermission("CAMPAIGN", "view"), async (req: Request, res: Response) => {
    try {
      const postId = parseInt(req.params.postId);
      if (isNaN(postId)) return res.status(400).json({ message: "Invalid post ID" });

      const userId = req.session.userId!;
      const post = await storage.getCampaignPostById(postId);
      if (!post) return res.status(404).json({ message: "Post not found" });
      if (!post.platformPostId) return res.status(400).json({ message: "Post has no linked platform post ID" });

      const access = await loadCampaignForUser(userId, post.campaignId);
      if (!access) return res.status(403).json({ message: "Access denied" });
      const { campaign } = access;

      const conn = await storage.getSocialConnectionByUserId(campaign.userId, post.platform || "facebook");
      if (!conn) return res.status(400).json({ message: `No ${post.platform || "facebook"} connection found` });

      let fetchedMetrics: any = null;
      const platform = post.platform || "facebook";

      if (platform === "facebook") {
        const { fetchFacebookMetrics } = await import("./facebook");
        const fbResult = await fetchFacebookMetrics(post.platformPostId, conn.pageAccessToken!, conn.pageId, conn.userAccessToken);
        if (fbResult && !("permissionError" in fbResult)) fetchedMetrics = fbResult;
        else if (fbResult && "permissionError" in fbResult) {
          return res.status(403).json({ message: "Facebook pages_read_engagement permission required for full metrics. Basic engagement may still be available." });
        }
      } else if (platform === "instagram") {
        const { fetchInstagramMetrics } = await import("./instagram");
        fetchedMetrics = await fetchInstagramMetrics(post.platformPostId, conn.pageAccessToken!);
      } else if (platform === "x") {
        const { fetchXMetrics, getValidXAccessToken } = await import("./x");
        const token = await getValidXAccessToken(conn);
        if (token) fetchedMetrics = await fetchXMetrics(post.platformPostId, token);
      } else if (platform === "linkedin") {
        const { fetchLinkedInMetrics } = await import("./linkedin");
        fetchedMetrics = await fetchLinkedInMetrics(post.platformPostId, conn.pageAccessToken!);
      }

      if (!fetchedMetrics) return res.status(502).json({ message: "Could not fetch metrics from platform" });

      const metricsData = {
        likes: fetchedMetrics.likes ?? 0,
        comments: fetchedMetrics.comments ?? 0,
        shares: fetchedMetrics.shares ?? 0,
        impressions: fetchedMetrics.impressions ?? 0,
        reach: fetchedMetrics.reach ?? 0,
        saves: fetchedMetrics.saves ?? 0,
        clicks: fetchedMetrics.clicks ?? 0,
      };

      await storage.upsertPostMetrics(postId, metricsData);
      await storage.createMetricSnapshot({ postId, ...metricsData });

      const totalEngagement = metricsData.likes + metricsData.comments + metricsData.shares + metricsData.saves;
      const engagementRate = metricsData.reach > 0 ? Math.round((totalEngagement / metricsData.reach) * 10000) / 100 : 0;
      const ctr = metricsData.impressions > 0 ? Math.round((metricsData.clicks / metricsData.impressions) * 10000) / 100 : 0;

      return res.json({
        postId,
        platform,
        platformPostId: post.platformPostId,
        metrics: { ...metricsData, engagementRate, ctr },
        refreshedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Refresh single post metrics error:", error);
      res.status(500).json({ message: "Failed to refresh metrics" });
    }
  });

  app.post("/api/campaigns/:id/generate-images", requireAuth, requirePermission("CAMPAIGN", "customize"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const campaignId = parseInt(req.params.id);
      if (isNaN(campaignId)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }

      const access = await loadCampaignForUser(userId, campaignId);
      if (!access) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      const posts = await storage.getCampaignPosts(campaignId);
      const postsWithPrompts = posts.filter((p) => p.imagePrompt && !p.imageUrl);

      if (postsWithPrompts.length === 0) {
        return res.status(400).json({ message: "No posts need image generation" });
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const sendEvent = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      sendEvent({ type: "start", total: postsWithPrompts.length });

      for (let i = 0; i < postsWithPrompts.length; i++) {
        const post = postsWithPrompts[i];

        sendEvent({ type: "progress", postId: post.id, index: i, status: "generating" });

        try {
          const imageUrl = await generateAndUploadImage(post.imagePrompt!, campaignId, post.id, post.platform as any);
          await storage.updateCampaignPost(post.id, { imageUrl });
          sendEvent({ type: "progress", postId: post.id, index: i, status: "done", imageUrl });
        } catch (err: any) {
          console.error(`Image generation failed for post ${post.id}:`, err);
          sendEvent({ type: "progress", postId: post.id, index: i, status: "error", error: err.message });
        }
      }

      sendEvent({ type: "complete" });
      res.end();
    } catch (error: any) {
      console.error("Generate images error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to generate images" });
      } else {
        res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
        res.end();
      }
    }
  });

  // ========================
  // Media Library Routes
  // ========================

  app.get("/api/media/folders", requireAuth, requirePermission("MEDIA_LIBRARY", "view"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const folders = await storage.getMediaFoldersByUserId(userId);
      res.json(folders);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/media/folders", requireAuth, requirePermission("MEDIA_LIBRARY", "customize"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { name, color } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ message: "Folder name is required" });
      }
      const folder = await storage.createMediaFolder({
        userId,
        name: name.trim(),
        color: color || "#6366f1",
      });
      res.json(folder);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/media/folders/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const folderId = parseInt(req.params.id);
      const folder = await storage.getMediaFolderById(folderId);
      if (!folder || folder.userId !== userId) {
        return res.status(404).json({ message: "Folder not found" });
      }
      const { name, color } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name.trim();
      if (color !== undefined) updates.color = color;
      const updated = await storage.updateMediaFolder(folderId, updates);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/media/folders/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const folderId = parseInt(req.params.id);
      const folder = await storage.getMediaFolderById(folderId);
      if (!folder || folder.userId !== userId) {
        return res.status(404).json({ message: "Folder not found" });
      }
      await storage.deleteMediaFolder(folderId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/media/files", requireAuth, requirePermission("MEDIA_LIBRARY", "view"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const folderIdParam = req.query.folderId;
      let folderId: number | null | undefined = undefined;
      if (folderIdParam === "null" || folderIdParam === "uncategorized") {
        folderId = null;
      } else if (folderIdParam !== undefined && folderIdParam !== "") {
        folderId = parseInt(folderIdParam as string);
      }
      const files = await storage.getMediaFilesByUserId(userId, folderId);
      res.json(files);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const mediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new Error("Only image files are allowed"));
      }
    },
  });

  app.post("/api/media/files/upload", requireAuth, mediaUpload.single("file"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const folderId = req.body.folderId ? parseInt(req.body.folderId) : null;
      if (folderId) {
        const folder = await storage.getMediaFolderById(folderId);
        if (!folder || folder.userId !== userId) {
          return res.status(404).json({ message: "Folder not found" });
        }
      }
      const ext = req.file.originalname.split(".").pop() || "png";
      const publicId = `media_${userId}_${Date.now()}`;
      const { url, size } = await uploadStreamToCloudinary(
        req.file.buffer,
        `campaignai/media/${userId}`,
        publicId,
        ext,
      );
      const mediaFile = await storage.createMediaFile({
        userId,
        folderId,
        name: req.file.originalname,
        url,
        size: size || req.file.size,
        mimeType: req.file.mimetype,
      });
      res.json(mediaFile);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/media/files/generate", requireAuth, requirePermission("MEDIA_LIBRARY", "customize"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { prompt, folderId } = req.body;
      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ message: "Prompt is required" });
      }
      if (folderId) {
        const folder = await storage.getMediaFolderById(folderId);
        if (!folder || folder.userId !== userId) {
          return res.status(404).json({ message: "Folder not found" });
        }
      }

      const imageBuffer = await generateMediaImage(prompt);
      const publicId = `media_${userId}_ai_${Date.now()}`;
      const url = await uploadBufferToCloudinary(
        imageBuffer,
        `campaignai/media/${userId}`,
        publicId,
      );
      const mediaFile = await storage.createMediaFile({
        userId,
        folderId: folderId || null,
        name: `AI Generated - ${prompt.substring(0, 40)}`,
        url,
        size: imageBuffer.length,
        mimeType: "image/png",
      });

      res.json(mediaFile);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/media/files/:id/move", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const fileId = parseInt(req.params.id);
      const file = await storage.getMediaFileById(fileId);
      if (!file || file.userId !== userId) {
        return res.status(404).json({ message: "File not found" });
      }
      const { folderId } = req.body;
      if (folderId !== null && folderId !== undefined) {
        const folder = await storage.getMediaFolderById(folderId);
        if (!folder || folder.userId !== userId) {
          return res.status(404).json({ message: "Folder not found" });
        }
      }
      const updated = await storage.updateMediaFile(fileId, { folderId: folderId ?? null });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/media/files/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const fileId = parseInt(req.params.id);
      const file = await storage.getMediaFileById(fileId);
      if (!file || file.userId !== userId) {
        return res.status(404).json({ message: "File not found" });
      }
      await storage.deleteMediaFile(fileId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ai-edit-image", requireAuth, requirePermission("MEDIA_LIBRARY", "customize"), async (req: Request, res: Response) => {
    try {
      const { imageBase64, operation, style, prompt } = req.body;
      if (!imageBase64 || !operation) {
        return res.status(400).json({ message: "Image data and operation are required" });
      }
      const validOps: AIEditOperation[] = ["remove_background", "enhance", "style_transfer", "prompt_edit"];
      if (!validOps.includes(operation)) {
        return res.status(400).json({ message: "Invalid operation. Use: remove_background, enhance, style_transfer, or prompt_edit" });
      }
      if (operation === "prompt_edit" && (!prompt || typeof prompt !== "string" || !prompt.trim())) {
        return res.status(400).json({ message: "A text prompt is required for the prompt_edit operation" });
      }
      let resultBuffer: Buffer;
      if (operation === "prompt_edit") {
        resultBuffer = await aiPromptEditImage(imageBase64, prompt);
      } else {
        resultBuffer = await aiEditImage(imageBase64, operation, style);
      }
      const base64Result = `data:image/png;base64,${resultBuffer.toString("base64")}`;
      res.json({ imageBase64: base64Result });
    } catch (error: any) {
      console.error("AI edit image error:", error);
      res.status(500).json({ message: error.message || "Failed to process AI image edit" });
    }
  });

  app.get("/api/organizations/current", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const ctx = await getUserOrgContext(userId);
      if (!ctx || !ctx.organization) {
        return res.json({ organization: null, membership: null });
      }
      res.json({ organization: ctx.organization, membership: ctx.membership });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/organizations", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (user.organizationId) {
        return res.status(400).json({ message: "User already belongs to an organization" });
      }
      const ctx = await getUserOrgContext(userId);
      if (ctx?.organization) {
        return res.status(400).json({ message: "User already belongs to an organization" });
      }
      const parsed = createOrganizationSchema.parse(req.body);
      const slug = parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      let finalSlug = slug;
      let counter = 1;
      while (await storage.getOrganizationBySlug(finalSlug)) {
        finalSlug = `${slug}-${counter}`;
        counter++;
      }
      const org = await storage.createOrganization({ name: parsed.name, slug: finalSlug });
      await storage.addOrganizationMember({
        userId,
        organizationId: org.id,
        systemRole: "admin",
        roleId: null,
      });
      await storage.updateUser(userId, { systemRole: "admin" } as any);
      const defaultRole = await storage.createRole({
        organizationId: org.id,
        name: "Standard Creator",
        description: "Default role with standard content creation permissions",
        isDefault: true,
        isProtected: true,
      });
      const defaultPerms = DEFAULT_CREATOR_PERMISSIONS.map(p => ({
        roleId: defaultRole.id,
        module: p.module,
        action: p.action,
        granted: true,
      }));
      await storage.setRolePermissions(defaultRole.id, defaultPerms);
      await storage.createAuditLog({
        organizationId: org.id,
        userId,
        action: "organization_created",
        newValue: { name: org.name, slug: org.slug },
      });

      const orgCreatedAt = new Date(org.createdAt);
      const trialEnd = new Date(orgCreatedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
      await storage.createOrganizationSubscription({
        organizationId: org.id,
        status: "trialing",
        tier: "trial",
        tierAssignedAt: orgCreatedAt,
        trialStartedAt: orgCreatedAt,
        trialEndsAt: trialEnd,
      });
      await storage.updateOrganization(org.id, {
        tier: "trial",
        tierAssignedAt: orgCreatedAt,
        trialExpiresAt: trialEnd,
      });
      await storage.updateUser(userId, {
        tier: "trial",
        tierAssignedAt: orgCreatedAt,
        trialExpiresAt: trialEnd,
        accountStatus: "active",
      });

      res.json(org);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/roles", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const ctx = await getUserOrgContext(userId);
      if (!ctx || !ctx.organization) {
        return res.json([]);
      }
      const orgRoles = await storage.getRolesByOrganizationId(ctx.organization.id);
      const rolesWithPerms = await Promise.all(orgRoles.map(async (role) => {
        const permissions = await storage.getRolePermissions(role.id);
        const memberCount = (await storage.getUsersWithRole(role.id)).length;
        return { ...role, permissions, memberCount };
      }));
      res.json(rolesWithPerms);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/roles", requireAuth, requireAdmin(), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const ctx = await getUserOrgContext(userId);
      if (!ctx || !ctx.organization) {
        return res.status(400).json({ message: "No organization found" });
      }
      const parsed = createRoleSchema.parse(req.body);
      const role = await storage.createRole({
        organizationId: ctx.organization.id,
        name: parsed.name,
        description: parsed.description,
        isDefault: false,
        isProtected: false,
      });
      const perms = parsed.permissions.map(p => ({
        roleId: role.id,
        module: p.module,
        action: p.action,
        granted: p.granted,
      }));
      await storage.setRolePermissions(role.id, perms);
      await storage.createAuditLog({
        organizationId: ctx.organization.id,
        userId,
        action: "role_created",
        newValue: { roleName: role.name, permissions: parsed.permissions },
      });
      const permissions = await storage.getRolePermissions(role.id);
      res.json({ ...role, permissions, memberCount: 0 });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/roles/:id", requireAuth, requireAdmin(), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const roleId = parseInt(req.params.id);
      const ctx = await getUserOrgContext(userId);
      if (!ctx || !ctx.organization) {
        return res.status(400).json({ message: "No organization found" });
      }
      const existingRole = await storage.getRoleById(roleId);
      if (!existingRole || existingRole.organizationId !== ctx.organization.id) {
        return res.status(404).json({ message: "Role not found" });
      }
      const parsed = updateRoleSchema.parse(req.body);
      const previousPerms = await storage.getRolePermissions(roleId);
      if (parsed.name || parsed.description !== undefined) {
        await storage.updateRole(roleId, {
          ...(parsed.name && { name: parsed.name }),
          ...(parsed.description !== undefined && { description: parsed.description }),
        });
      }
      if (parsed.permissions) {
        const perms = parsed.permissions.map(p => ({
          roleId,
          module: p.module,
          action: p.action,
          granted: p.granted,
        }));
        await storage.setRolePermissions(roleId, perms);
      }
      await storage.createAuditLog({
        organizationId: ctx.organization.id,
        userId,
        action: "role_updated",
        previousValue: { roleName: existingRole.name, permissions: previousPerms },
        newValue: { roleName: parsed.name || existingRole.name, permissions: parsed.permissions },
      });
      const updatedRole = await storage.getRoleById(roleId);
      const permissions = await storage.getRolePermissions(roleId);
      const memberCount = (await storage.getUsersWithRole(roleId)).length;
      res.json({ ...updatedRole, permissions, memberCount });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/roles/:id", requireAuth, requireAdmin(), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const roleId = parseInt(req.params.id);
      const ctx = await getUserOrgContext(userId);
      if (!ctx || !ctx.organization) {
        return res.status(400).json({ message: "No organization found" });
      }
      const role = await storage.getRoleById(roleId);
      if (!role || role.organizationId !== ctx.organization.id) {
        return res.status(404).json({ message: "Role not found" });
      }
      if (role.isProtected) {
        return res.status(400).json({ message: "Cannot delete a protected role" });
      }
      const usersWithRole = await storage.getUsersWithRole(roleId);
      if (usersWithRole.length > 0) {
        return res.status(400).json({
          message: "Cannot delete a role that is currently assigned to users. Please reassign them first.",
          assignedCount: usersWithRole.length,
        });
      }
      await storage.deleteRole(roleId);
      await storage.createAuditLog({
        organizationId: ctx.organization.id,
        userId,
        action: "role_deleted",
        previousValue: { roleName: role.name },
      });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/organization/members", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const ctx = await getUserOrgContext(userId);
      if (!ctx || !ctx.organization) {
        return res.json([]);
      }
      const members = await storage.getOrganizationMembers(ctx.organization.id);
      const rolesMap = new Map<number, any>();
      const orgRoles = await storage.getRolesByOrganizationId(ctx.organization.id);
      for (const r of orgRoles) {
        rolesMap.set(r.id, r);
      }
      const now = new Date();
      const enrichedMembers = members.map(m => ({
        ...m,
        role: m.roleId ? rolesMap.get(m.roleId) || null : null,
        user: { id: m.user.id, fullName: m.user.fullName, email: m.user.email, profileImage: m.user.profileImage },
        isPending: !!(m.user.invitationToken && m.user.invitationExpiresAt && m.user.invitationExpiresAt > now),
        isBlocked: m.isBlocked,
      }));
      res.json(enrichedMembers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/organization/members/invite", requireAuth, requireAdmin(), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const ctx = await getUserOrgContext(userId);
      if (!ctx || !ctx.organization) {
        return res.status(400).json({ message: "No organization found" });
      }
      const parsed = inviteMemberSchema.parse(req.body);
      if (parsed.systemRole === "super_admin" as any) {
        return res.status(403).json({ message: "Cannot assign Super Admin role" });
      }
      let targetUser = await storage.getUserByEmail(parsed.email);
      if (!targetUser) {
        targetUser = await storage.createUser({
          fullName: parsed.email.split("@")[0],
          email: parsed.email,
          onboardingCompleted: false,
          onboardingStep: 0,
        });
      }
      if (targetUser.organizationId) {
        if (targetUser.organizationId === ctx.organization.id) {
          return res.status(400).json({ message: "User is already a member of this organization" });
        }
        return res.status(400).json({ message: "User already belongs to another organization" });
      }
      const existingMemberships = await storage.getUserOrganizations(targetUser.id);
      if (existingMemberships.length > 0) {
        const existing = existingMemberships[0];
        if (existing.organizationId === ctx.organization.id) {
          return res.status(400).json({ message: "User is already a member of this organization" });
        }
        return res.status(400).json({ message: "User already belongs to another organization" });
      }
      let roleId = parsed.roleId || null;
      if (!roleId && parsed.systemRole === "creator") {
        const defaultRole = await storage.getDefaultRole(ctx.organization.id);
        if (defaultRole) roleId = defaultRole.id;
      }
      const member = await storage.addOrganizationMember({
        userId: targetUser.id,
        organizationId: ctx.organization.id,
        systemRole: parsed.systemRole,
        roleId,
      });

      const invitationToken = crypto.randomBytes(32).toString("hex");
      const invitationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await storage.updateUser(targetUser.id, {
        invitationToken,
        invitationExpiresAt,
      } as any);

      const inviter = await storage.getUser(userId);
      let roleName = parsed.systemRole === "admin" ? "Admin" : "Creator";
      if (roleId) {
        const role = await storage.getRoleById(roleId);
        if (role) roleName = role.name;
      }

      try {
        await sendInvitationEmail({
          toEmail: parsed.email,
          inviterName: inviter?.fullName || "An admin",
          organizationName: ctx.organization.name,
          roleName,
          token: invitationToken,
        });
      } catch (emailErr: any) {
        console.error("Failed to send invitation email:", emailErr.message);
      }

      await storage.createAuditLog({
        organizationId: ctx.organization.id,
        userId,
        targetUserId: targetUser.id,
        action: "member_invited",
        newValue: { email: parsed.email, systemRole: parsed.systemRole, roleId },
      });
      res.json(member);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/invite/verify", async (req: Request, res: Response) => {
    try {
      const token = req.query.token as string;
      if (!token) {
        return res.status(400).json({ message: "Token is required" });
      }
      const user = await storage.getUserByInvitationToken(token);
      if (!user) {
        return res.status(404).json({ message: "Invalid or expired invitation link" });
      }
      if (user.invitationExpiresAt && new Date(user.invitationExpiresAt) < new Date()) {
        return res.status(410).json({ message: "This invitation has expired" });
      }
      const memberships = await storage.getUserOrganizations(user.id);
      let organizationName = "";
      let roleName = "";
      if (memberships.length > 0) {
        const membership = memberships[0];
        const org = await storage.getOrganizationById(membership.organizationId);
        organizationName = org?.name || "";
        if (membership.roleId) {
          const role = await storage.getRoleById(membership.roleId);
          roleName = role?.name || membership.systemRole;
        } else {
          roleName = membership.systemRole === "admin" ? "Admin" : "Creator";
        }
      }
      res.json({
        email: user.email,
        fullName: user.fullName,
        organizationName,
        roleName,
        hasPassword: !!user.password,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/invite/accept", async (req: Request, res: Response) => {
    try {
      const { token, password, fullName } = req.body;
      if (!token || !password?.trim()) {
        return res.status(400).json({ message: "Token and password are required" });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }
      const user = await storage.getUserByInvitationToken(token);
      if (!user) {
        return res.status(404).json({ message: "Invalid or expired invitation link" });
      }
      if (user.invitationExpiresAt && new Date(user.invitationExpiresAt) < new Date()) {
        return res.status(410).json({ message: "This invitation has expired" });
      }
      const hashedPassword = await bcrypt.hash(password, 12);
      await storage.updateUser(user.id, {
        password: hashedPassword,
        fullName: fullName || user.fullName,
        invitationToken: null,
        invitationExpiresAt: null,
        onboardingCompleted: true,
      } as any);
      req.session.userId = user.id;
      const { password: _, invitationToken: __, ...safeUser } = user as any;
      res.json({ ...safeUser, fullName: fullName || user.fullName, onboardingCompleted: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/organization/members/:userId/role", requireAuth, requireAdmin(), async (req: Request, res: Response) => {
    try {
      const actorId = req.session.userId!;
      const targetUserId = parseInt(req.params.userId);
      const ctx = await getUserOrgContext(actorId);
      if (!ctx || !ctx.organization) {
        return res.status(400).json({ message: "No organization found" });
      }
      if (targetUserId === actorId) {
        return res.status(403).json({ message: "Cannot change your own role" });
      }
      const member = await storage.getOrganizationMember(targetUserId, ctx.organization.id);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }
      const parsed = assignRoleSchema.parse(req.body);
      if (parsed.roleId) {
        const role = await storage.getRoleById(parsed.roleId);
        if (!role || role.organizationId !== ctx.organization.id) {
          return res.status(404).json({ message: "Role not found in this organization" });
        }
      }
      const previousRoleId = member.roleId;
      await storage.updateOrganizationMember(member.id, { roleId: parsed.roleId });
      await storage.createAuditLog({
        organizationId: ctx.organization.id,
        userId: actorId,
        targetUserId,
        action: "role_assigned",
        previousValue: { roleId: previousRoleId },
        newValue: { roleId: parsed.roleId },
      });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/organization/members/invite/:userId", requireAuth, requireAdmin(), async (req: Request, res: Response) => {
    try {
      const actorId = req.session.userId!;
      const targetUserId = parseInt(req.params.userId);
      const ctx = await getUserOrgContext(actorId);
      if (!ctx || !ctx.organization) {
        return res.status(400).json({ message: "No organization found" });
      }
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      if (!targetUser.invitationToken) {
        return res.status(400).json({ message: "This invitation has already been accepted and cannot be cancelled" });
      }
      const member = await storage.getOrganizationMember(targetUserId, ctx.organization.id);
      if (!member) {
        return res.status(404).json({ message: "Member not found in this organization" });
      }
      await storage.removeOrganizationMember(member.id);
      await storage.createAuditLog({
        organizationId: ctx.organization.id,
        userId: actorId,
        targetUserId,
        action: "invite_cancelled",
        previousValue: { email: targetUser.email },
        newValue: null,
      });
      const isPlaceholder = !targetUser.password && !targetUser.googleId;
      if (isPlaceholder) {
        await storage.deleteUser(targetUserId);
      } else {
        await storage.updateUser(targetUserId, { invitationToken: null, invitationExpiresAt: null } as any);
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/organization/members/:userId/block", requireAuth, requireAdmin(), async (req: Request, res: Response) => {
    try {
      const actorId = req.session.userId!;
      const targetUserId = parseInt(req.params.userId);
      if (targetUserId === actorId) {
        return res.status(403).json({ message: "You cannot block yourself" });
      }
      const ctx = await getUserOrgContext(actorId);
      if (!ctx || !ctx.organization) {
        return res.status(400).json({ message: "No organization found" });
      }
      const member = await storage.getOrganizationMember(targetUserId, ctx.organization.id);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }
      const newBlocked = !member.isBlocked;
      await storage.updateOrganizationMember(member.id, { isBlocked: newBlocked });
      await storage.createAuditLog({
        organizationId: ctx.organization.id,
        userId: actorId,
        targetUserId,
        action: newBlocked ? "member_blocked" : "member_unblocked",
        previousValue: { isBlocked: member.isBlocked },
        newValue: { isBlocked: newBlocked },
      });
      res.json({ success: true, isBlocked: newBlocked });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/organization/members/:userId", requireAuth, requireAdmin(), async (req: Request, res: Response) => {
    try {
      const actorId = req.session.userId!;
      const targetUserId = parseInt(req.params.userId);
      if (targetUserId === actorId) {
        return res.status(403).json({ message: "You cannot remove yourself from the organization" });
      }
      const ctx = await getUserOrgContext(actorId);
      if (!ctx || !ctx.organization) {
        return res.status(400).json({ message: "No organization found" });
      }
      const member = await storage.getOrganizationMember(targetUserId, ctx.organization.id);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }
      await storage.createAuditLog({
        organizationId: ctx.organization.id,
        userId: actorId,
        targetUserId,
        action: "member_removed",
        previousValue: { systemRole: member.systemRole },
        newValue: null,
      });
      await storage.removeOrganizationMemberAndDeleteUser(member.id, targetUserId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/roles/audit-logs", requireAuth, requireAdmin(), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const ctx = await getUserOrgContext(userId);
      if (!ctx || !ctx.organization) {
        return res.json([]);
      }
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const logs = await storage.getAuditLogs(ctx.organization.id, limit, offset);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/user/permissions", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const ctx = await getUserOrgContext(userId);
      if (!ctx || !ctx.organization) {
        return res.json({ permissions: [], systemRole: user.systemRole || "creator", hasOrg: false, isBlocked: false });
      }
      const permissions = await storage.getUserPermissions(userId, ctx.organization.id);
      res.json({
        permissions,
        systemRole: ctx.membership.systemRole,
        hasOrg: true,
        organizationId: ctx.organization.id,
        organizationName: ctx.organization.name,
        isBlocked: !!ctx.membership.isBlocked,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/organizations", requireAuth, requireSuperAdmin(), async (req: Request, res: Response) => {
    try {
      const orgs = await storage.listAllOrganizations();
      res.json(orgs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const createOrgWithAdminSchema = z.object({
    orgName: z.string().min(2).max(100),
    adminFullName: z.string().min(2).max(100),
    adminEmail: z.string().email(),
    tier: z.enum(["trial", "professional", "enterprise", "founder"]),
  });

  app.post("/api/admin/organizations/create", requireAuth, requireSuperAdmin(), async (req: Request, res: Response) => {
    try {
      const actorId = req.session.userId!;
      const actor = await storage.getUser(actorId);
      const parsed = createOrgWithAdminSchema.parse(req.body);
      const email = parsed.adminEmail.toLowerCase().trim();

      if (actor && actor.email.toLowerCase() === email) {
        return res.status(400).json({ message: "You cannot create an organization for your own email." });
      }

      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ message: "An account with this email already exists." });
      }

      const tempPassword = crypto.randomBytes(9).toString("base64url");
      const hashedPassword = await bcrypt.hash(tempPassword, 12);

      const { org, user, subscription } = await storage.createOrganizationWithAdmin({
        orgName: parsed.orgName,
        adminFullName: parsed.adminFullName,
        adminEmail: email,
        hashedPassword,
        tier: parsed.tier,
      });

      await storage.createAuditLog({
        organizationId: org.id,
        userId: actorId,
        action: "organization_created",
        newValue: { name: org.name, slug: org.slug, tier: parsed.tier, adminEmail: email, createdBy: "super_admin" },
      });
      await storage.createAdminAuditLog({
        adminId: actorId,
        action: "super_admin_create_org",
        targetType: "organization",
        targetId: org.id,
        details: { orgName: org.name, adminEmail: email, adminUserId: user.id, tier: parsed.tier, timestamp: new Date().toISOString() },
      });

      let emailSent = true;
      try {
        await sendAdminCreatedOrgEmail({
          toEmail: email,
          fullName: parsed.adminFullName,
          orgName: org.name,
          tempPassword,
          tier: parsed.tier,
        });
      } catch (e: any) {
        emailSent = false;
        console.warn("[email] Admin-created-org email failed:", e?.message || e);
      }

      const { password: _pw, ...safeUser } = user;
      res.status(201).json({ org, user: safeUser, subscription, emailSent });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("[admin:create-org] error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/organizations/:id", requireAuth, requireSuperAdmin(), async (req: Request, res: Response) => {
    try {
      const orgId = parseInt(req.params.id);
      const { suspended } = req.body;
      if (typeof suspended !== "boolean") {
        return res.status(400).json({ message: "suspended must be a boolean" });
      }
      const org = await storage.updateOrganization(orgId, { suspended });
      if (suspended) {
        const suspendMembers = await storage.getOrganizationMembers(orgId);
        for (const member of suspendMembers) {
          sendAccountSuspendedEmail({
            toEmail: member.user.email,
            fullName: member.user.fullName,
          }).catch((e) => console.warn("[email] Account suspended email failed:", e.message));
        }
      }
      res.json(org);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/users/:id/role-override", requireAuth, requireSuperAdmin(), async (req: Request, res: Response) => {
    try {
      const actorId = req.session.userId!;
      const targetUserId = parseInt(req.params.id);
      const { roleId, organizationId } = req.body;
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      const member = await storage.getOrganizationMember(targetUserId, organizationId);
      if (!member) {
        return res.status(404).json({ message: "Member not found in that organization" });
      }
      const previousRoleId = member.roleId;
      await storage.updateOrganizationMember(member.id, { roleId });
      await storage.createAuditLog({
        organizationId,
        userId: actorId,
        targetUserId,
        action: "super_admin_role_override",
        previousValue: { roleId: previousRoleId },
        newValue: { roleId },
      });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/login", async (req: Request, res: Response) => {
    try {
      const data = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(data.email);
      if (!user || !user.password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const valid = await bcrypt.compare(data.password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      if (user.systemRole !== "super_admin") {
        return res.status(403).json({ message: "Access denied. Super admin credentials required." });
      }
      req.session.userId = user.id;
      await new Promise<void>((resolve, reject) => req.session.save((err) => err ? reject(err) : resolve()));
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0]?.message || "Invalid input" });
      }
      console.error("Admin login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/admin/me", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || user.systemRole !== "super_admin") {
      return res.status(403).json({ message: "Not a super admin" });
    }
    const { password, ...safeUser } = user;
    res.json(safeUser);
  });

  app.get("/api/admin/dashboard-stats", requireAuth, requireSuperAdmin(), async (req: Request, res: Response) => {
    try {
      const stats = await storage.getAdminDashboardStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/users", requireAuth, requireSuperAdmin(), async (req: Request, res: Response) => {
    try {
      const allUsers = await storage.getAllUsersForAdmin();
      const safeUsers = allUsers.map(({ password, ...rest }) => rest);
      res.json(safeUsers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/users/:id/block", requireAuth, requireSuperAdmin(), async (req: Request, res: Response) => {
    try {
      const targetUserId = parseInt(req.params.id);
      const { blocked } = req.body;
      if (typeof blocked !== "boolean") {
        return res.status(400).json({ message: "blocked must be a boolean" });
      }
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      if (targetUser.systemRole === "super_admin") {
        return res.status(403).json({ message: "Cannot block a super admin" });
      }
      const updated = await storage.updateUser(targetUserId, { blocked });
      const { password, ...safeUser } = updated;
      res.json(safeUser);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/users/:id", requireAuth, requireSuperAdmin(), async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const detail = await storage.getAdminUserDetail(userId);
      if (!detail) return res.status(404).json({ message: "User not found" });
      res.json(detail);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/users/:id/mark-onboarding", requireAuth, requireSuperAdmin(), async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const { onboardingCompleted } = req.body;
      const updated = await storage.updateUser(userId, { onboardingCompleted: !!onboardingCompleted });
      const { password: _pwd, ...safe } = updated;
      res.json(safe);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });


  app.get("/api/admin/organizations-details", requireAuth, requireSuperAdmin(), async (req: Request, res: Response) => {
    try {
      const orgs = await storage.getOrganizationsWithDetails();
      res.json(orgs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });



  app.delete("/api/admin/organizations/:id", requireAuth, requireSuperAdmin(), async (req: Request, res: Response) => {
    try {
      const orgId = parseInt(req.params.id);
      const org = await storage.getOrganizationById(orgId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      await storage.deleteOrganization(orgId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Admin user management ──────────────────────────────────────────────────
  app.post("/api/admin/users/:id/verify-email", requireAuth, requireSuperAdmin(), async (req: Request, res: Response) => {
    try {
      await storage.verifyUserEmail(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/users/:id/deactivate", requireAuth, requireSuperAdmin(), async (req: Request, res: Response) => {
    try {
      await storage.deactivateUser(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/users/:id/restore", requireAuth, requireSuperAdmin(), async (req: Request, res: Response) => {
    try {
      await storage.restoreUser(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Admin email tools ──────────────────────────────────────────────────────
  app.post("/api/admin/email/password-reset", requireAuth, requireSuperAdmin(), async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email is required" });
      }
      const user = await storage.getUserByEmail(email.trim());
      if (!user) return res.status(404).json({ message: "User not found" });
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await storage.createOtp({ email: user.email, code, expiresAt });
      const { sendPasswordResetOtpEmail } = await import("./email");
      await sendPasswordResetOtpEmail({ toEmail: user.email, fullName: user.fullName, otp: code });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/email/send-verification", requireAuth, requireSuperAdmin(), async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email is required" });
      }
      const user = await storage.getUserByEmail(email.trim());
      if (!user) return res.status(404).json({ message: "User not found" });
      const token = `verify_${crypto.randomBytes(24).toString("hex")}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await storage.createOtp({ email: user.email, code: token, expiresAt });
      const { sendVerificationEmail } = await import("./email");
      await sendVerificationEmail({ toEmail: user.email, fullName: user.fullName, token });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Social platform routes ─────────────────────────────────────────────────
  registerFacebookRoutes(app);
  registerInstagramRoutes(app);
  registerLinkedInRoutes(app);
  registerXRoutes(app);

  return httpServer;
}

