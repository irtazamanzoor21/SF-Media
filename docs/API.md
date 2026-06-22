# API Reference

All HTTP endpoints exposed by the Express server. Routes are defined in [server/routes.ts](../server/routes.ts) (~3,500 lines), with a few platform-specific helpers in [server/x.ts](../server/x.ts), [server/linkedin.ts](../server/linkedin.ts), [server/facebook.ts](../server/facebook.ts), [server/instagram.ts](../server/instagram.ts), and [server/stripe.ts](../server/stripe.ts).

> Conventions: paths starting with `/api/` are JSON; the `/companion/*` mount handles file uploads via Uppy Companion's own protocol; `/api/webhook/stripe` uses raw-body parsing for signature verification.

---

## Middleware reference

Middleware is defined in [server/permissions.ts](../server/permissions.ts).

| Function | Behavior |
|----------|----------|
| `requireAuth` | 401 if `req.session.userId` is missing |
| `requirePermission(module, action)` | 403 unless the user's role grants the (module, action) pair. `super_admin` and `admin` bypass. |
| `requireAdmin` | 403 unless user is org admin or `super_admin` |
| `requireSuperAdmin` | 403 unless `users.systemRole === "super_admin"` |
| `requireNotBlocked` | 403 if `users.blocked === true` |
| `getUserOrgContext(userId)` | Helper: returns `{ user, organization, membership, role }` |

Other middleware:

- **Multer**: `mediaUpload.single("file")` for binary uploads (in-memory), `csvUpload.single("file")` for metric CSVs.
- **Stripe webhook**: `express.raw({ type: "application/json" })` so signature verification has the unmodified body.
- **Uppy Companion**: mounted at `/companion` with its own internal middleware; see [server/companion.ts](../server/companion.ts).

---

