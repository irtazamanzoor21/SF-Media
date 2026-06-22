# Data Model

Reference for every table, relation, Zod schema, and constant defined in [shared/schema.ts](../shared/schema.ts). The schema file is the single source of truth — this doc is a navigable mirror.

The DB is **PostgreSQL 16**, accessed via **Drizzle ORM**. Schema is reconciled on every server boot via `drizzle-kit push --force` (see [ARCHITECTURE.md](./ARCHITECTURE.md#schema-sync-on-boot)).

---

## Entity overview

```
                   ┌──────────────┐
                   │organizations │
                   └──────┬───────┘
                          │ 1
        ┌─────────────────┼──────────────────┬─────────────┬─────────────────────┐
        │ *               │ *                │ *           │ 1                   │ *
   ┌────▼─────┐   ┌───────▼────────┐  ┌──────▼─────┐ ┌─────▼──────┐  ┌───────────▼──────────────┐
   │  users   │   │organization_   │  │   roles    │ │brand_      │  │organization_subscriptions│
   │          │   │members         │  │            │ │profiles    │  └──────────────────────────┘
   └──┬───────┘   └──┬─────────────┘  └────┬───────┘ └────────────┘
      │ 1            │ *                   │ *
      │              │                     │
      │              │             ┌───────▼──────────┐
      │              │             │role_permissions  │
      │              │             └──────────────────┘
      │
      ├─* campaigns ─* campaign_posts ─┬─* post_metrics
      │                                └─* post_metric_snapshots
      ├─* media_folders ─* media_files
      ├─* social_connections
      ├─* scheduled_social_posts
      └─1 brand_profile (also linked via organizations)
```

Multi-tenancy is enforced at the data layer: each user belongs to **exactly one** organization (unique constraint on `organization_members.user_id`).

---

## Identity & authentication

### `users`

Core account record. Drizzle export: `users`.

| Column | Type | Null | Default | FK |
|--------|------|------|---------|-----|
| `id` | integer | no | generated | (PK) |
| `fullName` | text | no | | |
| `email` | text | no | | unique |
| `password` | text | yes | | (null for OAuth-only) |
| `googleId` | text | yes | | |
| `profileImage` | text | yes | | |
| `organizationId` | integer | yes | | `organizations.id` ON DELETE SET NULL |
| `onboardingCompleted` | boolean | no | false | |
| `onboardingStep` | integer | no | 0 | |
| `systemRole` | text | no | "creator" | enum: `super_admin`, `admin`, `creator` |
| `blocked` | boolean | no | false | |
| `mustChangePassword` | boolean | no | false | (set when admin resets password) |
| `invitationToken` | text | yes | | unique |
| `invitationExpiresAt` | timestamp | yes | | |
| `tier` | text | no | "trial" | enum: `trial`, `founder`, `professional`, `enterprise` |
| `tierAssignedAt` | timestamp | yes | | |
| `accountStatus` | text | no | "active" | enum: `active`, `expired`, `suspended`, `canceled`, `deleted` |
| `trialExpiresAt` | timestamp | yes | | |
| `billingCustomerRef` | text | yes | | (Stripe customer id mirror) |
| `trialResetHistory` | jsonb | no | `[]` | |
| `emailVerifiedAt` | timestamp | yes | | |
| `createdAt` | timestamp | yes | now() | |
| `deletedAt` | timestamp | yes | | (soft delete) |

**Indexes**: `users_organization_id_idx` on `organizationId`.

**Relations**: `organization` (one), `brandProfile` (one), `campaigns` (many), `organizationMemberships` (many).

### `otpCodes`

One-time codes for email verification, password reset, and Google account linking.

| Column | Type | Null | Default |
|--------|------|------|---------|
| `id` | integer | no | generated |
| `email` | text | no | |
| `code` | text | no | |
| `expiresAt` | timestamp | no | |
| `used` | boolean | no | false |

### `session`

Bootstrapped at startup (see `ensureSessionTableExists` in [server/db.ts](../server/db.ts)) for `connect-pg-simple`. Standard 3-column shape (`sid`, `sess`, `expire`); not declared in `shared/schema.ts`.

---

## Organizations & RBAC

### `organizations`

Top-level tenant. Drizzle export: `organizations`.

| Column | Type | Null | Default |
|--------|------|------|---------|
| `id` | integer | no | generated |
| `name` | text | no | |
| `slug` | text | no | unique |
| `suspended` | boolean | no | false |
| `accountStatus` | text | no | "active" |
| `tier` | text | no | "trial" |
| `tierAssignedAt` | timestamp | yes | |
| `trialExpiresAt` | timestamp | yes | |
| `billingCustomerId` | text | yes | (Stripe customer id) |
| `trialResetHistory` | jsonb | no | `[]` |
| `trialEmailsSent` | jsonb | no | `[]` (which trial-period emails have been sent) |
| `createdAt` | timestamp | no | now() |
| `deletedAt` | timestamp | yes | (soft delete) |

**Relations**: members, roles, auditLogs, brandProfiles, campaigns (all many).

### `organizationMembers`

Maps users to organizations with role assignment.

| Column | Type | Null | Default | FK |
|--------|------|------|---------|-----|
| `id` | integer | no | generated | |
| `userId` | integer | no | | `users.id` ON DELETE CASCADE |
| `organizationId` | integer | no | | `organizations.id` ON DELETE CASCADE |
| `roleId` | integer | yes | | `roles.id` ON DELETE SET NULL |
| `systemRole` | text | no | "creator" | |
| `joinedAt` | timestamp | no | now() | |
| `isBlocked` | boolean | no | false | |

**Unique constraint**: `organization_members_user_id_unique` on `userId` — enforces one org per user.

### `roles`

Custom role definitions per organization.

| Column | Type | Null | Default | FK |
|--------|------|------|---------|-----|
| `id` | integer | no | generated | |
| `organizationId` | integer | no | | `organizations.id` ON DELETE CASCADE |
| `name` | text | no | | |
| `description` | text | yes | | |
| `isDefault` | boolean | no | false | (auto-assigned to new members) |
| `isProtected` | boolean | no | false | (cannot be deleted) |
| `createdAt` | timestamp | no | now() | |

The "Standard Creator" role (auto-created per org, isProtected=true) covers the default member.

### `rolePermissions`

Granular permission grants per role.

| Column | Type | Null | Default | FK |
|--------|------|------|---------|-----|
| `id` | integer | no | generated | |
| `roleId` | integer | no | | `roles.id` ON DELETE CASCADE |
| `module` | text | no | | enum: see MODULES constant |
| `action` | text | no | | enum: see ACTIONS constant |
| `granted` | boolean | no | true | |

### `roleAuditLogs`

Audit trail for role/permission changes.

| Column | Type | Null | Default | FK |
|--------|------|------|---------|-----|
| `id` | integer | no | generated | |
| `organizationId` | integer | no | | `organizations.id` ON DELETE CASCADE |
| `userId` | integer | no | | `users.id` ON DELETE CASCADE (actor) |
| `targetUserId` | integer | yes | | `users.id` ON DELETE SET NULL |
| `action` | text | no | | (e.g. `role.created`, `member.role_changed`) |
| `previousValue` | jsonb | yes | | |
| `newValue` | jsonb | yes | | |
| `createdAt` | timestamp | no | now() | |

---

## Brand configuration

### `brandProfiles`

One per organization (enforced by unique conditional index). Stores all AI-extracted brand voice attributes.

| Column | Type | Null | Default | FK |
|--------|------|------|---------|-----|
| `id` | integer | no | generated | |
| `userId` | integer | no | | `users.id` ON DELETE CASCADE (creator) |
| `organizationId` | integer | yes | | `organizations.id` ON DELETE SET NULL |
| `companyName` | text | no | | |
| `industry` | text | no | | |
| `websiteUrl` | text | yes | | (used by market-intelligence prefill) |
| `brandSummary` | text | yes | | (AI-generated) |
| `targetAudience` | text | yes | | (AI-generated) |
| `messagingPillars` | text[] | yes | | (3–5 themes, AI-generated, editable) |
| `toneStyle` | text | yes | | (e.g. "energetic, warm, expert") |
| `doLanguageRules` | text[] | yes | | |
| `dontLanguageRules` | text[] | yes | | |
| `ctaPreferences` | text[] | yes | | (preferred CTA *styles*, fed to AI prompt) |
| `customCtas` | text[] | yes | | (concrete CTA labels for the campaign-creation dropdown) |
| `hashtagThemes` | text[] | yes | | |
| `rawBrandVoiceJson` | jsonb | yes | | (full AI analysis output for re-use) |
| `sampleLinkedinPost` | text | yes | | |
| `sampleInstagramPost` | text | yes | | |

**Unique constraint**: `brand_profiles_organization_id_unique` (where `organization_id IS NOT NULL`) — one brand profile per org.

> **`ctaPreferences` vs `customCtas`** — they are deliberately separate fields. `ctaPreferences` is freeform "preferred CTA styles" guidance fed into the AI brand-voice prompt at generation time. `customCtas` is the concrete list of CTA labels the user wants to see in the campaign-creation dropdown.

---

## Campaigns & posts

### `campaigns`

Top-level campaign container. Each campaign has many posts.

| Column | Type | Null | Default | FK |
|--------|------|------|---------|-----|
| `id` | integer | no | generated | |
| `userId` | integer | no | | `users.id` ON DELETE CASCADE |
| `organizationId` | integer | yes | | `organizations.id` ON DELETE SET NULL |
| `companyName` | text | no | | (snapshotted from brand profile at generation time) |
| `description` | text | no | | (the brief) |
| `platforms` | text[] | no | | subset of `["linkedin","x","instagram","facebook"]` |
| `tone` | text | no | | enum: see TONES constant |
| `postsCount` | integer | no | | (1–5) |
| `callToAction` | text | no | | (free-form text up to 80 chars) |
| `scheduledAt` | timestamp | yes | | |
| `startDate` | timestamp | yes | | |
| `endDate` | timestamp | yes | | |
| `status` | text | no | "draft" | enum: `draft`, `scheduled`, `published` |
| `createdAt` | timestamp | no | now() | |

**Indexes**: `campaigns_organization_id_idx` on `organizationId`.

### `campaignPosts`

Individual social media post. Generated by AI; editable by user.

| Column | Type | Null | Default | FK |
|--------|------|------|---------|-----|
| `id` | integer | no | generated | |
| `campaignId` | integer | no | | `campaigns.id` ON DELETE CASCADE |
| `postIdentifier` | text | yes | | human-readable (e.g. `POST-001`) |
| `platform` | text | no | | enum: PLATFORMS |
| `content` | text | no | | |
| `imagePrompt` | text | yes | | (used to regenerate image) |
| `imageUrl` | text | yes | | (Cloudinary URL) |
| `imageUrls` | text[] | no | `[]` | (additional images for IG carousels) |
| `order` | integer | no | 0 | (display + scheduling order) |
| `scheduledAt` | timestamp | yes | | |
| `sources` | jsonb | yes | | `{ keywords: [...], domains: [...] }` from market intel |
| `platformPostId` | text | yes | | (the live tweet/FB post id after publish) |
| `platformPostUrl` | text | yes | | (link to the live post) |

---

## Metrics

### `postMetrics`

Aggregate (latest) performance for a post. One row per post.

| Column | Type | Null | Default | FK |
|--------|------|------|---------|-----|
| `id` | integer | no | generated | |
| `postId` | integer | no | | `campaign_posts.id` ON DELETE CASCADE |
| `impressions` | integer | no | 0 | |
| `reach` | integer | no | 0 | |
| `likes` | integer | no | 0 | |
| `comments` | integer | no | 0 | |
| `shares` | integer | no | 0 | |
| `saves` | integer | no | 0 | |
| `clicks` | integer | no | 0 | |
| `uploadedAt` | timestamp | no | now() | |

### `postMetricSnapshots`

Time-series snapshots for trend charts. Created by background metric sync.

| Column | Type | Null | Default | FK |
|--------|------|------|---------|-----|
| `id` | integer | no | generated | |
| `postId` | integer | no | | `campaign_posts.id` ON DELETE CASCADE |
| `recordedAt` | timestamp | no | now() | |
| `likes`, `comments`, `shares`, `impressions`, `reach`, `saves`, `clicks` | integer | no | 0 | (same shape as `postMetrics`) |

---

## Media library

### `mediaFolders`

| Column | Type | Null | Default | FK |
|--------|------|------|---------|-----|
| `id` | integer | no | generated | |
| `userId` | integer | no | | `users.id` ON DELETE CASCADE |
| `name` | text | no | | |
| `color` | text | no | "#6366f1" | (hex) |
| `createdAt` | timestamp | no | now() | |

### `mediaFiles`

| Column | Type | Null | Default | FK |
|--------|------|------|---------|-----|
| `id` | integer | no | generated | |
| `userId` | integer | no | | `users.id` ON DELETE CASCADE |
| `folderId` | integer | yes | | `media_folders.id` ON DELETE CASCADE (null = root) |
| `name` | text | no | | |
| `url` | text | no | | (Cloudinary URL) |
| `size` | integer | no | 0 | (bytes) |
| `mimeType` | text | no | "image/png" | |
| `createdAt` | timestamp | no | now() | |

---

## Social publishing

### `socialConnections`

OAuth tokens and identifiers for all platforms. One row per (user, platform).

| Column | Type | Null | FK |
|--------|------|------|-----|
| `id` | integer | no | (PK) |
| `userId` | integer | no | `users.id` ON DELETE CASCADE |
| `platform` | text | no | enum: `facebook`, `instagram`, `linkedin`, `x` (default `facebook` for legacy reasons) |
| **Facebook fields** | | | |
| `userAccessToken` | text | yes | (long-lived user token) |
| `pageId` | text | yes | (selected Page) |
| `pageName` | text | yes | |
| `pageAccessToken` | text | yes | (Page-scoped token) |
| **Instagram fields** | | | |
| `igUserId` | text | yes | (IG Business Account id) |
| `igUsername` | text | yes | |
| **LinkedIn fields** | | | |
| `linkedinId` | text | yes | (person urn) |
| `linkedinName` | text | yes | |
| `linkedinOrganizationId` | text | yes | (optional, for posting as org) |
| `linkedinOrganizationName` | text | yes | |
| **X (Twitter) fields** | | | |
| `xId` | text | yes | (numeric user id) |
| `xUsername` | text | yes | |
| `xAccessToken` | text | yes | (OAuth 2.0) |
| `xRefreshToken` | text | yes | |
| `xTokenExpiresAt` | timestamp | yes | |
| `xOauth1Token` | text | yes | (legacy OAuth 1.0a) |
| `xOauth1TokenSecret` | text | yes | |
| **Common** | | | |
| `connectedAt` | timestamp | no | now() |

### `scheduledSocialPosts`

Posts queued for later publication. Mostly used for the Facebook flow today.

| Column | Type | Null | Default | FK |
|--------|------|------|---------|-----|
| `id` | integer | no | generated | |
| `userId` | integer | no | | `users.id` ON DELETE CASCADE |
| `campaignPostId` | integer | yes | | `campaign_posts.id` ON DELETE SET NULL |
| `platform` | text | no | "facebook" | |
| `pageId`, `pageName`, `pageAccessToken` | text | no/yes | | |
| `igUserId` | text | yes | | |
| `message` | text | no | | (the post content at scheduling time) |
| `imageUrl` | text | yes | | |
| `scheduledAt` | timestamp | no | | |
| `status` | text | no | "pending" | enum: `pending`, `sent`, `failed` |
| `sentAt` | timestamp | yes | | |
| `errorMessage` | text | yes | | |
| `createdAt` | timestamp | no | now() | |

---

## Subscriptions & billing

### `subscriptionPlans`

Plan catalog editable by super admin.

| Column | Type | Null | Default |
|--------|------|------|---------|
| `id` | integer | no | generated |
| `name` | text | no | |
| `monthlyPrice` | integer | no | (cents) |
| `annualPrice` | integer | no | (cents) |
| `stripeMonthlyPriceId` | text | yes | |
| `stripeAnnualPriceId` | text | yes | |
| `stripeProductId` | text | yes | |
| `isActive` | boolean | no | true |
| `createdAt`, `updatedAt` | timestamp | no | now() |

### `organizationSubscriptions`

Per-org subscription state. Mirrors Stripe; webhook keeps it in sync.

| Column | Type | Null | Default | FK |
|--------|------|------|---------|-----|
| `id` | integer | no | generated | |
| `organizationId` | integer | no | | `organizations.id` ON DELETE CASCADE |
| `planId` | integer | yes | | `subscription_plans.id` ON DELETE SET NULL |
| `stripeCustomerId` | text | yes | | |
| `stripeSubscriptionId` | text | yes | | |
| `billingCustomerId` | text | yes | | (mirror) |
| `status` | text | no | "trialing" | enum: `trialing`, `active`, `past_due`, `canceled`, `trial_expired` |
| `tier` | text | no | "trial" | |
| `tierAssignedAt` | timestamp | yes | | |
| `billingInterval` | text | yes | | enum: `monthly`, `annual` |
| `trialStartedAt` | timestamp | yes | | |
| `trialEndsAt` | timestamp | yes | | |
| `currentPeriodStart`, `currentPeriodEnd` | timestamp | yes | | |
| `canceledAt`, `gracePeriodEndsAt` | timestamp | yes | | |
| `trialResetHistory` | jsonb | no | `[]` | |
| `createdAt` | timestamp | no | now() | |

### `tierResetLogs`

Audit trail when a super admin resets a trial.

| Column | Type | Null | Default | FK |
|--------|------|------|---------|-----|
| `id` | integer | no | generated | |
| `organizationId` | integer | no | | `organizations.id` ON DELETE CASCADE |
| `adminId` | integer | no | | `users.id` ON DELETE CASCADE |
| `reason` | text | no | | |
| `previousExpiry` | timestamp | yes | | |
| `newExpiry` | timestamp | no | | |
| `usageReset` | boolean | no | false | (whether quota counters were also zeroed) |
| `createdAt` | timestamp | no | now() | |

---

## Quotas

### `orgQuotaEvents`

Append-only log of quota-consuming actions. Counts in the current period determine remaining quota.

| Column | Type | Null | Default | FK |
|--------|------|------|---------|-----|
| `id` | integer | no | generated | |
| `organizationId` | integer | no | | `organizations.id` ON DELETE CASCADE |
| `action` | text | no | | enum: see QUOTA_ACTIONS |
| `createdAt` | timestamp | no | now() | |

**Indexes**: `org_quota_events_org_action_idx` (org+action), `org_quota_events_created_at_idx`.

### `tierQuotaConfigs`

Per-tier limits. Editable by super admin (live, no deploy needed).

| Column | Type | Null | Default | FK |
|--------|------|------|---------|-----|
| `id` | serial | no | | |
| `tier` | text | no | | enum: TIER_TYPES |
| `resource` | text | no | | enum: QUOTA_ACTIONS |
| `limit` | integer | yes | | (null = unlimited) |
| `enabled` | boolean | no | true | |
| `updatedAt` | timestamp | no | now() | |
| `updatedBy` | integer | yes | | `users.id` |

**Unique constraint**: `tier_quota_configs_tier_resource_idx` on `(tier, resource)`.

Defaults seeded by `runStartupMigrations()` in [server/db.ts](../server/db.ts).

---

## Market intelligence

### `marketIntelligence`

Per-org keyword and competitor research, refreshed on demand from DataForSEO.

| Column | Type | Null | Default | FK |
|--------|------|------|---------|-----|
| `id` | integer | no | generated | |
| `organizationId` | integer | no | | `organizations.id` ON DELETE CASCADE |
| `status` | text | no | "pending" | enum: `pending`, `analyzing`, `ready`, `failed` |
| `targetDomain` | text | yes | | (domain analyzed; pre-filled from brand profile `websiteUrl`) |
| `seedKeywords` | text[] | no | `[]` | |
| `discoveredCompetitors` | jsonb | no | `[]` | (competitor domains + their shared keywords) |
| `keywordInsights` | jsonb | no | `[]` | (keyword, search volume, CPC, intent, difficulty) |
| `lastRefreshedAt` | timestamp | yes | | |
| `createdAt` | timestamp | no | now() | |

---

## Audit

### `adminAuditLogs`

System-wide audit trail for super-admin actions (user blocks, tier overrides, refunds, etc.).

| Column | Type | Null | Default | FK |
|--------|------|------|---------|-----|
| `id` | serial | no | | |
| `adminId` | integer | yes | | `users.id` |
| `action` | text | no | | (e.g. `user.blocked`, `org.tier_changed`) |
| `targetType` | text | no | | (e.g. `user`, `organization`) |
| `targetId` | integer | no | | |
| `details` | jsonb | yes | | |
| `createdAt` | timestamp | no | now() | |

---

## Relations (Drizzle)

The `relations()` declarations in `shared/schema.ts` enable Drizzle's `with: {}` query helpers. Important relations:

- `users` → `organization` (one), `brandProfile` (one), `campaigns` (many), `organizationMemberships` (many)
- `organizations` → `members`, `roles`, `auditLogs`, `brandProfiles`, `campaigns` (all many)
- `organizationMembers` → `user` (one), `organization` (one), `role` (one)
- `roles` → `organization` (one), `permissions` (many), `members` (many)
- `brandProfiles` → `user` (one), `organization` (one)
- `campaigns` → `user` (one), `organization` (one), `posts` (many)
- `campaignPosts` → `campaign` (one), `metrics` (many), `snapshots` (many)
- `mediaFolders` → `user` (one), `files` (many)
- `mediaFiles` → `user` (one), `folder` (one)
- `socialConnections` → `user` (one)
- `scheduledSocialPosts` → `user` (one), `campaignPost` (one)
- `subscriptionPlans` → `subscriptions` (many)
- `organizationSubscriptions` → `organization` (one), `plan` (one)
- `tierResetLogs` → `organization` (one), `admin` (one)
- `marketIntelligence` → `organization` (one)

---

## Zod schemas

Exported from `shared/schema.ts`. Used by both client (form validation) and server (request validation).

### Auth

- `loginSchema` — `{ email: string, password: string (min 6) }`
- `registerSchema` — `{ fullName: string (min 2), email: string, password: string (min 6) }`

### Organization & RBAC

- `createOrganizationSchema` — `{ name: string (min 1, max 100) }`
- `createRoleSchema` — `{ name, description?, permissions: [{ module, action, granted }] }`
- `updateRoleSchema` — all fields optional
- `assignRoleSchema` — `{ roleId: number | null }`
- `inviteMemberSchema` — `{ email, systemRole: "admin" | "creator", roleId?: number }`

### Brand & campaigns

- `companyInfoSchema` — `{ companyName, industry }`
- `brandProfileUpdateSchema` — all fields optional: `brandSummary, targetAudience, messagingPillars, toneStyle, doLanguageRules, dontLanguageRules, ctaPreferences, customCtas (each max 80), hashtagThemes`
- `createCampaignSchema` — `{ companyName, description, platforms, tone, postsCount (1–5), callToAction (max 80), scheduledAt?, startDate?, endDate? }`

### Drizzle-generated

- `insertUserSchema`, `insertOtpSchema`, `insertBrandProfileSchema`, `insertCampaignSchema`, `insertCampaignPostSchema`, `insertPostMetricsSchema`, `insertPostMetricSnapshotSchema`, `insertMediaFolderSchema`, `insertMediaFileSchema`, `insertOrganizationSchema`, `insertOrganizationMemberSchema`, `insertRoleSchema`, `insertRolePermissionSchema`, `insertRoleAuditLogSchema`, `insertSocialConnectionSchema`, `insertScheduledSocialPostSchema`, `insertSubscriptionPlanSchema`, `insertOrganizationSubscriptionSchema`, `insertTierResetLogSchema`, `insertMarketIntelligenceSchema`

---

## Constants

All exported from `shared/schema.ts`.

### Modules & permissions

```ts
MODULES   = ["CAMPAIGN", "CALENDAR", "BRAND_VOICE", "MEDIA_LIBRARY", "TEAM_MANAGEMENT", "BILLING", "ANALYTICS"]
ACTIONS   = ["view", "customize"]
SYSTEM_ROLES = ["super_admin", "admin", "creator"]
DEFAULT_CREATOR_PERMISSIONS = {
  CAMPAIGN: ["view", "customize"],
  CALENDAR: ["view", "customize"],
  BRAND_VOICE: ["view"],
  MEDIA_LIBRARY: ["view", "customize"]
}
```

### Account & tier

```ts
ACCOUNT_STATUSES = ["active", "expired", "suspended", "canceled", "deleted"]
TIER_TYPES       = ["trial", "founder", "professional", "enterprise"]
QUOTA_ACTIONS    = ["campaign", "ai_image", "scheduled_post", "social_connection", "seat", "company"]
```

### Content

```ts
PLATFORMS    = ["linkedin", "x", "instagram", "facebook"]
TONES        = ["professional", "casual", "energetic", "friendly", "witty"]
DEFAULT_CTAS = ["Learn More", "Shop Now", "Signup", "Get Started", "Contact Us", "Download Now"]
CTAS         = DEFAULT_CTAS  // back-compat alias
```

### Per-platform settings

```ts
PLATFORM_SETTINGS = {
  linkedin:  { characterLimit: 3000,  hashtagLimit: 5,  imageWidth: 1200, imageHeight: 627  },
  x:         { characterLimit: 280,   hashtagLimit: 3,  imageWidth: 1200, imageHeight: 675  },
  instagram: { characterLimit: 2200,  hashtagLimit: 30, imageWidth: 1080, imageHeight: 1080 },
  facebook:  { characterLimit: 63206, hashtagLimit: 5,  imageWidth: 1200, imageHeight: 630  },
}
```

(Each entry also has `recommendedLength`, `hashtagTip`, `imageAspectRatio`, `imageLabel`.)

### Industries

`INDUSTRIES` — 19 categories used by the onboarding industry selector and the AI prompt's tone calibration. See [BUSINESS.md](./BUSINESS.md#supported-industries).

### Helpers

- `buildCtaOptions(customCtas)` — merges DEFAULT_CTAS with the org's custom CTAs (case-insensitive dedupe). Returns `{ defaults, customs, all }`. Used by the campaign-creation dropdown.

---

## Migration history

The `migrations/` folder is **gitignored** — these SQL files are documentary only. Production schema sync runs via `drizzle-kit push --force` on startup.

| File | Summary |
|------|---------|
| 0001_add_keyword_insights.sql | Add `keyword_insights` jsonb column to `market_intelligence` |
| 0002_add_x_social_connection_columns.sql | Add X-specific columns to `social_connections` |
| 0003_add_platform_post_metrics.sql | Add `platform_post_id` and `platform_post_url` to `campaign_posts` |
| 0004_tier_model_14day_trial.sql | Tier system: tier/account_status fields on users, orgs, subscriptions; create `tier_reset_logs` |
| 0005_quota_events.sql | Create `org_quota_events` and indexes |
| 0006_member_block.sql | Add `is_blocked` to `organization_members` |
| 0007_must_change_password.sql | Add `must_change_password` to `users` |
| 0008_one_organization_per_user.sql | Unique constraint on `organization_members.user_id` + backfill `users.organization_id` |
| 0009_org_scoped_brand_campaigns.sql | Add `organization_id` to `brand_profiles` and `campaigns` with FKs and indexes |
| 0010_add_custom_ctas.sql | Add `custom_ctas text[]` to `brand_profiles` |

### Startup migrations

In addition to drizzle-push, [server/db.ts](../server/db.ts) `runStartupMigrations()` ensures (idempotently):

- `market_intelligence.target_domain` exists
- `brand_profiles.website_url` exists
- `users.email_verified_at` exists
- `org_quota_events`, `tier_quota_configs`, `admin_audit_logs` tables exist
- `organizations.deleted_at`, `users.deleted_at` columns exist
- `organizations.trial_emails_sent` initialized to `[]`
- `users.must_change_password` boolean exists
- FK constraints for org-scoped data (brand_profiles, campaigns, users → organizations)
- Unique index on `organization_members(user_id)`
- Default `tier_quota_configs` rows seeded for each tier × resource
