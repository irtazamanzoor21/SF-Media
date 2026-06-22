# Features & User Flows

This doc inventories every page in the app, walks through the major end-to-end user journeys, and references the reusable components and hooks that make those flows work.

For business framing of each feature, see [BUSINESS.md](./BUSINESS.md). For the underlying API endpoints, see [API.md](./API.md).

---

## Page inventory

29 pages, all in `client/src/pages/`. Routes are declared in [client/src/App.tsx](../client/src/App.tsx) using **wouter**.

### Public

| File | Route | Purpose |
|------|-------|---------|
| [home-page.tsx](../client/src/pages/home-page.tsx) | `/home` | Marketing landing — hero, feature cards, CTA |
| [auth-page.tsx](../client/src/pages/auth-page.tsx) | `/auth` | Login + signup (toggle), Google OAuth, password-reset link |
| [forgot-password-page.tsx](../client/src/pages/forgot-password-page.tsx) | `/forgot-password` | Email input → triggers OTP send |
| [reset-password-page.tsx](../client/src/pages/reset-password-page.tsx) | `/reset-password` | Set new password using emailed reset token |
| [verify-email-page.tsx](../client/src/pages/verify-email-page.tsx) | `/verify-email` | Email verification |
| [accept-invite-page.tsx](../client/src/pages/accept-invite-page.tsx) | `/accept-invite` | Token-gated; invitee sets name + password to join an org |
| [privacy-policy-page.tsx](../client/src/pages/privacy-policy-page.tsx) | `/privacy-policy` | Static — required for Meta App Review |
| [terms-of-service-page.tsx](../client/src/pages/terms-of-service-page.tsx) | `/terms-of-service` | Static |
| [not-found.tsx](../client/src/pages/not-found.tsx) | `*` | 404 fallback |

### Onboarding & post-signup gates

| File | Route | Purpose |
|------|-------|---------|
| [onboarding-page.tsx](../client/src/pages/onboarding-page.tsx) | `/onboarding` | 5-step brand voice analysis with file upload, URL ingest, AI analysis, profile review |
| [trial-welcome-page.tsx](../client/src/pages/trial-welcome-page.tsx) | `/trial-welcome` | Post-onboarding interstitial showing trial countdown + features |
| [setup-page.tsx](../client/src/pages/setup-page.tsx) | `/setup` | One-time super-admin bootstrap (token-gated) |
| [change-password-page.tsx](../client/src/pages/change-password-page.tsx) | `/change-password` | Forced when `users.mustChangePassword === true` |
| [suspended-page.tsx](../client/src/pages/suspended-page.tsx) | `/suspended` | Blocks UI when org is suspended; shows contact-support CTA |

### Dashboard core

| File | Route | Purpose |
|------|-------|---------|
| [dashboard-layout.tsx](../client/src/pages/dashboard-layout.tsx) | `/dashboard/*` | Layout shell — sidebar, header, theme toggle, global modals, banners |
| [dashboard-page.tsx](../client/src/pages/dashboard-page.tsx) | `/dashboard` | Campaign list overview + brainstorm + create-campaign CTAs |
| [brand-voice-page.tsx](../client/src/pages/brand-voice-page.tsx) | `/dashboard/brand-voice` | View/edit brand profile (summary, audience, tone, pillars, CTAs, hashtags, language rules, custom CTAs) |

### Campaigns

| File | Route | Purpose |
|------|-------|---------|
| [create-campaign-page.tsx](../client/src/pages/create-campaign-page.tsx) | `/dashboard/campaigns/new` | Multi-step campaign creation wizard with SSE-streamed AI generation |
| [campaign-detail-page.tsx](../client/src/pages/campaign-detail-page.tsx) | `/dashboard/campaigns/:id` | Posts list with edit, image carousel, schedule, publish, metrics, CSV export |

### Calendar & scheduling