## Auth & sessions

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/register` | none | Create account. Body: `registerSchema`. → `{ user }` + session cookie |
| POST | `/api/login` | none | Email/password login. Body: `loginSchema`. → `{ user }` + session cookie |
| POST | `/api/logout` | none | Clear session. → `{ message }` |
| GET | `/api/user` | none | Current user (or 401 if not logged in). → `{ user: { id, email, fullName, tier, systemRole, organizationId } }` |
| POST | `/api/auth/request-reset-otp` | none | Send password-reset OTP to email. Body: `{ email }`. → `{ message }` |
| POST | `/api/auth/verify-reset-otp` | none | Verify OTP. Body: `{ email, otp }`. → `{ resetToken }` |
| POST | `/api/auth/reset-password` | none | Complete reset. Body: `{ resetToken, password }`. → `{ message }` |
| POST | `/api/user/change-password` | requireAuth | Change own password. Body: `{ currentPassword, newPassword }` |
| POST | `/api/auth/verify-email-token` | none | Verify email signup token. Body: `{ token }`. → `{ user }` |
| GET | `/api/auth/google` | none | Initiate Google OAuth. Redirect → Google consent |
| GET | `/api/auth/google/callback` | none | OAuth callback. Query: `code`, `state`. Sets session, redirects to app |
| POST | `/api/admin/login` | none | Super admin login (separate session). Body: `{ email, password }` |
| GET | `/api/admin/me` | none | Current super admin (separate session). → `{ user }` |

---

## Onboarding

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| PATCH | `/api/onboarding/step` | requireAuth | Save progress. Body: `{ step, data? }` |
| POST | `/api/onboarding/extract-content` | requireAuth | Extract text from uploaded files (PDF/DOCX/TXT) and/or website URL. Body: multipart `files`, optional `url`. → `{ extractions: [{ source, text, unreachable? }] }` |
| POST | `/api/onboarding/analyze-brand` | requireAuth | Run Gemini brand analysis on extracted text. Body: `{ companyName, industry, extractedText, url }`. → `{ brandVoice, tone, uniqueProps, keyMessages }` |
| POST | `/api/onboarding/save-brand-profile` | requireAuth | Persist profile + complete onboarding. Body: full brand profile shape. → `{ profile }` |

---

## Brand profile & AI voice

| Method | Path | Auth | Permission | Purpose |
|--------|------|------|------------|---------|
| GET | `/api/brand-profile` | requireAuth | `BRAND_VOICE.view` | → `{ profile }` |
| PATCH | `/api/brand-profile` | requireAuth | `BRAND_VOICE.customize` | Update fields. Body: `brandProfileUpdateSchema`. → `{ profile }` |
| POST | `/api/brainstorm` | requireAuth | `MEDIA_LIBRARY.customize` | Generate campaign ideas. Body: `{ topic?, platforms?, count?, tone? }`. → `{ ideas: string[] }` |

---

## Campaigns

`POST /api/campaigns` and the two add-posts/generate-images routes return **Server-Sent Events**, not JSON. Stream chunks:

```
data: {"type":"status","message":"Generating linkedin post 1..."}\n\n
data: {"type":"post","post":{...}}\n\n
data: {"type":"image","postId":N,"imageUrl":"https://..."}\n\n
data: {"type":"complete","campaignId":N}\n\n
```

| Method | Path | Auth | Permission | Purpose |
|--------|------|------|------------|---------|
| POST | `/api/campaigns` | requireAuth | `CAMPAIGN.customize` | Create campaign + generate posts/images (SSE). Body: `createCampaignSchema` |
| GET | `/api/campaigns` | requireAuth | `CAMPAIGN.view` | List campaigns. Query: `status?`, `page?`, `limit?` |
| GET | `/api/campaigns/:id` | requireAuth | `CAMPAIGN.view` | Campaign detail with posts |
| DELETE | `/api/campaigns/:id` | requireAuth | `CAMPAIGN.customize` | Delete campaign (cascades to posts) |
| POST | `/api/campaigns/:id/add-posts` | requireAuth | `CAMPAIGN.customize` | Add more posts (SSE). Body: `{ platforms[], postsCount, tone? }` |
| POST | `/api/campaigns/:id/generate-images` | requireAuth | `CAMPAIGN.customize` | Regenerate images for posts (SSE). Body: `{ postIds[]? }` |

### Campaign posts

| Method | Path | Auth | Permission | Purpose |
|--------|------|------|------------|---------|
| PATCH | `/api/campaigns/:id/posts/:postId` | requireAuth | `CAMPAIGN.customize` | Edit post content. Body: `{ content, tone? }` |
| DELETE | `/api/campaigns/:id/posts/:postId` | requireAuth | `CAMPAIGN.customize` | Delete post |
| POST | `/api/campaigns/:id/posts/:postId/regenerate-image` | requireAuth | `CAMPAIGN.customize` | Regenerate AI image. Body: `{ prompt? }` |
| PATCH | `/api/campaigns/:id/posts/:postId/attach-image` | requireAuth | `CAMPAIGN.customize` | Attach existing media to post. Body: `{ fileId }` |
| PATCH | `/api/campaigns/:id/posts/:postId/remove-image` | requireAuth | `CAMPAIGN.customize` | Remove image from post |
| POST | `/api/posts/:postId/link-url` | requireAuth | `CAMPAIGN.customize` | Add tracking URL. Body: `{ url, trackingCode? }` |

---

## Calendar & scheduling

| Method | Path | Auth | Permission | Purpose |
|--------|------|------|------------|---------|
| GET | `/api/calendar/posts` | requireAuth | `CALENDAR.view` | All scheduled posts. Query: `startDate?`, `endDate?` |
| PATCH | `/api/campaigns/:id/posts/:postId/schedule` | requireAuth | `CALENDAR.customize` | Schedule post. Body: `{ scheduledAt: ISO8601 }` |

---

## Media library

| Method | Path | Auth | Permission | Purpose |
|--------|------|------|------------|---------|
| GET | `/api/media/folders` | requireAuth | `MEDIA_LIBRARY.view` | List folders |
| POST | `/api/media/folders` | requireAuth | `MEDIA_LIBRARY.customize` | Create. Body: `{ name, parentId? }` |
| PATCH | `/api/media/folders/:id` | requireAuth | — | Rename/recolor. Body: `{ name?, color? }` |
| DELETE | `/api/media/folders/:id` | requireAuth | — | Delete folder + files |
| GET | `/api/media/files` | requireAuth | `MEDIA_LIBRARY.view` | List files. Query: `folderId?`, `search?` |
| POST | `/api/media/files/upload` | requireAuth | — | Direct upload. Multipart `file` |
| POST | `/api/media/files/generate` | requireAuth | `MEDIA_LIBRARY.customize` | Generate AI image. Body: `{ prompt, style?, width?, height? }` |
| PATCH | `/api/media/files/:id/move` | requireAuth | — | Move to folder. Body: `{ folderId }` |
| DELETE | `/api/media/files/:id` | requireAuth | — | Delete file |
| POST | `/api/ai-edit-image` | requireAuth | `MEDIA_LIBRARY.customize` | Apply AI edit. Body: `{ imageUrl, prompt }`. → `{ imageUrl, editedUrl }` |
| POST | `/api/upload-edited-image` | requireAuth | — | Save edited image. Multipart `file`, optional `campaignId`/`postId` |

---

## Post metrics & analytics

| Method | Path | Auth | Permission | Purpose |
|--------|------|------|------------|---------|
| GET | `/api/campaigns/:id/metrics/sample-csv` | requireAuth | `CAMPAIGN.view` | Download CSV template |
| POST | `/api/campaigns/:id/metrics/upload-csv` | requireAuth | `CAMPAIGN.customize` | Import metrics CSV. Multipart `file` |
| GET | `/api/campaigns/:id/metrics` | requireAuth | `CAMPAIGN.view` | Aggregated metrics |
| POST | `/api/campaigns/:id/metrics/sync` | requireAuth | `CAMPAIGN.view` | Sync from social platforms |
| GET | `/api/posts/:postId/metric-snapshots` | requireAuth | `CAMPAIGN.view` | Historical snapshots for trend chart |
| GET | `/api/posts/:postId/metrics` | requireAuth | `CAMPAIGN.view` | Post metrics |
| POST | `/api/posts/:postId/metrics/refresh` | requireAuth | `CAMPAIGN.view` | Refresh from platform |

---

## Organizations & RBAC

| Method | Path | Auth | Permission | Purpose |
|--------|------|------|------------|---------|
| GET | `/api/organizations/current` | requireAuth | — | Current org |
| POST | `/api/organizations` | requireAuth | — | Create org. Body: `createOrganizationSchema` |
| GET | `/api/roles` | requireAuth | — | List roles in current org |
| POST | `/api/roles` | requireAuth | requireAdmin | Create role. Body: `createRoleSchema` |
| PATCH | `/api/roles/:id` | requireAuth | requireAdmin | Update role |
| DELETE | `/api/roles/:id` | requireAuth | requireAdmin | Delete (must reassign members first) |
| GET | `/api/organization/members` | requireAuth | — | List members with roles |
| POST | `/api/organization/members/invite` | requireAuth | requireAdmin | Invite by email. Body: `inviteMemberSchema`. → `{ invite: { token, inviteeEmail } }` |
| GET | `/api/invite/verify` | none | — | Pre-signup verify. Query: `token` |
| POST | `/api/invite/accept` | none | — | Accept invite + set password. Body: `{ token, password, fullName }` |
| PATCH | `/api/organization/members/:userId/role` | requireAuth | requireAdmin | Reassign role. Body: `assignRoleSchema` |
| DELETE | `/api/organization/members/invite/:userId` | requireAuth | requireAdmin | Revoke pending invite |
| PATCH | `/api/organization/members/:userId/block` | requireAuth | requireAdmin | Block member. Body: `{ blocked: boolean }` |
| DELETE | `/api/organization/members/:userId` | requireAuth | requireAdmin | Remove from org |
| GET | `/api/roles/audit-logs` | requireAuth | requireAdmin | Audit log |
| GET | `/api/user/permissions` | requireAuth | — | Current user's resolved permissions |

---

## Social publishing

### LinkedIn

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/linkedin/status` | Check connection |
| GET | `/api/linkedin/connect` | OAuth 2.0 initiate |
| GET | `/api/linkedin/callback` | OAuth callback (saves tokens) |
| DELETE | `/api/linkedin/disconnect` | Disconnect |
| POST | `/api/linkedin/post-now` | Publish. Body: `{ postId, text, imageUrl? }` |
| POST | `/api/linkedin/schedule` | Schedule. Body: `{ postId, text, imageUrl?, scheduledAt }` |

