# Architecture

This document describes how SF Media is built end-to-end: the tech stack, the layout, the design patterns, and the runtime topology. Read this before you write your first feature.

---

## High-level topology

```
┌─────────────────────────────────────────────────────────────┐
│                          Browser                            │
│  React SPA · TanStack React Query · TipTap · Uppy           │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS (REST + Server-Sent Events)
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              Azure App Service (Production slot)            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Express 5 (single Node 22 process)                 │    │
│  │  ├─ /api/*       → routes.ts handlers               │    │
│  │  ├─ /companion   → Uppy Companion mounted as mw     │    │
│  │  ├─ /api/webhook/stripe (raw body)                  │    │
│  │  └─ static + index.html (SPA fallback)              │    │
│  └─────────────────────────────────────────────────────┘    │
│         │                    │                              │
│         │ pg                 │ HTTPS                        │
└─────────┼────────────────────┼──────────────────────────────┘
          │                    │
┌─────────▼─────────┐   ┌──────▼─────────────────────────────┐
│  PostgreSQL       │   │  External services                 │
│  Drizzle ORM      │   │  OpenAI (text + image)             │
│  - users, orgs    │   │  Cloudinary CDN                    │
│  - campaigns      │   │  Stripe (subscriptions + webhook)  │
│  - posts          │   │  SendGrid (email)                  │
│  - metrics        │   │  Meta Graph API (FB + IG)          │
│  - subscriptions  │   │  X API v2 (OAuth 2.0 + PKCE)       │
│  - quotas         │   │  LinkedIn API                      │
│  - audit logs     │   │  DataForSEO (keyword/competitor)   │
└───────────────────┘   └────────────────────────────────────┘
```

The whole app is a single Express process serving both the API and the built React SPA. There is no separate frontend host, no microservice fleet, no message queue. Scheduling, metric sync, and Stripe webhooks are all in-process.

---

## Tech stack

### Frontend

| Layer | Choice |
|-------|--------|
| Framework | **React 18** + TypeScript |
| Build tool | **Vite 7** (dev server with HMR; outputs `dist/public/` for prod) |
| Routing | **wouter** (lightweight, hook-based, ~1KB) |
| Server state | **TanStack React Query v5** (cache, refetch, mutation lifecycle) |
| UI primitives | **shadcn/ui** (new-york style) on **Radix UI** |
| Styling | **Tailwind CSS** + CSS variables for light/dark theming |
| Animation | **Framer Motion** |
| Icons | **lucide-react** |
| Forms | **react-hook-form** + **Zod resolvers** |
| Rich text | **TipTap** (ProseMirror-based) |
| File upload | **Uppy** + Companion (Google Drive, OneDrive, Unsplash) |
| Image editor | Custom canvas-based editor |
| Charts | (Native via SVG / minimal) |

### Backend

| Layer | Choice |
|-------|--------|
| Runtime | **Node.js 22.x** |
| Framework | **Express 5** |
| Type system | **TypeScript** (tsx in dev, esbuild bundle in prod → `dist/index.cjs`) |
| ORM | **Drizzle ORM** (`pg` driver) |
| Validation | **Zod** (shared with client via `shared/schema.ts`) |
| Auth | **express-session** + bcryptjs + Google OAuth (google-auth-library) |
| Session store | **connect-pg-simple** (sessions in PostgreSQL) |
| File handling | **Multer** (in-memory) for direct uploads, Companion for cloud imports |
| AI | **openai** (gpt-4.1-mini for text, gpt-image-1 for images) |
| Payments | **stripe** SDK |
| Email | **nodemailer** + SendGrid SMTP relay |
| Image hosting | **cloudinary** SDK |
| Document parsing | **pdf-parse** (PDFs), **mammoth** (DOCX) |

### Database

PostgreSQL 16, accessed via Drizzle. Tables are declared in [shared/schema.ts](../shared/schema.ts) — that file is the source of truth for schema, types, and Zod validators.

### Infrastructure

| Concern | Choice |
|---------|--------|
| Hosting | **Azure App Service** (Linux, slot: Production) |
| Build | Oryx auto-build on Azure (`npm install` + `npm run build`) |
| CI/CD | **GitHub Actions** on push to `development` branch |
| Deploy | `azure/webapps-deploy@v3` via federated identity (no secrets) |
| Custom domain | `sfmedia.com` |
| TLS | Managed by Azure |

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full pipeline.

---

## Repository layout