| File | Route | Purpose |
|------|-------|---------|
| [calendar-page.tsx](../client/src/pages/calendar-page.tsx) | `/dashboard/calendar` | Month/week/day view of scheduled posts; drag-and-drop reschedule |
| [scheduled-posts-page.tsx](../client/src/pages/scheduled-posts-page.tsx) | `/dashboard/scheduled-posts` | List of Facebook native-scheduled posts with edit/delete |

### Media & assets

| File | Route | Purpose |
|------|-------|---------|
| [media-page.tsx](../client/src/pages/media-page.tsx) | `/dashboard/media` | Folder tree, file grid, Uppy uploader (Google Drive / OneDrive / Unsplash), AI image generation, image editor |

### Analytics & intelligence

| File | Route | Purpose |
|------|-------|---------|
| [market-intelligence-page.tsx](../client/src/pages/market-intelligence-page.tsx) | `/dashboard/market-intelligence` | DataForSEO keyword & competitor research; pre-fills domain from brand profile `websiteUrl` |

### Social integrations

| File | Route | Purpose |
|------|-------|---------|
| [social-accounts-page.tsx](../client/src/pages/social-accounts-page.tsx) | `/dashboard/social-accounts` | Connect/disconnect LinkedIn, Facebook/Instagram, X with page selector and post-as-org toggle |

### Team & permissions

| File | Route | Purpose |
|------|-------|---------|
| [roles-permissions-page.tsx](../client/src/pages/roles-permissions-page.tsx) | `/dashboard/roles` | Org members, custom role editor, permission matrix, audit log, invite management |

### Billing

| File | Route | Purpose |
|------|-------|---------|
| [billing-page.tsx](../client/src/pages/billing-page.tsx) | `/dashboard/billing` | Current tier, change plan, Stripe customer portal, invoices |
| [subscribe-page.tsx](../client/src/pages/subscribe-page.tsx) | `/subscribe` | Pricing comparison + Stripe checkout (shown on trial expiry) |
| [checkout-success-page.tsx](../client/src/pages/checkout-success-page.tsx) | `/checkout-success` | Confirmation after Stripe redirect; calls `verify-checkout` |

### Super admin

| File | Route | Purpose |
|------|-------|---------|
| [admin-panel-page.tsx](../client/src/pages/admin-panel-page.tsx) | `/admin-panel` | Stats, users, orgs, billing, plan management — super-admin only |

---

## End-to-end user journeys

### 1. New user signup → first published post