All require `requireAuth`.

### X (Twitter)

OAuth 2.0 with PKCE is the primary flow. OAuth 1.0a is supported as legacy fallback.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/x/status` | Check connection |
| GET | `/api/x/connect` | OAuth 2.0 PKCE initiate |
| GET | `/api/x/callback` | Save tokens |
| DELETE | `/api/x/disconnect` | Disconnect |
| POST | `/api/x/post-now` | Publish. Body: `{ postId, text, imageUrl? }` |
| POST | `/api/x/publish-now` | Alias for post-now |
| POST | `/api/x/schedule` | Schedule (requires X Premium). Body: `{ text, imageUrl?, scheduledAt }` |
| GET | `/api/x/oauth1/connect` | Legacy OAuth 1.0a initiate |
| GET | `/api/x/oauth1/callback` | Legacy OAuth 1.0a callback |
| POST | `/api/x/oauth1/save-tokens` | Legacy: save manually-obtained tokens |

All require `requireAuth`.

### Facebook & Instagram

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/facebook/status` | Check connection (returns `pageId`, `pageName`) |
| GET | `/api/facebook/connect` | OAuth initiate |
| GET | `/api/facebook/callback` | OAuth callback — returns Page list for selection |
| GET | `/api/facebook/pages` | List pages user can manage |
| POST | `/api/facebook/select-page` | Set active Page. Body: `{ pageId, accessToken }` |
| POST | `/api/facebook/enter-page-by-id` | Manually save Page details (for users with Business-owned Pages). Body: `{ pageId, accessToken }` |
| DELETE | `/api/facebook/disconnect` | |
| POST | `/api/facebook/post-now` | Publish to Page. Body: `{ postId, text, imageUrl?, link? }` |
| POST | `/api/facebook/schedule` | Schedule via FB native scheduling. Body: `{ postId, text, imageUrl?, scheduledAt }` |
| GET | `/api/facebook/scheduled-posts` | List scheduled posts |
| POST | `/api/facebook/scheduled-posts/:id/post-now` | Publish scheduled post immediately |
| PATCH | `/api/facebook/scheduled-posts/:id` | Update scheduled post |
| DELETE | `/api/facebook/scheduled-posts/:id` | Cancel scheduled post |
| GET | `/api/instagram/status` | IG connection status (uses linked FB Page) |
| GET | `/api/instagram/connect` | Initiate (delegates to FB OAuth) |
| POST | `/api/instagram/post-now` | Publish (single image or carousel). Body: `{ postId, imageUrls[], caption, link? }` |
| POST | `/api/instagram/schedule` | Schedule. Body: `{ postId, imageUrls[], caption, scheduledAt }` |
| GET | `/api/instagram/scheduled-posts` | List scheduled IG posts |

