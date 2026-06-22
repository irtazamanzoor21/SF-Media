# SF Media — Business Overview

This document is for non-engineering readers (founders, sales, PMs, investors, new hires). It explains what the product does, who it serves, how it makes money, and what makes it differentiated.

---

## What is SF Media?

SF Media is a SaaS platform that lets a marketing team or agency turn a single campaign brief into a full set of platform-optimized social media posts — and then publish, schedule, and track them — all from one workspace.

Instead of writing four versions of the same post (one for LinkedIn, one for X, one for Instagram, one for Facebook) and resizing the image four times, the user describes the campaign once. SF Media generates everything — the captions in the right tone for each platform, the images at the right dimensions, the hashtags within each platform's conventions — and queues them for publishing.

The differentiator is **brand voice persistence**. SF Media analyzes the user's existing brand materials (pitch deck, website, marketing copy) once during onboarding, builds a structured brand profile, and feeds that profile into every future post-generation prompt. The output sounds like *that brand*, not like generic AI copy.

---

## Target users

| Audience | Primary use case |
|----------|------------------|
| **Marketing teams at SMBs** | Run weekly content cadence across 4 platforms without hiring a junior copywriter or contracting it out. |
| **Social media managers** | Manage 3–10 brands or product lines, each with its own voice and audience. |
| **Agencies** | Onboard new client brands quickly, demonstrate repeatable output, and scale content delivery without scaling headcount linearly. |
| **Content creators / solopreneurs** | Maintain consistent presence on multiple platforms while focusing on the actual business. |
| **Founders and growth marketers** | Test campaign ideas (via the AI brainstorm feature) before committing copywriter time. |

---

## Value proposition

A social media strategist's job has three repetitive sub-tasks: (1) interpret the brand voice, (2) produce platform-appropriate copy and imagery at scale, (3) keep a publishing rhythm going.

SF Media automates all three:

1. **Brand voice once, applied forever.** The AI extracts tone, messaging pillars, do/don't language rules, preferred CTAs, and hashtag themes from uploaded materials. Every subsequent generation respects those rules.
2. **Platform-aware generation.** A single brief produces 4 platform-tailored posts. Character limits, hashtag conventions (3 on X, 8–15 on Instagram), image aspect ratios (1080×1080 for IG, 1200×627 for LinkedIn), and recommended length all enforced automatically.
3. **From draft to live in one place.** Posts can be edited, scheduled to a date/time, or published immediately to connected social accounts (LinkedIn, X, Facebook Page, Instagram Business). Engagement metrics flow back in for analytics.

---

## Supported platforms

SF Media produces and publishes to these social networks:

| Platform | Character limit | Image dimensions | Recommended length | Hashtag norm | Auth |
|----------|-----------------|------------------|--------------------|--------------|------|
| **LinkedIn** | 3,000 | 1200 × 627 (landscape) | 100–200 words | 3–5 industry-relevant | LinkedIn OAuth 2.0 — post as person or organization |
| **X (Twitter)** | 280 | 1200 × 675 (16:9) | Under 280 chars | 1–3 integrated into text | OAuth 2.0 + PKCE (legacy OAuth 1.0a available) |
| **Instagram** | 2,200 | 1080 × 1080 (square) | 50–150 words | 8–15 at end of caption | Business Account via Facebook OAuth |
| **Facebook** | 63,206 | 1200 × 630 (landscape) | 100–250 words | 2–3 natural | Facebook Page OAuth (Pages selected after grant) |

Constants live in [`PLATFORM_SETTINGS`](../shared/schema.ts) — a single import drives both UI labels and the AI prompt's platform rules.

---

## Supported industries