```
SF-Media/
├── client/src/
│   ├── App.tsx                  # Root with wouter routes + ThemeProvider + AuthProvider
│   ├── main.tsx                 # Entry; mounts <App />
│   ├── index.css                # Tailwind base + theme CSS variables
│   ├── pages/                   # 29 route components — see FEATURES.md inventory
│   ├── components/
│   │   ├── ui/                  # shadcn primitives (Button, Dialog, Select, ...)
│   │   ├── app-sidebar.tsx      # Navigation, permission-filtered
│   │   ├── post-detail-dialog.tsx
│   │   ├── rich-text-editor.tsx # TipTap wrapper
│   │   ├── image-editor.tsx     # Canvas editor with AI ops
│   │   ├── image-carousel.tsx
│   │   ├── theme-provider.tsx
│   │   ├── theme-toggle.tsx
│   │   └── ObjectUploader.tsx
│   ├── hooks/
│   │   ├── use-auth.tsx         # Auth context + login/register/logout mutations
│   │   ├── use-permissions.ts   # hasPermission(), canAccess(), isAdmin()
│   │   ├── use-quota.ts         # AI posts remaining, canSchedule, etc.
│   │   ├── use-subscription.ts  # Tier, status, trial countdown
│   │   ├── use-toast.ts
│   │   └── use-mobile.tsx
│   └── lib/
│       ├── queryClient.ts       # apiRequest helper + React Query config
│       ├── protected-route.tsx  # Auth + onboarding gate
│       └── utils.ts
│
├── server/
│   ├── index.ts                 # Express bootstrap, middleware order, error handlers
│   ├── routes.ts                # ALL HTTP routes (~3500 lines)
│   ├── storage.ts               # IStorage interface + DatabaseStorage implementation
│   ├── db.ts                    # pg pool + ensureSessionTableExists() + runStartupMigrations()
│   ├── startup.ts               # runDrizzlePush() — spawns drizzle-kit on boot
│   ├── permissions.ts           # requireAuth, requirePermission, requireAdmin, etc.
│   ├── auth.ts                  # Login/register/Google OAuth handlers
│   ├── email.ts                 # Transactional templates + sendmail
│   ├── stripe.ts                # Subscription helpers + webhook event handlers
│   ├── image-service.ts         # OpenAI image gen + Cloudinary upload
│   ├── x.ts                     # X (Twitter) OAuth + post-now + scheduler
│   ├── linkedin.ts              # LinkedIn OAuth + post-now
│   ├── facebook.ts              # FB Graph API: pages, post, schedule, sync
│   ├── instagram.ts             # IG content publishing API (carousel, single)
│   ├── companion.ts             # Uppy Companion config + token signing
│   ├── competitor-analysis.ts   # DataForSEO client
│   ├── static.ts                # Production static file serving
│   └── vite.ts                  # Dev-only Vite middleware integration
│
├── shared/
│   └── schema.ts                # 22 Drizzle tables + Zod schemas + constants
│                                # Imported by client (`@shared/schema`) and server
│
├── migrations/                  # Hand-written SQL files (gitignored, documentary only)
├── script/build.ts              # Vite + esbuild → dist/
├── scripts/post-merge.sh        # Convenience: npm install && npm run db:push
├── docs/                        # ← You are here
├── .github/workflows/           # GHA deploy to Azure
└── (config files at root)       # tsconfig, drizzle.config, vite.config, tailwind, postcss
```

---

## Design principles

### 1. Type safety end-to-end

`shared/schema.ts` is the single source of truth for **DB schema**, **API contract** (Zod), and **shared constants** (PLATFORMS, TONES, MODULES, etc.). Both client and server import from `@shared/schema`. The `BrandProfile`, `Campaign`, etc. TypeScript types are *inferred* from Drizzle table definitions via `typeof brandProfiles.$inferSelect` — never hand-written.

When you add a column or change a Zod schema, the change flows automatically:
- DB schema changes via `drizzle-kit push --force` on next server boot
- TS types update everywhere on next typecheck
- Client mutations validate against the same Zod schema the server uses

### 2. Storage interface pattern

