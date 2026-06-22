# Spring Post — Documentation

**Spring Post** is an AI-powered social media campaign platform. Marketers and agencies define their brand voice once, then generate platform-optimized posts (LinkedIn, X, Instagram, Facebook), schedule them, publish them to live accounts, and track engagement — all from a single workspace.

This is the canonical documentation for the project. Use the index below to jump to what you need.

---

## Read this first

| If you are… | Start here |
|-------------|------------|
| Evaluating the product or writing a pitch | [BUSINESS.md](./BUSINESS.md) |
| New engineer onboarding to the codebase | [ARCHITECTURE.md](./ARCHITECTURE.md) → [DEV_SETUP.md](./DEV_SETUP.md) |
| Building a feature that touches the API | [API.md](./API.md) |
| Building a feature that touches the DB | [DATA_MODEL.md](./DATA_MODEL.md) |
| Wiring a new page or UX flow | [FEATURES.md](./FEATURES.md) |
| Shipping changes to production | [DEPLOYMENT.md](./DEPLOYMENT.md) |

---

## Documentation index

### Business

- **[BUSINESS.md](./BUSINESS.md)** — What Spring Post does, who it's for, value proposition, supported platforms, pricing tiers, and quotas. Also covers compliance (Meta App Review, privacy, ToS).

### Engineering

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Tech stack (React + Express + Postgres on Azure), monorepo layout, key design patterns, authentication & authorization model, multi-tenancy, AI integrations, streaming generation, and how the pieces fit together.
- **[DATA_MODEL.md](./DATA_MODEL.md)** — Every database table with full column reference, foreign keys, indexes, and Drizzle relations. Covers identity, RBAC, brand profiles, campaigns, posts, metrics, media, social connections, subscriptions, market intelligence, and admin audit logs.
- **[API.md](./API.md)** — Every HTTP endpoint grouped by feature (auth, onboarding, campaigns, posts, media, metrics, RBAC, social publishing, billing, super admin, market intelligence, Companion uploads). Lists method, path, auth requirement, request body, and response shape.
- **[FEATURES.md](./FEATURES.md)** — Page-by-page UX inventory with user-facing behavior; six end-to-end user journeys (signup → first campaign, teammate invite, social connect & publish, subscription upgrade, super-admin org creation, metrics tracking); reusable component and hook reference.

### Operations

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Azure App Service deploy pipeline (push to `development` → GitHub Actions → Azure), environment variable reference, schema-sync-on-startup, rollback strategy, and monitoring.
- **[DEV_SETUP.md](./DEV_SETUP.md)** — Prerequisites, local environment setup, the dev/build/typecheck commands, code conventions, and commit/branch policy.

---

## At a glance

| Aspect | Stack |
|--------|-------|
| Frontend | React 18 + TypeScript + Vite + Tailwind + shadcn/ui + TanStack React Query |
| Backend | Node.js 22 + Express 5 + TypeScript (tsx in dev, esbuild bundle in prod) |
| Database | PostgreSQL via Drizzle ORM |
| AI | Google Gemini 2.5 Flash (text + image) |
| Image storage | Cloudinary CDN |
| Email | SendGrid SMTP via Nodemailer |
| Payments | Stripe (subscriptions + webhooks) |
| File uploads | Uppy + Companion (Google Drive, OneDrive, Unsplash) |
| Hosting | Azure App Service (slot: Production) |
| CI/CD | GitHub Actions on push to `development` |

---

## Repository layout

```
spring-post/
├── client/           # React SPA (Vite)
│   └── src/
│       ├── pages/         # Route components
│       ├── components/    # Reusable UI (shadcn primitives in components/ui/)
│       ├── hooks/         # Custom React hooks (auth, permissions, quota)
│       └── lib/           # API client, query setup, utilities
├── server/           # Express API
│   ├── routes.ts          # All HTTP routes (~3500 lines)
│   ├── storage.ts         # IStorage interface + DatabaseStorage impl
│   ├── permissions.ts     # RBAC middleware (requireAuth, requirePermission)
│   ├── startup.ts         # Drizzle push + custom SQL on boot
│   ├── db.ts              # Postgres connection + startup migrations
│   ├── stripe.ts          # Subscription + webhook handling
│   ├── x.ts, linkedin.ts, facebook.ts  # Per-platform publishing
│   ├── email.ts           # Transactional email
│   ├── image-service.ts   # Gemini image gen + Cloudinary upload
│   └── competitor-analysis.ts  # DataForSEO integration
├── shared/           # Code shared between client and server
│   └── schema.ts          # Drizzle tables + Zod schemas + constants (single source of truth)
├── migrations/       # SQL migration files (.gitignored — drizzle-kit push runs on boot)
├── script/           # Build script (esbuild + Vite)
├── scripts/          # Shell scripts (post-merge hook, etc.)
├── docs/             # ← You are here
├── .github/workflows/  # GHA deploy pipeline
├── Dockerfile
├── package.json
├── drizzle.config.ts
├── vite.config.ts
└── tsconfig.json
```

---

## Conventions

- **Single source of truth for types**: [shared/schema.ts](../shared/schema.ts) defines every DB table, Zod validator, and shared constant. Frontend and backend both import from `@shared/schema`. Never hand-write a type that the schema can derive.
- **Storage interface**: All DB access goes through `IStorage` ([server/storage.ts](../server/storage.ts)) — routes never import Drizzle directly. This keeps routes testable and lets us swap storage implementations.
- **Thin route handlers**: Routes parse input with a Zod schema, call the storage interface, return the result. Business logic lives in service modules (`stripe.ts`, `x.ts`, `image-service.ts`, etc.) when it gets non-trivial.
- **Permission gates at the edge**: Every protected route uses `requireAuth` first, then `requirePermission(MODULE, ACTION)` for fine-grained RBAC. Never check permissions inside business logic.
- **No hand-edited migrations**: The DB schema is reconciled from `shared/schema.ts` via `drizzle-kit push --force` on every server boot. Add columns to the schema and they appear in the DB on next deploy.

---

## Getting help

- Build issues, type errors, weird local-only failures → [DEV_SETUP.md](./DEV_SETUP.md) troubleshooting section.
- Production incident or deploy question → [DEPLOYMENT.md](./DEPLOYMENT.md).
- "Where does feature X live?" → [FEATURES.md](./FEATURES.md) page inventory + [ARCHITECTURE.md](./ARCHITECTURE.md) module map.