The brand voice analyzer is tuned to recognize patterns across these industry verticals (drives the AI's tone calibration during brand-profile generation):

Technology · Healthcare · Finance & Banking · E-commerce & Retail · Education · Real Estate · Marketing & Advertising · Food & Beverage · Travel & Hospitality · Fashion & Beauty · Sports & Fitness · Entertainment & Media · Non-Profit · Legal · Consulting · Manufacturing · Automotive · Energy & Utilities · Agriculture · Other.

---

## Feature highlights

A feature-by-feature reference is in [FEATURES.md](./FEATURES.md). At a glance:

| Capability | Description |
|------------|-------------|
| **AI brand voice analysis** | Upload PDFs/DOCX/website URL → AI extracts brand summary, target audience, messaging pillars, tone, do/don't language rules, CTA preferences, hashtag themes, and writes sample LinkedIn + Instagram posts to validate the read. |
| **AI campaign generation** | Single brief → posts for all selected platforms, in selected tone, with platform-appropriate length and hashtags. Generation is streamed so the user sees posts appear one at a time. |
| **Custom CTAs** | Each organization can define its own call-to-action labels alongside the six built-ins — brand-specific phrases like "Book a Demo" or "Join Waitlist" appear in the dropdown for the whole team. |
| **AI image generation** | Each post gets an AI-generated image at the right aspect ratio for its platform. Images stored in Cloudinary CDN. |
| **AI image editor** | Built-in editor with crop, rotate, filters, brightness/contrast/saturation, watermarks, plus AI ops: background removal, enhancement, style transfer (8 artistic styles), and prompt-based editing. |
| **Calendar** | Month/week/day view of scheduled posts across all campaigns, color-coded by campaign, with drag-and-drop rescheduling. |
| **Media library** | Folder organization with color labels. Direct upload + import from Google Drive, OneDrive, and Unsplash via Uppy Companion. AI image generation saves directly to the library. |
| **Live publishing & scheduling** | One-click publish to connected accounts, or schedule to a future datetime. Backend job publishes at the scheduled time. |
| **Engagement metrics** | CSV upload of historical metrics, plus live sync from Facebook/Instagram Graph API after Meta App Review approval. Per-post and per-campaign aggregates with engagement rate and CTR. |
| **AI learning loop** | When generating new posts, the system fetches the org's top 5 best-performing past posts (composite score: 50% engagement rate, 30% CTR, 20% save rate) and injects them into the prompt so output learns from successful patterns. |
| **Market intelligence** | DataForSEO-powered keyword and competitor discovery. Surfaces trending topics and competitor angles, which are injected into the campaign-generation prompt. |
| **Multi-tenant organizations** | Every brand profile and campaign is org-scoped. One account = one organization (enforced by unique constraint). |
| **RBAC with custom roles** | Admins define custom roles per organization with module-level permissions (CAMPAIGN, CALENDAR, BRAND_VOICE, MEDIA_LIBRARY, TEAM_MANAGEMENT, BILLING, ANALYTICS) × actions (view, customize). Default "Standard Creator" role auto-created. Audit log records every permission change. |
| **Team invites** | Admins invite teammates by email; the invitee sets their password, joins the org, and immediately gets the assigned role. |
| **Subscription billing** | Stripe-managed subscriptions with monthly + annual pricing. Trial → Professional → Enterprise tiers. Customer portal for self-serve plan changes. |
| **Super admin panel** | Internal-only console for platform-wide stats, user/org management, manual tier overrides, trial resets, refunds, and plan price editing. |
| **Dark mode** | Full dark/light theme support with localStorage persistence. |

---

## Pricing & tiers

The tier system is defined in [shared/schema.ts](../shared/schema.ts) (`TIER_TYPES`). Four tiers exist; quotas are configured in the `tier_quota_configs` table and editable by super admin via [admin-panel-page.tsx](../client/src/pages/admin-panel-page.tsx).

| Tier | Pricing | Audience | Notable limits |
|------|---------|----------|----------------|
| **Trial** | Free, 14 days | New signups | Limited monthly AI posts; no scheduling; 1 company; 1 seat |
| **Professional** | Paid (Stripe-managed; default ~$10/mo or $100/yr per super admin config) | Individual marketers, small teams | Higher monthly AI posts; scheduling enabled; 1 company; 1 seat |
| **Enterprise** | Paid (configurable) | Agencies, multi-brand orgs | Multiple companies; multiple seats; full scheduling |
| **Founder** | Special grant | Internal / strategic accounts | Unlimited AI posts, scheduling, companies, and seats — bypasses all gates |

> **Live prices**: pricing values are stored in the `subscription_plans` table and can be edited live by super admins without a deploy. The platform syncs price changes to Stripe's product/price IDs.

### Quota actions tracked

The `org_quota_events` table logs every quota-consuming action. Tracked actions:

- `campaign` — creating a new campaign
- `ai_image` — AI-generated image (post image regen, media library generation)
- `scheduled_post` — scheduling a post to publish later
- `social_connection` — connecting a new social account
- `seat` — adding a teammate
- `company` — adding a company / brand profile

Limits per `(tier, resource)` pair are stored in `tier_quota_configs`. Quota-aware UI elements (`use-quota.ts` hook) gate buttons and show "upgrade" CTAs when limits are reached.

---

## Lifecycle states

| State | Meaning |
|-------|---------|
| `trial` (account_status: `active`) | Within 14-day trial window, full or limited access depending on quota config |
| `trial_expired` | 14-day trial elapsed without upgrade — user redirected to `/subscribe` |
| `active` (paid) | Stripe subscription is active and current_period_end is in the future |
| `past_due` | Stripe charge failed — banner shown, grace period before suspension |
| `canceled` | User canceled via portal or admin action — access removed at period end |
| `suspended` | Admin suspended (manual action) — login allowed but app gates redirect to `/suspended` |
| `deleted` | Soft-delete via `deleted_at` timestamp on org/user |

Defined in `ACCOUNT_STATUSES` and `TIER_TYPES` constants in [shared/schema.ts](../shared/schema.ts).

---

## Key user journeys

Detailed walkthroughs (with the pages and APIs each step touches) are in [FEATURES.md](./FEATURES.md). The headline journeys:

1. **Signup → first published post**: Landing → auth → onboarding (5 steps, brand analysis) → trial welcome → dashboard → create campaign → connect social → publish.
2. **Inviting a teammate**: Admin sends invite → teammate clicks email link → sets password → joins org with assigned role.
3. **Connecting & publishing**: User OAuths into LinkedIn/X/Facebook/Instagram → selects target page (FB) or account → publishes or schedules from any campaign.
4. **Subscription upgrade**: Trial expires or user clicks Upgrade → `/subscribe` pricing page → Stripe checkout → webhook updates tier → new quotas apply.
5. **Super admin operations**: Internal console for creating orgs, resetting trials, adjusting tiers, refunding, and editing plan prices.
6. **Tracking metrics**: CSV upload of historical data or live sync via Meta Graph API → per-post and per-campaign aggregates with engagement rate and CTR.

---

## Compliance & legal

| Item | Status |
|------|--------|
| **Privacy Policy** | Public page at `/privacy-policy` (must remain public for Meta App Review). |
| **Terms of Service** | Public page at `/terms-of-service`. |
| **GDPR** | Soft-delete via `deleted_at` columns on users and organizations; super admin can permanently purge via admin panel. Data deletion request URL must remain public for Meta App Review. |
| **Meta App Review** | Submission notes for Facebook/Instagram permissions (`pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `business_management`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`) are kept in [APP_REVIEW_NOTES.md](../APP_REVIEW_NOTES.md). Until approved, the Facebook/Instagram integration is in Development Mode and only app-role users can authenticate. |
| **Email deliverability** | SendGrid SMTP. `SENDGRID_FROM_EMAIL` defaults to `hello@sfmedia.com`. |
| **Stripe compliance** | Stripe handles PCI; SF Media never sees card data. Customer Portal for self-serve refunds/cancels. |
| **Authentication** | Passwords hashed with bcrypt (cost 10). Session cookies are HttpOnly + Secure + SameSite=lax in production. Super admins use a separate session. |
| **Data residency** | PostgreSQL hosted via the team's own provider (`DATABASE_URL` defines location). Cloudinary serves images globally via CDN. |

---

## Differentiation & positioning

| Common alternative | What SF Media does differently |
|--------------------|-----------------------------------|
| **Buffer / Hootsuite / Agorapulse** | Those tools schedule existing posts. SF Media *generates* the posts in the brand's voice, then schedules them. Single-tool workflow for ideation → publish. |
| **ChatGPT / generic AI writers** | They produce one-off copy with no brand memory. SF Media extracts the brand profile once and applies it to every future post automatically. |
| **In-house copywriter** | Slow, expensive, limited platform expertise. SF Media is instant, scales linearly with quota, and bakes platform-specific best practices into every output. |
| **Canva for design + a separate tool for copy** | Disconnected. SF Media produces image + copy together, both tuned to the same campaign brief. |

The bet: marketers will pay to *not* think about platform conventions, brand consistency, and idea generation, and to keep all that work in a single workspace with their team.
