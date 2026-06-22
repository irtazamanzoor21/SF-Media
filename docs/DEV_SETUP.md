# Developer Setup

How to run SF Media locally, what conventions to follow, and how to ship changes.

---

## Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| **Node.js** | 22.x | Runtime; matches the Azure App Service runtime |
| **npm** | bundled with Node 22 | Package manager |
| **PostgreSQL** | 16.x | Database |
| **Git** | any modern | Source control |

Check versions:

```bash
node --version    # v22.x
npm --version
psql --version    # 16.x
```

If you don't have PostgreSQL locally, the easiest option is Docker:

```bash
docker run -d --name sfmedia-postgres \
  -e POSTGRES_PASSWORD=local \
  -e POSTGRES_DB=sf_media \
  -p 5432:5432 \
  postgres:16
```

---

## Initial setup

```bash
git clone https://github.com/irtazamanzoor21/SF-Media.git
cd SF-Media
npm install
cp .env.example .env   # if .env.example exists; otherwise create .env from scratch
```

Then fill in `.env` with at minimum:

```bash
DATABASE_URL=postgres://postgres:local@localhost:5432/sf_media
SESSION_SECRET=any-random-string-for-local-dev
APP_BASE_URL=http://localhost:5000
```

Optional vars unlock specific features (see [DEPLOYMENT.md](./DEPLOYMENT.md#environment-variables) for the full list). For most local work you can leave third-party keys empty and the corresponding features just won't work — most code paths degrade gracefully when a key is missing.

> **AI features need `GEMINI_API_KEY`**. Without it, brand voice analysis, post generation, and image generation all fail. If you're working on AI features, get a key from https://aistudio.google.com/app/apikey.

---

## Day-to-day commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Starts the dev server on `http://localhost:5000`. Express runs the API; Vite is mounted as middleware so the client has HMR. **Server code does not auto-reload — kill and restart for server changes.** |
| `npm run check` | TypeScript typecheck (`tsc`) across client + server + shared. |
| `npm run build` | Production build: Vite (client) + esbuild (server bundle). Output: `dist/public/` and `dist/index.cjs`. |
| `npm start` | Run the production build locally: `NODE_ENV=production node dist/index.cjs`. |
| `npm run db:push` | Sync `shared/schema.ts` to your local DB (drizzle-kit push). Same command runs automatically on prod boot. |

Useful patterns:

- **First-time DB setup**: after creating an empty Postgres database and setting `DATABASE_URL`, just run `npm run dev` — `runDrizzlePush()` auto-creates every table.
- **After pulling new schema changes**: usually nothing — the next `npm run dev` runs drizzle-push on boot. If something looks off, run `npm run db:push` manually.
- **Wiping local DB**: drop and recreate the database, then start the server. Don't try to delete tables individually — the FK chain is finicky.

---

## Project layout (quick reference)

| Path | Purpose |
|------|---------|
| [client/src/](../client/src/) | React SPA (Vite) |
| [client/src/pages/](../client/src/pages/) | Route components — see [FEATURES.md](./FEATURES.md) |
| [client/src/components/ui/](../client/src/components/ui/) | shadcn/ui primitives — don't edit unless needed |
| [server/](../server/) | Express API |
| [shared/schema.ts](../shared/schema.ts) | **Single source of truth** for DB schema, Zod validators, constants |
| [docs/](.) | This documentation |
| [migrations/](../migrations/) | Hand-written SQL (gitignored — drizzle-push handles real syncs) |

A more annotated layout is in [README.md § Repository layout](./README.md#repository-layout).

---

## Code conventions

### 1. Schema is the source of truth

**Don't hand-write types** that Drizzle can derive. Examples:

```ts
// ✗ Don't:
type BrandProfile = { id: number; companyName: string; ... };

// ✓ Do — import from shared schema:
import type { BrandProfile } from "@shared/schema";
// (which is: typeof brandProfiles.$inferSelect)
```

**Don't hand-write Zod schemas** for table fields when an auto-generated one exists. Use `insertBrandProfileSchema`, `insertCampaignSchema`, etc.

### 2. Storage interface, not Drizzle imports in routes

```ts
// ✗ Don't (in a route handler):
import { db, campaigns } from "@/db";
const result = await db.select().from(campaigns).where(eq(campaigns.id, id));

// ✓ Do:
import { storage } from "@/storage";
const campaign = await storage.getCampaign(id);
```

If `storage` doesn't have the method you need, *add it to `IStorage` and `DatabaseStorage`* — don't bypass the interface.

### 3. Thin route handlers

A typical route is six lines:

```ts
app.post("/api/campaigns",
  requireAuth,
  requirePermission("CAMPAIGN", "customize"),
  async (req, res) => {
    const data = createCampaignSchema.parse(req.body);     // 1. validate
    const campaign = await storage.createCampaign(data);   // 2. persist
    res.status(201).json(campaign);                        // 3. respond
  }
);
```

If a route grows past 30 lines, factor the business logic into a service module (see `server/stripe.ts`, `server/x.ts`, `server/image-service.ts`).

### 4. Permission gates at the edge

Use `requireAuth` + `requirePermission(MODULE, ACTION)` middleware on the route. **Never** re-check permissions inside a function called by the route — that's a layering mistake and makes auditing harder.

### 5. No hand-edited migrations

Add a column to `shared/schema.ts`, restart the dev server, and `drizzle-kit push --force` syncs the DB. No migration files needed.

For destructive changes that drizzle-push can't safely auto-apply (column drops, type narrowing, splitting tables), write explicit SQL inside [server/db.ts](../server/db.ts) `runStartupMigrations()` so it runs idempotently on boot in every environment.

### 6. Prefer existing components

Before adding a new component, search [client/src/components/](../client/src/components/) and [client/src/components/ui/](../client/src/components/ui/). Common building blocks (Dialog, Select, Card, Form, Input) already exist as shadcn primitives. The custom layer (post-detail-dialog, image-editor, rich-text-editor, etc.) is reusable too.

### 7. Comments

Default to writing no comments. The schema file, type names, and Zod validators are usually enough. When you do comment, explain *why* something is non-obvious — never the *what*. Avoid task-specific comments ("added for X feature", "fixes bug Y") since those rot.

---

## Frontend conventions

- **Routing**: wouter via `<Route>` + `useLocation()` / `useSearch()`. No React Router.
- **Server state**: TanStack React Query keyed by URL path. Mutate via `useMutation`; invalidate by query key.
- **Auth**: `useAuth()` from `hooks/use-auth.tsx`. Check `user` for null before accessing fields.
- **Permissions**: `usePermissions()` for `hasPermission(module, action)`, `canAccess(module)`, `isAdmin()`. Mirror server checks.
- **Quotas**: `useQuota()` for `aiPostsRemaining`, `isAtAiLimit`, `canSchedule`, etc.
- **Toasts**: `useToast()` → `toast({ title, description, variant })`.
- **Forms**: `react-hook-form` with `zodResolver` against schemas from `@shared/schema`.
- **Theme**: `ThemeProvider` is at the root. Use Tailwind's `dark:` variant in classes.
- **Imports**: `@/` aliases `client/src/`; `@shared/` aliases `shared/`; `@assets/` aliases `attached_assets/`.

---

## Backend conventions

- **Type safety**: every route validates input with a Zod schema; no `any` in hot paths.
- **Errors**: throw `Error` for unexpected failures; the global error middleware logs and returns 500. Use `res.status(4xx).json({ message })` for expected user errors.
- **Async**: `async`/`await` everywhere — no callbacks. Never wrap a Promise in `try`/`catch` just to log and re-throw.
- **Transactions**: Drizzle exposes `db.transaction(async tx => { ... })`. Use it whenever you write to multiple tables in one logical operation.
- **Logging**: `console.log` / `console.error` with a `[module]` prefix (e.g. `[email]`, `[stripe]`, `[companion]`) so logs are greppable.
- **Side effects**: external API calls (Stripe, Gemini, Cloudinary, social platforms) live in dedicated service modules, never inlined in route handlers.

---

## Commit style

The repo uses Conventional Commits — see `git log` for examples. Prefix with one of:

- `feat:` — new feature
- `fix:` — bug fix
- `chore:` — refactor, cleanup, dependency bump, doc-only change
- `docs:` — documentation only
- `refactor:` — internal change with no functional difference
- `perf:` — performance improvement
- `test:` — test changes only

Subject line: under 70 chars, imperative mood, no period. Body (optional): wrap at 72 chars; explain *why*, not *what*.

Example:

```
feat: add per-organization custom CTA types

Brand profiles can now define a list of custom call-to-action
labels alongside the six built-in options. Custom CTAs are managed
on the Brand Voice page and during onboarding, and can also be added
inline from the campaign creation dropdown via "+ Add custom CTA".
```

Avoid:

- Mentioning the AI assistant or pair programmer in the message.
- "fixed bug" — explain *which* bug and *what surfaced it*.
- Trailing summaries of files changed (the diff already shows that).

---

## Branching & deployment

- **Main branch is `development`.** Push to `development` → auto-deploys to Production via GitHub Actions.
- **Feature work** can happen on a topic branch, then merge into `development`. There's no `main` or `staging` branch in active use.
- **No PR review enforcement** in the repo settings today — relies on team discipline.
- **Hotfix path**: same as normal — push a fix to `development` and let the pipeline ship it. Total time from commit to live: ~3–6 minutes.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the pipeline detail and rollback procedure.

---

## Troubleshooting

### "Drizzle push exits with code 1 on boot"

Usually a destructive schema change drizzle-kit refused to auto-apply. Read the `[drizzle-push]` log lines for the rejected migration. Either:

- Adjust `shared/schema.ts` so the change becomes additive.
- Or write the migration explicitly inside `runStartupMigrations()` in [server/db.ts](../server/db.ts) and gate it with `IF NOT EXISTS` / `IF EXISTS` clauses so it's idempotent.

### "Companion uploads return 401 mid-pick"

`COMPANION_SECRET` likely changed between request start and finish. Check Azure config didn't get rotated. If you really need to rotate, expect users in mid-pick to need to retry.

### "OAuth redirect goes to the wrong host"

`APP_BASE_URL` is missing or wrong. Set it to the public URL (with `https://`, no trailing slash). Verify by hitting `/api/health-equivalent` (e.g. any auth-required endpoint) and watching the log:

```
[email] Outgoing email links will use base URL: https://sfmedia.com
```

### "`Validation failed`" on a route I just changed

You added a field to the Zod schema or made an existing one stricter. Either the client isn't sending the field or the value doesn't match. Open DevTools Network tab → click the failing request → look at the `errors` field in the JSON response — Zod returns a flattened path/message map.

### "AI features all returning 500"

`GEMINI_API_KEY` missing or invalid. Check `.env` and Azure config. If valid, you may have hit Gemini's rate limit — back off and retry.

### "TypeScript errors I didn't introduce"

The repo has known pre-existing TS errors (mostly Drizzle type narrowing in `server/storage.ts` and a few `string | string[]` ones from `req.params.x` in `server/routes.ts`). They don't block the build (esbuild ignores them). If your new error is at a line you didn't touch and matches the pre-existing patterns, you can ignore it; otherwise, fix it.

### "Cloudinary upload silently fails"

Check `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` are all set. The SDK throws unhelpful errors when one is missing.

---

## Useful one-liners

```bash
# Reset local DB completely (Docker container)
docker exec -it sfmedia-postgres psql -U postgres -c "DROP DATABASE sf_media; CREATE DATABASE sf_media;"

# Verify environment is ready
node -v && psql -V && cat .env | grep -E "^(DATABASE_URL|SESSION_SECRET|APP_BASE_URL)" | wc -l   # should print 3

# Find every TODO/FIXME in the codebase
grep -rn "TODO\|FIXME" client/src server shared --exclude-dir=node_modules

# Find every API route in one place
grep -nE "app\.(get|post|patch|delete|put)" server/routes.ts | head -50
```

---

## Cross-references

- Architecture overview: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Schema reference: [DATA_MODEL.md](./DATA_MODEL.md)
- API reference: [API.md](./API.md)
- Page inventory and user flows: [FEATURES.md](./FEATURES.md)
- Deploy pipeline: [DEPLOYMENT.md](./DEPLOYMENT.md)