1. Visitor lands on `/home`, clicks **Get Started**.
2. **`/auth`** — signup form (full name, email, password) or Google OAuth. `POST /api/register` (or OAuth callback) creates the user with `tier=trial` and `trial_expires_at = now() + 14 days`.
3. If logging in as a Google-only user previously, may be redirected to `/change-password`.
4. **`/onboarding`** — 5 steps:
   - Step 1: company name + industry (drives the AI's tone calibration).
   - Step 2: upload PDF/DOCX or website URL → `POST /api/onboarding/extract-content`.
   - Step 3: review extracted text.
   - Step 4: AI analysis → `POST /api/onboarding/analyze-brand` runs Gemini on the text and returns brand summary, audience, pillars, do/don't rules, CTA preferences, hashtag themes.
   - Step 5: review and tweak the auto-generated profile, then `POST /api/onboarding/save-brand-profile` persists it. Server also creates the org if one doesn't exist (slug from company name).
5. **`/trial-welcome`** — countdown banner, feature highlights, CTA → `/dashboard`.
6. **`/dashboard`** — campaign list (empty). Click **New Campaign**.
7. **`/dashboard/campaigns/new`** — fill brief: company name (prefilled), description, platforms (e.g. LinkedIn + Instagram), tone, posts count (1–5), CTA (built-in or custom). Click **Generate**.
8. `POST /api/campaigns` returns SSE — UI streams `status` → `post` → `image` events; the user watches posts and images appear in the right sidebar in real time.
9. After generation completes, the user reviews each post (rich-text editing, image regeneration on demand) and clicks **Save Campaign** (or auto-saves on completion).
10. Redirect to `/dashboard/campaigns/:id`. User clicks **Connect LinkedIn** in a banner, OAuths through, and lands back on the campaign with LinkedIn marked Connected.
11. User clicks **Publish Now** on a LinkedIn post → `POST /api/linkedin/post-now`. Spring Post calls LinkedIn's API; on success the post URL is saved to `campaign_posts.platformPostUrl` and the post card shows "Published" with a link.

### 2. Inviting a teammate

1. Org admin opens `/dashboard/roles`.
2. Clicks **Invite Member** → form opens.
3. Enters teammate email, picks a role (default "Standard Creator" or a custom role).
4. `POST /api/organization/members/invite` — server creates a placeholder user row with `invitationToken`, sends a SendGrid email containing a tokenized link to `/accept-invite?token=…`.
5. Teammate clicks the email link.
6. **`/accept-invite`** — `GET /api/invite/verify?token=…` confirms the token and returns the org name + role + email for display.
7. Teammate enters full name + password (≥6 chars) and submits → `POST /api/invite/accept`.
8. Backend hashes password, marks invite consumed, creates the `organization_members` row with the assigned role.
9. Teammate is auto-logged in and lands on `/dashboard`. Sidebar items are filtered by their role's permissions.

### 3. Connecting a social platform and publishing

#### LinkedIn

1. **`/dashboard/social-accounts`** → click **Connect LinkedIn**.
2. `GET /api/linkedin/connect` redirects to LinkedIn OAuth 2.0.
3. After consent, LinkedIn redirects to `/api/linkedin/callback?code=…`. Server exchanges the code for tokens and stores them in `social_connections`.
4. Page reloads showing "Connected" status with the user's LinkedIn name. If posting on behalf of an organization, user picks one from a dropdown (stored client-side until first publish).
5. From any campaign post, **Publish Now** → `POST /api/linkedin/post-now`.

#### X (Twitter)

1. Click **Connect X** → OAuth 2.0 PKCE initiate (`GET /api/x/connect`).
2. Callback saves access + refresh tokens; tokens auto-refresh on demand using the `offline.access` scope.
3. Publish via `POST /api/x/post-now`. Image upload is **not yet supported** in the current X integration — text-only tweets.

#### Facebook + Instagram

1. **Connect Facebook** → OAuth → server requests user's Pages via `/me/accounts` and Business-owned Pages via `/me/businesses` (covers users whose Pages live in Business Manager).
2. The page selector dropdown shows the merged list. User picks a Page.
3. If the selected Page has a linked Instagram Business Account, IG status auto-updates to Connected (Instagram tokens flow through Facebook's Graph API).
4. Publish via `POST /api/facebook/post-now` (Facebook) or `POST /api/instagram/post-now` (Instagram, supports single image or carousel).
5. Schedule via `POST /api/facebook/schedule` (uses Facebook's native `scheduled_publish_time`) or `POST /api/instagram/schedule`. Scheduled posts appear in `/dashboard/scheduled-posts`.

> Until Meta App Review approval lands, the FB/IG flow only works for app-role test users. See [APP_REVIEW_NOTES.md](../APP_REVIEW_NOTES.md).

### 4. Subscription upgrade (trial → paid)

1. Trial user nearing day 14 sees a header banner: *"Trial ending in 2 days — upgrade to keep generating posts."*
2. Banner CTA opens `/subscribe`.
3. **`/subscribe`** — three plan cards (Professional, Enterprise, Founder). Each card shows price (loaded live from `/api/subscription/plans`), feature list, and an Upgrade button.
4. Click **Upgrade to Professional** → `POST /api/subscription/create-checkout` → returns a Stripe Checkout URL.
5. Redirected to Stripe-hosted checkout page; user enters card and pays.
6. Stripe simultaneously:
   - Redirects browser to `/checkout-success?session_id=cs_…`
   - Fires `checkout.session.completed` to `POST /api/webhook/stripe` (raw body, signature-verified)
7. Webhook handler updates `organization_subscriptions.status = "active"` and `tier = "professional"`, sends a confirmation email.
8. **`/checkout-success`** — calls `POST /api/subscription/verify-checkout` to confirm the latest state, then redirects to `/dashboard`.
9. New quotas apply on next page load: more AI posts/month, scheduling enabled, etc.

### 5. Super admin operations

1. Super admin logs into `/admin-panel` (separate session via `POST /api/admin/login`).
2. **Stats tab** — live MRR, churn, total users, total orgs, active subscriptions.
3. **Users tab** — search by email, view detail, override `systemRole`, block/unblock, deactivate, mark email verified, force onboarding complete, trigger verification or password-reset emails.
4. **Organizations tab** — list with billing status. Per-org actions:
   - **Reset trial** → `POST /api/admin/organizations/:id/reset-trial` with reason; logged in `tier_reset_logs`.
   - **Override tier** → `PATCH /api/admin/organizations/:id/tier` (e.g. promote to founder for an internal account).
   - **Cancel subscription**, **refund**, **add billing credit** — all logged.
   - **Delete org** — soft-delete with cascade.
5. **Billing tab** — invoices, MRR breakdown, churn analysis.
6. **Plans** — edit subscription plan pricing live (no deploy needed); changes also sync the local mirror with Stripe price IDs.
7. **Tier quotas** — adjust per-(tier, resource) limits in `tier_quota_configs`. Changes apply immediately.

### 6. Tracking metrics & analytics

#### CSV upload (works without social-platform connection)

1. User opens campaign detail page.
2. Clicks **Download Sample CSV** → `GET /api/campaigns/:id/metrics/sample-csv` returns a CSV with the post identifiers (POST-001, POST-002, …) and empty metric columns.
3. User fills in metrics from their own analytics tools, saves CSV.
4. Clicks **Upload Metrics CSV** → `POST /api/campaigns/:id/metrics/upload-csv` (multipart). Server parses, validates `postIdentifier`, upserts `post_metrics` rows.
5. Page refreshes; engagement cards now show impressions, reach, likes, comments, shares, saves, clicks per post.

#### Live sync (requires connected social account + Meta App Review for FB/IG)

1. User clicks **Sync Metrics** on the campaign.
2. `POST /api/campaigns/:id/metrics/sync` iterates over published posts, calls each platform's metrics API (FB Graph `insights` edge, IG `insights`, X analytics, LinkedIn analytics), upserts both `post_metrics` (latest) and `post_metric_snapshots` (timestamped).
3. Trend charts on the campaign page update.

#### AI learning loop

When the user creates the *next* campaign, the server runs a query that ranks posts by composite score (50% engagement rate + 30% CTR + 20% save rate) and injects the top 5 into the AI prompt as exemplars — so the AI naturally repeats what's working.

---

## Reusable components

In [client/src/components/](../client/src/components/), excluding the shadcn primitives in `components/ui/`.

| File | Purpose |
|------|---------|
| **app-sidebar.tsx** | Navigation sidebar. Filters items by `usePermissions().canAccess(MODULE)`; hides Billing for `founder` tier; shows Roles tab to admins only |
| **post-detail-dialog.tsx** | Modal: post preview, metrics, edit button, image carousel, media-library picker, schedule/publish actions |
| **rich-text-editor.tsx** | TipTap-based editor — bold/italic/underline/links, dark-mode aware |
| **image-editor.tsx** | Canvas editor — crop, rotate, flip, brightness/contrast/saturation/grayscale, watermarks; AI tab: bg removal, enhancement, style transfer (8 styles), prompt-based edit |
| **image-carousel.tsx** | Multi-image post viewer with prev/next + thumbnail dots |
| **theme-provider.tsx** | Light/dark theme context with localStorage persistence |
| **theme-toggle.tsx** | Header sun/moon button |
| **quota-exceeded-modal.tsx** | Global modal triggered when `useQuota().isAtAiLimit === true`; offers upgrade link |
| **founder-congratulations-modal.tsx** | Celebratory dismissible modal for founder-tier transitions |
| **ObjectUploader.tsx** | Wrapper around Uppy with Companion plugins (Google Drive, OneDrive, Unsplash) |

---

## Custom hooks

In [client/src/hooks/](../client/src/hooks/).

| Hook | Returns |
|------|---------|
| **use-auth** | `{ user, isLoading, error, loginMutation, registerMutation, logoutMutation }` — wraps `GET /api/user` (refetch every 30s); exposes login/register/logout mutations |
| **use-permissions** | `{ hasPermission(module, action), canAccess(module), isAdmin(), isSuperAdmin(), systemRole, organizationId, isBlocked }` — drives sidebar filtering, edit-button visibility, route guards |
| **use-quota** | `{ aiPostsRemaining, isAtAiLimit, canSchedule, canCreateCompany, canInviteMember, tier, quotas }` — gates feature buttons and triggers upgrade modals |
| **use-subscription** | `{ status, tier, trialDaysRemaining, trialMinutesRemaining, hasAccess, isTrialing, needsSubscription, isPastDue, isFounder, isPaid, isSuspended }` — drives banners and `/subscribe` redirects |
| **use-toast** | `toast({ title, description, variant })` — shows transient notifications |
| **use-mobile** | `isMobile` (boolean) — true when viewport < 768px |

---

## Cross-cutting UX patterns

### Dark / light mode

- `ThemeProvider` wraps the app at the root.
- `ThemeToggle` button in the header switches modes.
- Choice persists to localStorage; loaded on next page open.
- All shadcn components and CSS variables (`--primary`, `--background`, etc.) flip on the `dark` class on `<html>`.

### Permission-driven UI

The sidebar, action buttons, and route guards all consult `usePermissions()`. Examples:

- **Sidebar items** hidden when `canAccess(MODULE) === false`.
- **"New Campaign" button** hidden when `!hasPermission("CAMPAIGN", "customize")`.
- **Brand Voice editor** falls back to read-only when missing `customize` on `BRAND_VOICE`.
- **Roles tab** shown only when `isAdmin() === true`.

Server still enforces the same checks at the API edge — UI filtering is a UX nicety, not a security boundary.

### Trial / quota gates

- `QuotaExceededModal` (global) appears whenever `isAtAiLimit === true`. Pre-empts any AI-generation button click.
- **Past-due banner** in the dashboard header when `isPastDue === true`. Dismissible, but reappears on reload.
- **Trial countdown banner** in the header for users on `tier=trial`, formatted as "X days left" or "Xm left" if under an hour.
- **Founder tier** bypasses *all* quota checks — `isAtAiLimit` is permanently `false`, all features unlocked.

### Onboarding gate

- After login, the [protected-route.tsx](../client/src/lib/protected-route.tsx) wrapper checks `user.onboardingCompleted`. If `false`, redirects to `/onboarding`.
- Direct URL access to `/dashboard` etc. is intercepted and redirected back.
- After `POST /api/onboarding/save-brand-profile` succeeds, the user object's `onboardingCompleted` flag is true on the next `/api/user` fetch — gate releases.

### Subscription gate

- The `useSubscription()` hook computes `needsSubscription = !isFounder && !isPaid && (isTrialing && trialDaysRemaining <= 0)` (or similar).
- Routes inside `/dashboard/*` redirect to `/subscribe` when `needsSubscription` is true.
- `/subscribe` is the only authenticated route that doesn't enforce the gate (otherwise users couldn't reach the upgrade page).
- Successful Stripe checkout returns to `/checkout-success`, which clears the gate after `verify-checkout` confirms.

### Suspended account

If `users.blocked === true` or `organizations.accountStatus === "suspended"`, all routes redirect to `/suspended` with a contact-support CTA. Login still works (so support can clear the block).

### Global state

- **Server state** (campaigns, brand profile, quota, subscription, permissions, members): TanStack React Query keyed by URL path. Mutations call `queryClient.invalidateQueries(...)` to refresh.
- **Auth, theme**: Context providers.
- **Form state**: `react-hook-form` per form; Zod schemas from `@shared/schema` reused as resolvers.
- **Local UI state**: `useState` per component. No Redux/Zustand.
