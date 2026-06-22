# Deployment

How Spring Post ships to production and what to know about operating it.

---

## Topology

| Where | What |
|-------|------|
| **Source repository** | `github.com/Building-Agents/spring-post`, branch `development` |
| **CI/CD** | GitHub Actions → [.github/workflows/development_social-app.yml](../.github/workflows/development_social-app.yml) |
| **Build** | Azure App Service Oryx auto-build (`npm install` → `npm run build`) |
| **Runtime** | Azure App Service "Social-app", slot "Production" (Linux container, Node 22) |
| **Public URL** | https://springpost.buildingagents.ai |
| **Database** | PostgreSQL 16 (managed by team's provider) |

There is **no staging slot**. A push to `development` deploys directly to Production. Treat the push as the go-live action.

---

## Deploy pipeline (push → live)

1. Developer pushes to `origin/development`.
2. GitHub Actions workflow fires:
   - **build job** — checkout, setup Node 22.x, upload entire repo as artifact (~1–2 min).
   - **deploy job** — download artifact, login to Azure via federated identity (no shared secrets), `azure/webapps-deploy@v3` to "Social-app" Production slot (~2–4 min).
3. Azure App Service runs Oryx:
   - `npm install` (production deps + devDeps because `build` script needs them)
   - `npm run build` → produces `dist/index.cjs` (server) and `dist/public/` (client)
4. Process restart: Azure runs `npm start` → `NODE_ENV=production node dist/index.cjs`.
5. **On boot**, [server/startup.ts](../server/startup.ts) `runDrizzlePush()` spawns `npx drizzle-kit push --force` to sync the DB schema from `shared/schema.ts`. Then [server/db.ts](../server/db.ts) `runStartupMigrations()` applies idempotent SQL for things drizzle-push can't handle safely.
6. Server binds to `PORT` (5000) and starts serving traffic.

Total wall time from push to live: typically **3–6 minutes**.

---

## Environment variables

All env vars live in **Azure App Service → Configuration → Application Settings**. Changes there cause an automatic restart of the App Service.

### Core (required)

| Variable | Purpose | Notes |
|----------|---------|-------|
| `DATABASE_URL` | PostgreSQL connection string | Standard `postgres://user:pass@host:port/db?sslmode=require` |
| `SESSION_SECRET` | Session cookie signing key | Random 32+ char string; do **not** rotate without expecting a forced re-login of all users |
| `APP_BASE_URL` | Public app URL | Required for OAuth redirects, email links, and Companion (e.g. `https://springpost.buildingagents.ai`) — **without this, FB/IG OAuth and Companion uploads break** |

### Optional but recommended

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | Set to `production` in Azure (already configured) — enables secure cookies, Companion `sameSite=none` |
| `PORT` | Defaults to 5000 |
| `COMPANION_HOST` | Override for Companion's externally-visible host; usually not needed if `APP_BASE_URL` is set |

### AI (Gemini)

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | Required for AI brand voice analysis, campaign generation, image generation, brainstorm. Without this, all AI features fail. |

### Authentication (Google OAuth)

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` | Google OAuth client id (Sign in with Google) |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `SUPER_ADMIN_SETUP_TOKEN` | One-time token used by `/setup` page to bootstrap the first super admin. Unset after initial setup. |

### Email (SendGrid)

| Variable | Purpose |
|----------|---------|
| `SENDGRID_API_KEY` | SendGrid API key for SMTP relay |
| `SENDGRID_FROM_EMAIL` | From address (defaults to `hello@springpost.co`) |

### Image storage (Cloudinary)

| Variable | Purpose |
|----------|---------|
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | API key |
| `CLOUDINARY_API_SECRET` | API secret |

### Payments (Stripe)

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Stripe secret API key (`sk_live_…` in production) |
| `STRIPE_PUBLISHABLE_KEY` | Public key for client-side embedding (if used) |
| `STRIPE_WEBHOOK_SECRET` | Endpoint signing secret — **mandatory**, otherwise webhook signature verification fails and subscription state won't update |

> **Webhook configuration**: in the Stripe Dashboard, point the webhook at `https://springpost.buildingagents.ai/api/webhook/stripe` and subscribe to: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `charge.refunded`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

### Companion (file uploads from Google Drive / OneDrive / Unsplash)

| Variable | Purpose |
|----------|---------|
| `COMPANION_SECRET` | **Critical** — HMAC secret used to sign auth tokens passed between OAuth callback and Uppy client. Must be stable across restarts; if it rotates, in-flight pickers fail with 401. |
| `COMPANION_GOOGLE_KEY` / `COMPANION_GOOGLE_SECRET` | Google Drive OAuth app credentials |
| `COMPANION_ONEDRIVE_KEY` / `COMPANION_ONEDRIVE_SECRET` | Microsoft Azure AD app credentials (for OneDrive) |
| `COMPANION_UNSPLASH_KEY` | Unsplash API key |

> **Operational gotcha**: Spring Post sets `app.set("trust proxy", 1)` so that `req.hostname` reads `X-Forwarded-Host` (Azure's external hostname), not the internal probe hostname. Without this, OAuth redirect URLs would be wrong and Companion 401s would happen on every cloud-import. This is already configured.

### Social platforms

| Variable | Purpose |
|----------|---------|
| `FACEBOOK_APP_ID` | Facebook OAuth app ID |
| `FACEBOOK_APP_SECRET` | Facebook OAuth secret |
| `LINKEDIN_CLIENT_ID` | LinkedIn OAuth 2.0 client ID |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn OAuth secret |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | X OAuth 2.0 (with PKCE) credentials |
| `X_API_KEY` / `X_API_SECRET` | X API v2 (rare; OAuth 1.0a fallback) |
| `X_OAUTH1_TOKEN` / `X_OAUTH1_TOKEN_SECRET` | Optional manual OAuth 1.0a tokens for testing |

### Market intelligence (DataForSEO)

| Variable | Purpose |
|----------|---------|
| `DATAFORSEO_LOGIN` | DataForSEO username |
| `DATAFORSEO_PASSWORD` | DataForSEO password |

### Quick reference

The minimum to boot a working app: `DATABASE_URL`, `SESSION_SECRET`, `APP_BASE_URL`. Everything else degrades a specific feature.

---

## Schema sync on boot

Production never runs `npm run db:push` manually. [server/startup.ts](../server/startup.ts) does it on every server start:

```
[startup] Running drizzle-kit push...
[drizzle-push] Reading config from drizzle.config.ts
[drizzle-push] Reading schema files...
[drizzle-push] Pulling schema from database...
[drizzle-push] Changes applied
[startup] drizzle-kit push completed successfully.
```

Behavior:

- **Additive changes** (new column, new table, new index) — applied automatically.
- **Destructive changes** (dropping columns, type changes) — drizzle-kit may prompt; the `--force` flag suppresses prompts and may apply them silently. Be careful with these — write explicit SQL in [server/db.ts](../server/db.ts) `runStartupMigrations()` instead.
- **If push fails**, the server boots anyway — the failure is logged but doesn't block startup. This is intentional so a partial deploy doesn't 500 the whole app, but it means you must check logs for `[startup] drizzle-kit push exited with code N` after every deploy.

---

## Monitoring & logs

### Where to look

- **Azure Portal → App Service "Social-app" → Log stream** — live tail. Useful for verifying boot.
- **Azure Portal → Diagnose and solve problems** — Application Logs / Failures / Restarts.
- **Application Insights** (if wired up) — request latency, exception traces.
- **GitHub Actions runs** — https://github.com/Building-Agents/spring-post/actions for deploy success/failure.

### Markers to grep on every deploy

| Marker | Meaning |
|--------|---------|
| `[startup] Running drizzle-kit push...` | Schema sync started |
| `[startup] drizzle-kit push completed successfully.` | Schema sync OK |
| `[startup] drizzle-kit push exited with code N` | Schema sync failed (investigate) |
| `[email] Outgoing email links will use base URL: https://...` | `APP_BASE_URL` resolved correctly |
| `[email] APP_BASE_URL / APP_URL is not set...` | **Misconfiguration — outbound emails will link to localhost** |
| `[companion] config:` | Companion config dump (verify keys are loaded) |
| `[companion] ⚠ ...` | OAuth issue — usually means missing or rotated `COMPANION_SECRET` |

### Health checks

There is currently no `/api/health` endpoint. Azure relies on default startup detection (waits for the process to bind to `PORT`). If you add a health check, set Azure → Configuration → "Health check path" to it.

---

## Rollback

The fastest rollback is a `git revert`:

```bash
git revert HEAD
git push origin development
```

This triggers another GitHub Actions run with the previous commit's code. Total time to rollback: ~3–6 minutes (same as a deploy).

For an even-faster rollback without a code change:

- Azure Portal → App Service "Social-app" → **Deployment Center** → pick a previous successful deploy → **Redeploy**.

> **DB rollback caveat**: `drizzle-kit push --force` only adds columns when the schema declares them. If you revert a code change that *added* a column, the column stays in the DB (orphan but harmless). To actually drop a column, write explicit SQL.

---

## Operational gotchas

1. **Server doesn't auto-reload.** `tsx server/index.ts` (dev) and `node dist/index.cjs` (prod) both require a restart for code changes. Editing in Azure's File Editor without restarting won't pick anything up.
2. **`APP_BASE_URL` must match the public URL.** If it's missing or wrong, OAuth redirects, email links, and Companion all fail. Symptom: users get 401s in Google Drive picker; emails contain `localhost` URLs.
3. **`COMPANION_SECRET` rotations break in-flight uploads.** Anyone mid-cloud-pick when the secret rotates gets 401. Schedule rotations during off-hours or warn users.
4. **`STRIPE_WEBHOOK_SECRET` must match the Stripe Dashboard.** If the secret was rotated in Stripe but not updated in Azure, every webhook returns 400 and subscription state stops updating. Symptom: trials don't auto-upgrade after checkout.
5. **Drizzle push silently applies destructive changes when `--force` is set.** Review schema diffs in PR before merging — never let a column drop sneak through.
6. **Multer uses memory storage.** No temp files on disk, but a 50MB upload eats 50MB of RAM. Azure App Service has tight memory limits; oversized uploads can cause OOM restarts. Cloudinary direct-upload is preferred for anything large.
7. **One Express process — no background queue.** Stripe webhooks, AI generation streams, and metric sync all run in the request lifecycle. A 90-second AI generation holds the connection open for 90 seconds.

---

## Secrets hygiene

- **No secrets in the repo.** `.env` is gitignored. Production env vars live in Azure App Service config.
- **GitHub Actions** uses Azure federated identity (OIDC) — no client secrets stored in GitHub. The workflow file references `secrets.AZUREAPPSERVICE_CLIENTID_…` etc., which Azure provisions automatically.
- **DB connection string** lives only in Azure config and developers' local `.env` files.
- **PATs in `git remote`**: developer machines may have a GitHub PAT embedded in `origin` URL for convenience (`https://ghp_…@github.com/…`). This is a per-developer preference; CI does not use it.

---

## Cross-references

- Tech stack and how the pieces fit together: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Local dev setup with the same env vars: [DEV_SETUP.md](./DEV_SETUP.md)
- Schema being synced on boot: [DATA_MODEL.md](./DATA_MODEL.md)
- Webhook endpoint and per-route auth: [API.md](./API.md)