All DB access is through `IStorage` ([server/storage.ts:30](../server/storage.ts#L30)). The route handlers call `storage.getCampaign(id)`, never `db.select().from(campaigns)`. This:

- Keeps routes thin and testable (mock `IStorage` in tests)
- Localizes Drizzle imports to one file
- Makes it possible to swap the storage layer (e.g., for an in-memory test impl)

### 3. Thin route handlers

Routes do four things and only four:
1. Authenticate (`requireAuth`)
2. Authorize (`requirePermission(MODULE, ACTION)`)
3. Validate input with a Zod schema from `shared/schema.ts`
4. Call `storage.x()` and shape the response

Anything more complex — Stripe webhook event handling, SSE generation streaming, OAuth dance — lives in a dedicated service module (`stripe.ts`, generation in `routes.ts` helpers, `x.ts`, `facebook.ts`, etc.).

### 4. Permission gates at the edge

Every protected route declares its requirement inline:

```ts
app.post(
  "/api/campaigns",
  requireAuth,
  requirePermission("CAMPAIGN", "customize"),
  async (req, res) => { ... }
);
```

Authorization is never re-checked inside business logic. If you can call the route, you can perform the action. This makes audit trivial — grep the routes file.

### 5. No hand-written migrations

Adding a column? Edit `shared/schema.ts`. Drizzle Kit reconciles the schema on next deploy via `drizzle-kit push --force` running automatically in [server/startup.ts](../server/startup.ts). The `migrations/` folder is **gitignored** — it's a local artifact only.

> **Caveat**: `drizzle-kit push --force` is the right tool for additive, low-risk changes (new column, new table). For destructive changes (dropping columns with data, type changes, splitting tables) you should still write SQL by hand and apply it as a one-off via `runStartupMigrations()` in [server/db.ts](../server/db.ts).

### 6. Frontend-heavy logic

The backend is a thin shell over Postgres + external APIs. Most flow logic lives on the frontend:
- Onboarding state machine — client-side
- Multi-step campaign wizard — client-side
- Permission filtering of UI — client-side (server still enforces at the route level)
- Calendar drag-drop, image editing, post preview — client-side

This keeps the backend simple and the API surface predictable.

---

## Authentication architecture

Two parallel session systems live in the same process:

### User sessions (general app)

- `express-session` with `connect-pg-simple` — sessions persisted to the `session` table in Postgres.
- Cookie: `connect.sid`, `HttpOnly`, `Secure` (in production), `SameSite=lax`.
- Login methods: email/password (bcrypt cost 10) or Google OAuth (ID token verified server-side via `google-auth-library`).
- OTP flow for password reset and Google account linking via the `otp_codes` table.
- Session contains `userId` only; user object is re-loaded per request from `users` by `userId`.
- `requireAuth` middleware ([server/permissions.ts](../server/permissions.ts)) returns 401 if `req.session.userId` is missing.

### Super admin sessions (admin panel)

- Separate session — admin login at `POST /api/admin/login` writes a different cookie.
- `GET /api/admin/me` returns the admin user.
- Required for `/admin-panel` routes; `requireSuperAdmin` middleware enforces this.

### Why two sessions?

The original design wanted to allow super admins to operate without losing their regular user session — useful for testing and impersonation flows. The two cookies do not conflict.

---

## Authorization (RBAC)

Authorization is multi-tenant and module-based.

### Modules and actions

Defined in `shared/schema.ts`:

- **Modules**: `CAMPAIGN`, `CALENDAR`, `BRAND_VOICE`, `MEDIA_LIBRARY`, `TEAM_MANAGEMENT`, `BILLING`, `ANALYTICS`
- **Actions**: `view`, `customize` (where `customize` collapses create / edit / delete / schedule / generate into one grant — keeps the matrix small enough to manage)

### System roles

- `super_admin` — global override; all permissions granted, all org boundaries crossed. Set on the `users.systemRole` column.
- `admin` — org-level full access; can manage roles, members, billing, and bypasses module permission checks within their org.
- `creator` — module-permission-based access; what they can do is determined entirely by the role they've been assigned.

### Custom roles

Each organization can define custom roles in the `roles` table. Each role has zero-or-more rows in `role_permissions` (`module`, `action`, `granted` boolean). A "Standard Creator" role is auto-created when an org is created, with sensible defaults:

| Module | view | customize |
|--------|------|-----------|
| CAMPAIGN | ✓ | ✓ |
| CALENDAR | ✓ | ✓ |
| BRAND_VOICE | ✓ | — |
| MEDIA_LIBRARY | ✓ | ✓ |
| TEAM_MANAGEMENT | — | — |
| BILLING | — | — |
| ANALYTICS | — | — |

### Audit trail

Every role/permission change writes to `role_audit_logs` with `previousValue` and `newValue` JSON snapshots, the acting user, and the target user. Visible to admins via `GET /api/roles/audit-logs`.

---

## Multi-tenancy

| Layer | Model |
|-------|-------|
| **Organizations** | Top-level tenant. Has `name`, `slug` (unique), `tier`, `accountStatus`. |
| **Membership** | `organization_members` row links a user to an org with a role. Enforced unique constraint: **one organization per user** ([migrations/0008](../migrations/0008_one_organization_per_user.sql)). |
| **Brand profiles** | Each org has at most one brand profile (unique conditional index on `organization_id`). |
| **Campaigns, posts, metrics, scheduled posts** | All carry `organization_id` (or are downstream of a campaign that does). |
| **Quotas & audit logs** | All scoped to `organization_id`. |
| **Cross-org access** | Forbidden except for `super_admin`. Routes that take `:orgId` always verify membership before serving data. |

The "one org per user" constraint simplifies a lot of authz checks but means a single user can't easily participate in multiple orgs. If that requirement comes up, `organization_members` already supports many-to-many — only the unique index would need to be relaxed.

---

## AI integrations

### OpenAI text (`gpt-4.1-mini`)

Used by:
- **Brand voice analysis** during onboarding — extracts brand summary, audience, pillars, do/don't rules, CTAs, hashtag themes from uploaded text/files
- **Sample post generation** — produces LinkedIn + Instagram samples that validate the brand profile
- **Campaign post generation** — multi-platform post generation streamed via SSE
- **Campaign brainstorming** — suggests campaign ideas from the brand profile + market intelligence
- **Image prompts** — generates the prompt that's then fed to the image model

Driven by `OPENAI_API_KEY`. The client and a `generateText()` helper live in
[server/openai-client.ts](../server/openai-client.ts); call sites are wrapped in helper
functions in `server/routes.ts` (around the `/api/onboarding/analyze-brand`,
`/api/campaigns`, and `/api/brainstorm` routes).

The client is constructed **lazily**, on first use. `server/index.ts` imports `./routes`
before it calls `dotenv.config()`, and `new OpenAI()` throws when the key is absent — so
constructing at module scope would crash boot rather than failing the individual AI route.

Prompts that expect a JSON **object** set `response_format: json_object`. The two prompts
that return a top-level JSON **array** (campaign post generation, brainstorm) deliberately
do not, because that mode cannot emit a bare array. `parseModelJson()` in `server/routes.ts`
remains the tolerant fallback parser, including its truncation-salvage path for responses
cut off at `max_tokens`.

### OpenAI images (`gpt-image-1`)

Used by:
- **Per-post image generation** at platform-specific dimensions
- **Media library AI image generation** (standalone, free-form prompt)
- **AI image editing** — background removal, enhancement, style transfer, prompt-based edits

Implemented in [server/image-service.ts](../server/image-service.ts). Output PNG → uploaded to Cloudinary → URL stored in `campaign_posts.imageUrl` / `media_files.url`.

`gpt-image-1` renders only 1024×1024, 1536×1024, and 1024×1536. Posts are therefore
generated at the nearest supported aspect and Cloudinary's `crop: "fill"` /
`gravity: "auto"` transformation lands the exact platform dimensions — which discards
roughly 20% of the height on the ~1.9:1 landscape platforms, so the generation prompt asks
for a centred composition. Image *edits* derive their output size from the input's aspect
ratio for the same reason; without that a 1200×627 image would come back square.

Image quality defaults to `medium` and can be overridden with `OPENAI_IMAGE_QUALITY`
(`low` | `medium` | `high`) to trade cost and latency against fidelity.

### AI learning loop

Before generating posts for a campaign, the server fetches the org's top 5 best-performing past posts (composite score: 50% engagement rate + 30% CTR + 20% save rate, computed from `post_metrics`) and injects them into the AI prompt as exemplars. Top performers naturally become the style reference.

### Market intelligence in the prompt

If `market_intelligence` data exists for the org, the trending keywords and competitor angles are added to the campaign-generation prompt under a `=== MARKET INTELLIGENCE ===` section, encouraging the AI to ride trending topics.

---

## Streaming campaign generation

`POST /api/campaigns` returns **Server-Sent Events** (SSE), not a JSON response. The handler:

1. Creates the campaign record (status `draft`).
2. For each (platform × post slot) pair, writes:
   - `data: {"type":"status", "message":"Generating linkedin post 1..."}\n\n`
3. Calls OpenAI, parses the response, persists a `campaign_posts` row, then writes:
   - `data: {"type":"post", "post":{...}}\n\n`
4. Generates the image for each post, then writes:
   - `data: {"type":"image", "postId":N, "imageUrl":"https://..."}\n\n`
5. Closes with:
   - `data: {"type":"complete", "campaignId":N}\n\n`

The client consumes the stream with `fetch` + `response.body.getReader()` and updates the UI as posts/images appear. The user sees results in seconds rather than waiting for the whole batch.

`POST /api/campaigns/:id/add-posts` and `POST /api/campaigns/:id/generate-images` use the same pattern.

---

## File upload architecture

Two paths into the system:

### Direct upload

Multer middleware handles `multipart/form-data` for endpoints like `POST /api/media/files/upload`. The file is held in memory, streamed to Cloudinary, the URL is stored in `media_files`, and the buffer is discarded.

Multer is **memory-only** — no temp files on disk. This is fine because Cloudinary is fast and files are <10MB (logos, generated images).

### Cloud import via Uppy Companion

For Google Drive / OneDrive / Unsplash, the user picks a file in their cloud account; Companion (mounted at `/companion`) handles the OAuth dance, streams the file from the source, and re-uploads it to Cloudinary on the user's behalf.

Companion config requires:
- `COMPANION_SECRET` — must be stable across restarts (used for HMAC token signing); if it rotates, in-flight pickers break with 401
- `COMPANION_GOOGLE_KEY` / `_SECRET`
- `COMPANION_ONEDRIVE_KEY` / `_SECRET`
- `COMPANION_UNSPLASH_KEY`
- `APP_BASE_URL` — required so OAuth redirect URLs use the public hostname, not Azure's internal probe hostname

`trust proxy: 1` is set so `req.hostname` reads `X-Forwarded-Host` correctly.

---

## Subscription & billing architecture

Stripe is the source of truth for subscription state; we mirror it locally for fast queries.

### Flow

1. User clicks Upgrade → `POST /api/subscription/create-checkout` creates a Stripe Checkout session with the price ID for the selected tier × interval.
2. User completes checkout on Stripe's hosted page.
3. Stripe redirects to `/checkout-success?session_id=…`. The page calls `POST /api/subscription/verify-checkout` to confirm.
4. Stripe simultaneously fires `checkout.session.completed` to `POST /api/webhook/stripe` (raw-body endpoint with signature verification). The handler updates `organization_subscriptions.status` and `tier`.
5. The user's quotas refresh on next page load.

### Webhook events handled

| Stripe event | Server action |
|--------------|---------------|
| `checkout.session.completed` | Mark subscription `active`, set tier, send confirmation email |
| `customer.subscription.updated` | Sync status (`active`, `past_due`, `canceled`) |
| `customer.subscription.deleted` | Mark subscription `canceled` |
| `invoice.payment_failed` | Mark subscription `past_due`, surface banner in UI |
| `charge.refunded` | Adjust billing credit (admin-initiated) |

### Plans table

`subscription_plans` stores plan metadata (name, prices, Stripe product/price IDs). Super admin can edit pricing live; the webhook handler keeps the local mirror in sync.

### Trial logic

New orgs start with `tier=trial` and `trial_expires_at = now() + 14 days`. The `use-subscription` hook computes time remaining; the `/subscribe` redirect kicks in when `trial_expires_at < now()` and there's no active subscription. Super admins can reset trials with a reason via the admin panel — every reset is logged in `tier_reset_logs`.

---

## Quota architecture

Defined per `(tier, resource)` pair in `tier_quota_configs`. Resources tracked:

- `campaign`, `ai_image`, `scheduled_post`, `social_connection`, `seat`, `company`

When a user performs a quota-consuming action:
1. Server inserts a row into `org_quota_events` with `(organization_id, action)`.
2. The next quota check counts events in the current period (month) against the configured limit.
3. The `use-quota` hook surfaces remaining counts and disables UI buttons when at limit.

Founder tier bypasses all gates. Super admin can adjust per-tier limits live via the admin panel without a deploy.

---

## Email architecture

`server/email.ts` exports template functions (welcome, password reset, OTP, invitation, billing receipts). Sends via SendGrid SMTP relay with `nodemailer`. The `getAppUrl()` helper resolves the base URL for outbound links from `APP_URL` → `APP_BASE_URL` → `http://localhost:5000` (dev fallback).

Outgoing email is fire-and-forget — failures are logged but don't block the request that triggered them.

---

## Schema sync on boot

[server/startup.ts](../server/startup.ts) runs at process start:

1. **`runDrizzlePush()`** — spawns `npx drizzle-kit push --force`. Reads `shared/schema.ts`, diffs against the live DB, applies additive changes. The `--force` flag suppresses interactive prompts (essential in CI).
2. **`runStartupMigrations()`** ([server/db.ts](../server/db.ts)) — applies idempotent SQL for changes drizzle-kit can't safely auto-apply (FK additions, complex indexes, default value backfills).
3. **`ensureSessionTableExists()`** — creates the `session` table if missing (for `connect-pg-simple`).

If any of the above fails, the app continues to boot — schema desync is logged but doesn't block startup. This is intentional: a partial-deploy environment shouldn't 500 the whole app.

---

## Scheduling architecture

Scheduled posts live in `scheduled_social_posts` (Facebook-specific) or are stored as `campaign_posts.scheduledAt` for other platforms. SF Media does **not** run an internal cron — instead:

- **Facebook**: scheduled via Facebook's native Page-scheduling API (`scheduled_publish_time` parameter on `POST /{page-id}/feed`). FB does the actual scheduling on their end.
- **X / LinkedIn / Instagram**: scheduled by storing `scheduledAt` and relying on a future job runner (or, today, manual user click — verify with the team if a scheduler has been added).

This is a current gap to be aware of: cross-platform scheduling for X and LinkedIn may rely on user action rather than automated dispatch. Check `server/x.ts` and `server/linkedin.ts` for the latest publish flow before assuming.

---

## Frontend state management

| State | Where it lives |
|-------|----------------|
| **Server state** (campaigns, posts, brand profile, subscription, quota, permissions, members) | TanStack React Query — keyed by URL path (e.g., `["/api/campaigns"]`). Mutations invalidate keys on success. |
| **Auth** | Context provider in `use-auth.tsx` — wraps app, exposes `user`, login/register/logout mutations. |
| **Theme** | Context provider in `theme-provider.tsx`, persists to localStorage. |
| **Form state** | `react-hook-form` per form. Zod schemas from `@shared/schema` are reused as resolvers. |
| **Local UI state** | `useState` / `useReducer` per component. No global UI store. |

We deliberately avoid Redux/Zustand. React Query handles ~80% of state needs; Context handles the rest.

---

## Build & runtime

### Dev

```
npm run dev
```

Runs `tsx server/index.ts`. The server's [vite.ts](../server/vite.ts) module mounts Vite as Express middleware, so the same process serves the API and the React HMR. No separate frontend dev server.

### Production build

```
npm run build
```

[script/build.ts](../script/build.ts):
1. `viteBuild()` → outputs `dist/public/` (HTML, JS, CSS, assets with hashed filenames)
2. `esbuild` → bundles `server/index.ts` to `dist/index.cjs` (CommonJS, minified, externalizing most npm deps; ~30 deps are bundled inline for cold-start speed)

### Production runtime

```
NODE_ENV=production node dist/index.cjs
```

[server/static.ts](../server/static.ts) serves `dist/public/` for non-`/api` routes, with `index.html` as the SPA fallback.

The Dockerfile uses a multi-stage build (Node 22 alpine) — see [Dockerfile](../Dockerfile). Azure App Service runs Oryx, which detects Node and runs `npm install` + `npm run build` automatically.

---

## What this architecture is *not* optimized for

- **Horizontal scale**: Single-process app. To scale beyond one instance, you'd need to externalize sessions to Redis (or trust the Postgres session store), and ensure no in-process caches are used. No issue at current scale.
- **Real-time multi-user collaboration**: There's no WebSocket layer. Two users editing the same campaign would conflict — last write wins. Acceptable for current usage patterns.
- **Heavy background jobs**: No queue. Stripe webhook is in-process, AI generation streams synchronously over SSE. If a generation takes 90 seconds, the connection stays open. Most generations are <30s, so this hasn't been a problem.
- **Microservice extraction**: Tightly coupled by design. The single-process model is a feature, not a bug, until the team grows past the point where it becomes a coordination problem.

---

## Cross-references

- Database tables: [DATA_MODEL.md](./DATA_MODEL.md)
- HTTP endpoints: [API.md](./API.md)
- Pages and user flows: [FEATURES.md](./FEATURES.md)
- Deploy + env vars: [DEPLOYMENT.md](./DEPLOYMENT.md)
- Local dev setup: [DEV_SETUP.md](./DEV_SETUP.md)