All require `requireAuth`.

> **Note**: Facebook + Instagram publishing requires Meta App Review approval for the relevant permissions. See [APP_REVIEW_NOTES.md](../APP_REVIEW_NOTES.md) for the submission text and screencast shot list.

---

## Subscriptions & billing

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/subscription/status` | requireAuth | Org subscription state |
| GET | `/api/subscription/quota` | requireAuth | Org usage vs limits |
| GET | `/api/subscription/plans` | none | Public price list |
| POST | `/api/subscription/create-checkout` | requireAuth | Stripe Checkout session. Body: `{ planId, interval }`. → `{ url }` |
| POST | `/api/subscription/create-portal` | requireAuth | Stripe Customer Portal session. → `{ url }` |
| POST | `/api/subscription/verify-checkout` | requireAuth | Confirm subscription after redirect. Body: `{ sessionId }` |
| POST | `/api/webhook/stripe` | none | Stripe event webhook (raw body) |

### Stripe webhook events handled

| Event | Server action |
|-------|---------------|
| `checkout.session.completed` | Mark subscription `active`, set tier, send confirmation email |
| `customer.subscription.updated` | Sync status (`active`, `past_due`, `canceled`) |
| `customer.subscription.deleted` | Mark `canceled` |
| `invoice.payment_failed` | Mark `past_due`, surface banner in UI |
| `charge.refunded` | Adjust billing credit |

---

## Market intelligence

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/organizations/:orgId/market-intelligence` | requireAuth | Fetch stored intel |
| POST | `/api/organizations/:orgId/market-intelligence/analyze` | requireAuth | Trigger analysis. Body: `{ competitorDomains[]?, keywords[]?, industry? }` |

---

## Super admin panel

