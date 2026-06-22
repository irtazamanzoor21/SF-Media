# Meta App Review — Submission Notes

Paste-ready text for each permission you need to submit. Meta's reviewers read this and watch your screencast against it; keep language literal and match what the video shows.

---

## Permissions to submit (keep only these — delete the rest)

1. `pages_show_list`
2. `pages_manage_posts`
3. `pages_read_engagement`
4. `business_management`
5. `instagram_basic`
6. `instagram_content_publish`
7. `instagram_manage_insights`

`public_profile` is default — no submission needed. Drop every other item currently in your review list.

---

## Per-permission use-case text

### pages_read_engagement

**How will your app use this permission?**
CampaignAI syncs engagement metrics (reactions, comments, shares, impressions, reach, clicks) from Facebook Page posts that users published through our app. Users connect their Facebook account via our OAuth flow, select a Page they admin, and then publish campaign posts. After publication our metrics-sync feature calls the Graph API with the stored Page access token to read engagement counts and displays them in the campaign analytics dashboard. We use reactions.summary(true), comments.summary(true), and the insights edge for post_impressions, post_impressions_unique, and post_clicks.

**Step-by-step instructions to test:**
1. Sign up at [your-prod-domain] and verify email.
2. Create a brand profile (upload any PDF).
3. Create a campaign targeting Facebook.
4. Click "Connect Facebook" under Social Accounts → authorize with a test user → select a Facebook Page.
5. Publish one of the generated posts to Facebook via the "Post Now" button.
6. Return to the campaign → click "Sync Metrics".
7. Observe engagement counts (likes, comments, shares, impressions, reach, clicks) appear on the post card.

---

### pages_manage_posts

**How will your app use this permission?**
Our app publishes marketing content to Facebook Pages on behalf of the user. After the user connects their Facebook account and selects a Page they administer, CampaignAI's scheduler/publisher calls POST /{page-id}/feed or POST /{page-id}/photos to create posts with the message and image the user approved in the campaign editor.

**Step-by-step instructions to test:**
1. Sign in → Connect Facebook → select a Page.
2. In any campaign, click "Post Now" on a generated post.
3. Observe the post appearing on the connected Facebook Page.

---

### pages_show_list

**How will your app use this permission?**
To let the user pick which Page they want CampaignAI to publish to, we call GET /me/accounts during the OAuth callback and present the list of Pages the user administers in the Social Accounts setup screen.

**Step-by-step instructions to test:**
1. Sign in → Social Accounts → Connect Facebook.
2. After the FB OAuth consent, the app displays the list of Pages the test user admins for selection.

---

### business_management

**How will your app use this permission?**
Some users manage their Pages through Business Manager rather than personally, so those Pages do not appear in /me/accounts. We call /me/businesses?fields=owned_pages{...} to surface Business-owned Pages so enterprise/agency users can still pick the right target Page.

**Step-by-step instructions to test:**
1. Sign in with a test user whose Page is owned via a Business.
2. Connect Facebook.
3. Verify the Business-owned Page appears in the selectable list.

---

### instagram_basic

**How will your app use this permission?**
To read the Instagram Business Account linked to the connected Facebook Page (username, id) so we can target that IG account for publishing.

**Step-by-step instructions to test:**
1. Connect Facebook → select a Page that has a linked IG Business Account.
2. Click "Connect Instagram" on the same screen.
3. Verify the IG username appears as "Connected".

---

### instagram_content_publish

**How will your app use this permission?**
Publishes approved campaign posts to the user's connected Instagram Business Account via the Content Publishing API (create container → publish).

**Step-by-step instructions to test:**
1. Connect Instagram (see instagram_basic flow).
2. On an IG-platform post in a campaign, click "Post Now".
3. Verify the image appears on the Instagram Business Account.

---

### instagram_manage_insights

**How will your app use this permission?**
Syncs Instagram post insights (impressions, reach, saves, etc.) back into the campaign analytics dashboard, same flow as the Facebook metrics sync.

**Step-by-step instructions to test:**
1. Publish an IG post via the app.
2. Click "Sync Metrics" on the campaign.
3. Verify insights populate on the post card.

---

## Screencast shot list

Record ONE continuous video (3–5 min). Meta rejects choppy edits. Shoot in this order — each permission must be visibly used:

1. **Sign up & sign in** (0:00–0:30) — shows the auth flow, covers public_profile.
2. **Connect Facebook** (0:30–1:15) — OAuth consent screen visible, scrolling through granted permissions list. Covers the *grant* of every FB permission.
3. **Page selection** (1:15–1:45) — shows a dropdown/list of Pages. Covers `pages_show_list` + `business_management`.
4. **Connect Instagram** (1:45–2:15) — IG OAuth, landing back on Social Accounts with IG username. Covers `instagram_basic`.
5. **Publish a post to FB** (2:15–2:45) — click Post Now, show the post live on the Page. Covers `pages_manage_posts`.
6. **Publish a post to IG** (2:45–3:15) — same, IG. Covers `instagram_content_publish`.
7. **Sync Metrics** (3:15–4:00) — shows engagement counts appearing on both FB and IG post cards. Covers `pages_read_engagement` + `instagram_manage_insights`.

Upload to YouTube as Unlisted and paste the URL in the submission form.

---

## Pre-submission checklist

- [ ] Business Verification completed (Settings → Basic → Business Verification). Without this, Advanced Access requests for `pages_read_engagement` auto-reject.
- [ ] Privacy Policy URL public + live at a stable URL (Settings → Basic).
- [ ] Data Deletion Instructions URL public + live.
- [ ] App Icon uploaded (1024×1024).
- [ ] App Category set appropriately (Business & Pages).
- [ ] Valid App Domain added matching the production deployment.
- [ ] A test user with the described flows already set up; include their credentials in the submission notes.
- [ ] Remove the 10 unused permissions from the review queue before submitting — reviewers reject bundles where listed permissions are not used in the screencast.

---

## Expected outcome

Review typically takes 3–14 days for apps without prior approvals. Rejection is common on first attempt (~60% of apps) — usually because the screencast doesn't clearly show the permission being granted *and* used. If rejected, the rejection email cites which permission failed and why; re-record just that segment and resubmit.

Until approval, the app is locked in Development mode and only app-role users (Admin/Developer/Tester) can authenticate. End users will see a "This app is in development mode" error.
