# SF Media

AI-powered social media campaign platform. Marketers and agencies define their brand voice once, then generate platform-optimized posts (LinkedIn, X, Instagram, Facebook), schedule them, publish them to live accounts, and track engagement — all from a single workspace.

Live: **https://sfmedia.com**

## Documentation

All documentation lives in **[`docs/`](./docs/)**.

| Read this if you are… | Start here |
|-----------------------|------------|
| Evaluating the product or writing a pitch | [docs/BUSINESS.md](./docs/BUSINESS.md) |
| New engineer onboarding | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) → [docs/DEV_SETUP.md](./docs/DEV_SETUP.md) |
| Building a feature on the API | [docs/API.md](./docs/API.md) |
| Working with the DB schema | [docs/DATA_MODEL.md](./docs/DATA_MODEL.md) |
| Wiring a new page or UX flow | [docs/FEATURES.md](./docs/FEATURES.md) |
| Shipping changes to production | [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) |

The full index with reading guidance is in [**docs/README.md**](./docs/README.md).

## Quick start

```bash
git clone https://github.com/irtazamanzoor21/SF-Media.git
cd SF-Media
npm install
cp .env.example .env   # edit with at least DATABASE_URL, SESSION_SECRET, APP_BASE_URL
npm run dev
```

App runs at **http://localhost:5000**. Full setup with prerequisites and troubleshooting is in [docs/DEV_SETUP.md](./docs/DEV_SETUP.md).

## Stack

React 18 + TypeScript + Vite (frontend) · Express 5 + Node 22 (backend) · PostgreSQL 16 + Drizzle ORM · Google Gemini (AI) · Cloudinary (images) · Stripe (billing) · Azure App Service (hosting) · GitHub Actions (CI/CD).

## Repository layout

```
client/    React SPA (Vite)
server/    Express API
shared/    Drizzle schema + Zod validators + constants — single source of truth
docs/      Documentation (you are here)
script/    Build pipeline
scripts/   Operational helpers
```

## Deploying

Push to `development` → GitHub Actions auto-deploys to Azure Production. See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).