All routes below require `requireAuth` + `requireSuperAdmin` (a separate session from the regular user session — see [ARCHITECTURE.md](./ARCHITECTURE.md#authentication-architecture)).

### Users & organizations

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/dashboard-stats` | Platform-wide stats (users, orgs, MRR) |
| GET | `/api/admin/organizations` | List all orgs |
| POST | `/api/admin/organizations/create` | Create org + admin user. Body: `{ name, adminEmail, adminPassword }` |
| PATCH | `/api/admin/organizations/:id` | Update org (name/tier/status) |
| DELETE | `/api/admin/organizations/:id` | Delete org and all data |
| GET | `/api/admin/organizations-details` | Orgs with billing + usage |
| PATCH | `/api/admin/organizations/:id/tier` | Override tier |
| POST | `/api/admin/organizations/:id/reset-trial` | Reset trial (logged in `tier_reset_logs`). Body: `{ trialEndsAt, reason? }` |
| GET | `/api/admin/users` | List all users |
| GET | `/api/admin/users/:id` | User detail |
| PATCH | `/api/admin/users/:id/role-override` | Set system role. Body: `{ systemRole }` |
| PATCH | `/api/admin/users/:id/block` | Block/unblock |
| PATCH | `/api/admin/users/:id/mark-onboarding` | Force mark onboarding complete |
| POST | `/api/admin/users/:id/verify-email` | Mark email verified |
| POST | `/api/admin/users/:id/deactivate` | Soft-delete user |
| POST | `/api/admin/users/:id/restore` | Restore deactivated user |

### Email management

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/admin/email/send-verification` | Trigger verification email |
| POST | `/api/admin/email/password-reset` | Trigger password reset email |

### Billing administration

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/billing-overview` | MRR, churn, LTV |
| GET | `/api/admin/organizations/:id/billing` | Billing history + invoices |
| POST | `/api/admin/organizations/:id/cancel-subscription` | Cancel subscription. Body: `{ reason? }` |
| POST | `/api/admin/organizations/:id/refund` | Refund. Body: `{ amount, reason }` |
| POST | `/api/admin/organizations/:id/billing/credit` | Add credit. Body: `{ amount, reason }` |

### Plans & quotas

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/admin/subscription-plans` | Create plan |
| GET | `/api/admin/subscription-plans` | List plans |
| PATCH | `/api/admin/subscription-plans/:id` | Update plan pricing |
| GET | `/api/admin/tier-config` | Tier definitions |
| GET | `/api/admin/tier-quota-configs` | Per-(tier, resource) limits |
| PATCH | `/api/admin/tier-quota-configs/:id` | Update a limit live |
| GET | `/api/admin/tier-reset-logs/:orgId` | Trial reset history per org |

---

## Companion / cloud uploads

The Uppy Companion server is mounted as middleware at `/companion`. Companion handles its own protocol (multipart streaming with HMAC-signed tokens) — typical clients shouldn't call it directly; they use Uppy's Companion plugin which knows the wire format.

Convenience endpoints:

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/companion/auth-token` | requireAuth | Get HMAC-signed token for Companion |
| GET | `/api/media/upload-token` | requireAuth | Get upload token for media destination |
| POST | `/api/media/files/companion-upload` | requireAuth | Finalize Companion upload + create `media_files` row. Multipart + `uppyAuthToken` |

---

## Health & utility

There is currently **no `/api/health` endpoint**. Azure App Service uses its default startup detection (waits for the process to bind to `PORT`). If you need an explicit health check, add one to [server/routes.ts](../server/routes.ts) and reference it from Azure's "Health check path" setting.

---

## Conventions

- All non-stream endpoints respond with JSON.
- Errors return HTTP 4xx/5xx with `{ message: string, [details]? }` shape.
- Validation errors return 400 with `{ message: "Validation failed", errors: ZodFlattened }`.
- Mutations require CSRF-safe content type — only `application/json` is accepted (no form posts on protected mutations).
- Session cookies are `HttpOnly`, `Secure` (in production), `SameSite=lax`. Companion's session cookie is `SameSite=none; Secure` to support the cross-site OAuth redirect chain.
- All paths are prefixed with `/api/` *except* the Stripe webhook (`/api/webhook/stripe` — same prefix), the Companion mount (`/companion`), and the static SPA serving (catch-all → `index.html`).

---

## Related docs

- Database tables: [DATA_MODEL.md](./DATA_MODEL.md)
- Architecture and auth model: [ARCHITECTURE.md](./ARCHITECTURE.md)
- User flows that exercise these endpoints: [FEATURES.md](./FEATURES.md)
- Env vars required by some endpoints (Stripe, Gemini, Cloudinary, etc.): [DEPLOYMENT.md](./DEPLOYMENT.md)
