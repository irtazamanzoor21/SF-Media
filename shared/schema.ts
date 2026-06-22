import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, integer, jsonb, timestamp, serial, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const MODULES = [
  "CAMPAIGN",
  "CALENDAR",
  "BRAND_VOICE",
  "MEDIA_LIBRARY",
  "TEAM_MANAGEMENT",
  "BILLING",
  "ANALYTICS",
] as const;

export const ACTIONS = [
  "view",
  "customize",
] as const;

export const SYSTEM_ROLES = ["super_admin", "admin", "creator"] as const;

export type ModuleKey = (typeof MODULES)[number];
export type ActionKey = (typeof ACTIONS)[number];
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const DEFAULT_CREATOR_PERMISSIONS: { module: ModuleKey; action: ActionKey }[] = [
  { module: "CAMPAIGN", action: "view" },
  { module: "CAMPAIGN", action: "customize" },
  { module: "CALENDAR", action: "view" },
  { module: "CALENDAR", action: "customize" },
  { module: "BRAND_VOICE", action: "view" },
  { module: "MEDIA_LIBRARY", action: "view" },
  { module: "MEDIA_LIBRARY", action: "customize" },
];

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password"),
  googleId: text("google_id"),
  profileImage: text("profile_image"),
  organizationId: integer("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  onboardingStep: integer("onboarding_step").default(0).notNull(),
  systemRole: text("system_role").default("creator"),
  blocked: boolean("blocked").default(false).notNull(),
  mustChangePassword: boolean("must_change_password").default(false).notNull(),
  invitationToken: text("invitation_token").unique(),
  invitationExpiresAt: timestamp("invitation_expires_at"),
  tier: text("tier").notNull().default("trial"),
  tierAssignedAt: timestamp("tier_assigned_at"),
  accountStatus: text("account_status").notNull().default("active"),
  trialExpiresAt: timestamp("trial_expires_at"),
  billingCustomerRef: text("billing_customer_ref"),
  trialResetHistory: jsonb("trial_reset_history").default([]),
  emailVerifiedAt: timestamp("email_verified_at"),
  createdAt: timestamp("created_at"),
  deletedAt: timestamp("deleted_at"),
}, (table) => ({
  organizationIdIdx: index("users_organization_id_idx").on(table.organizationId),
}));

export const ACCOUNT_STATUSES = ["active", "expired", "suspended", "canceled", "deleted"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const organizations = pgTable("organizations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  suspended: boolean("suspended").default(false).notNull(),
  accountStatus: text("account_status").notNull().default("active"),
  tier: text("tier").notNull().default("trial"),
  tierAssignedAt: timestamp("tier_assigned_at"),
  trialExpiresAt: timestamp("trial_expires_at"),
  billingCustomerId: text("billing_customer_id"),
  trialResetHistory: jsonb("trial_reset_history").$type<string[]>().default([]),
  trialEmailsSent: jsonb("trial_emails_sent").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});

export const organizationMembers = pgTable("organization_members", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  roleId: integer("role_id").references(() => roles.id, { onDelete: "set null" }),
  systemRole: text("system_role").notNull().default("creator"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  isBlocked: boolean("is_blocked").notNull().default(false),
}, (table) => ({
  oneOrganizationPerUser: uniqueIndex("organization_members_user_id_unique").on(table.userId),
}));

export const roles = pgTable("roles", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  isDefault: boolean("is_default").default(false).notNull(),
  isProtected: boolean("is_protected").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const rolePermissions = pgTable("role_permissions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  roleId: integer("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  module: text("module").notNull(),
  action: text("action").notNull(),
  granted: boolean("granted").default(true).notNull(),
});

export const roleAuditLogs = pgTable("role_audit_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetUserId: integer("target_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const otpCodes = pgTable("otp_codes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: text("email").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false).notNull(),
});

export const brandProfiles = pgTable("brand_profiles", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: integer("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  companyName: text("company_name").notNull(),
  industry: text("industry").notNull(),
  websiteUrl: text("website_url"),
  brandSummary: text("brand_summary"),
  targetAudience: text("target_audience"),
  messagingPillars: text("messaging_pillars").array(),
  toneStyle: text("tone_style"),
  doLanguageRules: text("do_language_rules").array(),
  dontLanguageRules: text("dont_language_rules").array(),
  ctaPreferences: text("cta_preferences").array(),
  customCtas: text("custom_ctas").array(),
  hashtagThemes: text("hashtag_themes").array(),
  rawBrandVoiceJson: jsonb("raw_brand_voice_json"),
  sampleLinkedinPost: text("sample_linkedin_post"),
  sampleInstagramPost: text("sample_instagram_post"),
}, (table) => ({
  organizationIdUnique: uniqueIndex("brand_profiles_organization_id_unique")
    .on(table.organizationId)
    .where(sql`${table.organizationId} IS NOT NULL`),
}));

export const campaigns = pgTable("campaigns", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: integer("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  companyName: text("company_name").notNull(),
  description: text("description").notNull(),
  platforms: text("platforms").array().notNull(),
  tone: text("tone").notNull(),
  postsCount: integer("posts_count").notNull(),
  callToAction: text("call_to_action").notNull(),
  scheduledAt: timestamp("scheduled_at"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  organizationIdIdx: index("campaigns_organization_id_idx").on(table.organizationId),
}));

export const campaignPosts = pgTable("campaign_posts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  postIdentifier: text("post_identifier"),
  platform: text("platform").notNull(),
  content: text("content").notNull(),
  imagePrompt: text("image_prompt"),
  imageUrl: text("image_url"),
  imageUrls: text("image_urls").array().default([]),
  contentVersions: text("content_versions").array().default([]),
  order: integer("order").notNull().default(0),
  scheduledAt: timestamp("scheduled_at"),
  sources: jsonb("sources").$type<{ keywords: (string | { keyword: string; intent: string; angle: string; searchVolume: number })[]; domains: string[] }>(),
  platformPostId: text("platform_post_id"),
  platformPostUrl: text("platform_post_url"),
});

export const postMetrics = pgTable("post_metrics", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  postId: integer("post_id").notNull().references(() => campaignPosts.id, { onDelete: "cascade" }),
  impressions: integer("impressions").notNull().default(0),
  reach: integer("reach").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  saves: integer("saves").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const postMetricSnapshots = pgTable("post_metric_snapshots", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  postId: integer("post_id").notNull().references(() => campaignPosts.id, { onDelete: "cascade" }),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  impressions: integer("impressions").notNull().default(0),
  reach: integer("reach").notNull().default(0),
  saves: integer("saves").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
});

export const mediaFolders = pgTable("media_folders", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mediaFiles = pgTable("media_files", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  folderId: integer("folder_id").references(() => mediaFolders.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  size: integer("size").notNull().default(0),
  mimeType: text("mime_type").notNull().default("image/png"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mediaFoldersRelations = relations(mediaFolders, ({ one, many }) => ({
  user: one(users, { fields: [mediaFolders.userId], references: [users.id] }),
  files: many(mediaFiles),
}));

export const mediaFilesRelations = relations(mediaFiles, ({ one }) => ({
  user: one(users, { fields: [mediaFiles.userId], references: [users.id] }),
  folder: one(mediaFolders, { fields: [mediaFiles.folderId], references: [mediaFolders.id] }),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  roles: many(roles),
  auditLogs: many(roleAuditLogs),
  brandProfiles: many(brandProfiles),
  campaigns: many(campaigns),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  user: one(users, { fields: [organizationMembers.userId], references: [users.id] }),
  organization: one(organizations, { fields: [organizationMembers.organizationId], references: [organizations.id] }),
  role: one(roles, { fields: [organizationMembers.roleId], references: [roles.id] }),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  organization: one(organizations, { fields: [roles.organizationId], references: [organizations.id] }),
  permissions: many(rolePermissions),
  members: many(organizationMembers),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
}));

export const roleAuditLogsRelations = relations(roleAuditLogs, ({ one }) => ({
  organization: one(organizations, { fields: [roleAuditLogs.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [roleAuditLogs.userId], references: [users.id] }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  brandProfile: one(brandProfiles, {
    fields: [users.id],
    references: [brandProfiles.userId],
  }),
  campaigns: many(campaigns),
  organizationMemberships: many(organizationMembers),
}));

export const brandProfilesRelations = relations(brandProfiles, ({ one }) => ({
  user: one(users, {
    fields: [brandProfiles.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [brandProfiles.organizationId],
    references: [organizations.id],
  }),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  user: one(users, {
    fields: [campaigns.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [campaigns.organizationId],
    references: [organizations.id],
  }),
  posts: many(campaignPosts),
}));

export const campaignPostsRelations = relations(campaignPosts, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [campaignPosts.campaignId],
    references: [campaigns.id],
  }),
  metrics: many(postMetrics),
  snapshots: many(postMetricSnapshots),
}));

export const postMetricsRelations = relations(postMetrics, ({ one }) => ({
  post: one(campaignPosts, {
    fields: [postMetrics.postId],
    references: [campaignPosts.id],
  }),
}));

export const postMetricSnapshotsRelations = relations(postMetricSnapshots, ({ one }) => ({
  post: one(campaignPosts, {
    fields: [postMetricSnapshots.postId],
    references: [campaignPosts.id],
  }),
}));

export const insertUserSchema = createInsertSchema(users);
export const insertOtpSchema = createInsertSchema(otpCodes);
export const insertBrandProfileSchema = createInsertSchema(brandProfiles);
export const insertCampaignSchema = createInsertSchema(campaigns).omit({ createdAt: true });

// Campaign augmented with how many of its posts are actually published (platformPostId set).
// The Campaigns list uses this to show a live "Published" status instead of "Draft".
export type CampaignWithPublishState = Campaign & { publishedPostsCount: number };
export const insertCampaignPostSchema = createInsertSchema(campaignPosts);
export const insertPostMetricsSchema = createInsertSchema(postMetrics).omit({ uploadedAt: true });
export const insertPostMetricSnapshotSchema = createInsertSchema(postMetricSnapshots).omit({ recordedAt: true });
export const insertMediaFolderSchema = createInsertSchema(mediaFolders).omit({ createdAt: true });
export const insertMediaFileSchema = createInsertSchema(mediaFiles).omit({ createdAt: true });
export const insertOrganizationSchema = createInsertSchema(organizations).omit({ createdAt: true });
export const insertOrganizationMemberSchema = createInsertSchema(organizationMembers).omit({ joinedAt: true });
export const insertRoleSchema = createInsertSchema(roles).omit({ createdAt: true });
export const insertRolePermissionSchema = createInsertSchema(rolePermissions);
export const insertRoleAuditLogSchema = createInsertSchema(roleAuditLogs).omit({ createdAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertOtp = z.infer<typeof insertOtpSchema>;
export type OtpCode = typeof otpCodes.$inferSelect;
export type InsertBrandProfile = z.infer<typeof insertBrandProfileSchema>;
export type BrandProfile = typeof brandProfiles.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaignPost = z.infer<typeof insertCampaignPostSchema>;
export type CampaignPost = typeof campaignPosts.$inferSelect;
export type InsertPostMetrics = z.infer<typeof insertPostMetricsSchema>;
export type PostMetrics = typeof postMetrics.$inferSelect;
export type InsertPostMetricSnapshot = z.infer<typeof insertPostMetricSnapshotSchema>;
export type PostMetricSnapshot = typeof postMetricSnapshots.$inferSelect;
export type InsertMediaFolder = z.infer<typeof insertMediaFolderSchema>;
export type MediaFolder = typeof mediaFolders.$inferSelect;
export type InsertMediaFile = z.infer<typeof insertMediaFileSchema>;
export type MediaFile = typeof mediaFiles.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganizationMember = z.infer<typeof insertOrganizationMemberSchema>;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof roles.$inferSelect;
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type InsertRoleAuditLog = z.infer<typeof insertRoleAuditLogSchema>;
export type RoleAuditLog = typeof roleAuditLogs.$inferSelect;

// Rejects strings that are empty or contain only whitespace. Apply to required
// free-text fields so "   " can't slip past a min-length check (8 spaces has
// length 8). Pass the field's display label so the message reads naturally.
export function nonBlank(label: string, base: z.ZodString = z.string()) {
  return base.refine((val) => val.trim().length > 0, {
    message: `${label} cannot be empty or contain only spaces.`,
  });
}

// Validates a website URL the user can type with or without a scheme
// (e.g. "acme.com" or "https://acme.com"). Rejects blanks, internal
// whitespace, and hostnames that aren't a dotted domain ("asdf", "localhost").
// Works in both the browser and Node (URL is global in both).
export function isValidWebsiteUrl(value: string | undefined | null): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return /^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(new URL(candidate).hostname);
  } catch {
    return false;
  }
}

export const loginSchema = z.object({
  email: z.string().email(),
  password: nonBlank("Password", z.string().min(6)),
});

export const registerSchema = z.object({
  fullName: nonBlank("Full name", z.string().min(2)),
  email: z.string().email(),
  password: nonBlank("Password", z.string().min(6)),
});

export const companyInfoSchema = z.object({
  companyName: nonBlank("Company name", z.string().min(1)),
  industry: nonBlank("Industry", z.string().min(1)),
});

export const brandProfileUpdateSchema = z.object({
  brandSummary: z.string().optional(),
  targetAudience: z.string().optional(),
  messagingPillars: z.array(z.string()).optional(),
  toneStyle: z.string().optional(),
  doLanguageRules: z.array(z.string()).optional(),
  dontLanguageRules: z.array(z.string()).optional(),
  ctaPreferences: z.array(z.string()).optional(),
  customCtas: z.array(nonBlank("Custom CTA", z.string().min(1).max(80))).optional(),
  hashtagThemes: z.array(z.string()).optional(),
});

export const createCampaignSchema = z.object({
  companyName: nonBlank("Company name", z.string().min(1)),
  description: nonBlank("Description", z.string().min(1)),
  platforms: z.array(z.enum(["linkedin", "x", "instagram", "facebook"])).min(1),
  tone: z.enum(["professional", "casual", "energetic", "friendly", "witty"]),
  postsCount: z.number().int().min(1).max(5),
  callToAction: nonBlank("Call to action", z.string().min(1).max(80)),
  scheduledAt: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
});

export const campaignParseRequestSchema = z.object({
  prompt: nonBlank("Prompt", z.string().min(3).max(2000)),
});

export const campaignParseResponseSchema = z.object({
  description: z.string().min(1).max(1000),
  platforms: z.array(z.enum(["linkedin", "x", "instagram", "facebook"])).min(1),
  tone: z.enum(["professional", "casual", "energetic", "friendly", "witty"]),
  postsCount: z.number().int().min(1).max(5),
  callToAction: z.string().min(1).max(80),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  defaultedFields: z.array(z.string()),
});

export type CampaignParseResponse = z.infer<typeof campaignParseResponseSchema>;

export const campaignChatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(4000),
  })).min(1).max(30),
});

// Lenient response shape for the conversational chat. Unlike the one-shot
// `campaignParseResponseSchema`, this is allowed to be PARTIAL during the
// chat — the AI may legitimately not know the platforms yet on turn 1 and
// would return platforms: []. The server fills sensible defaults before the
// review card is shown (when ready is true).
export const campaignChatResponseSchema = z.object({
  description: z.string().max(1000).default(""),
  platforms: z.array(z.enum(["linkedin", "x", "instagram", "facebook"])).default([]),
  tone: z.enum(["professional", "casual", "energetic", "friendly", "witty"]).nullable().optional(),
  // Nullable (not .default(3)) so "not specified yet" is detectable —
  // a defaulted 3 would be indistinguishable from a user-chosen 3.
  postsCount: z.number().int().min(1).max(5).nullable().optional(),
  callToAction: z.string().max(80).default(""),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  defaultedFields: z.array(z.string()).default([]),
  // ready and nextField are computed server-side from the captured state;
  // the extraction model no longer returns them.
  ready: z.boolean().default(false),
  nextField: z
    .enum(["description", "platforms", "tone", "postsCount", "callToAction", "schedule"])
    .nullable()
    .default(null),
});

export type CampaignChatResponse = z.infer<typeof campaignChatResponseSchema>;

// Per-post AI feedback refinement. The /refine route returns a preview
// (caption text and/or image as a data URL); the /refine/apply route
// commits whichever pieces the user chose to keep.
export const refineTargetSchema = z.enum(["content", "image", "both"]);
export type RefineTarget = z.infer<typeof refineTargetSchema>;

export const refinePostRequestSchema = z.object({
  feedback: nonBlank("Feedback", z.string().min(1).max(1000)),
  target: refineTargetSchema,
});
export type RefinePostRequest = z.infer<typeof refinePostRequestSchema>;

export const refinePostResponseSchema = z.object({
  newContent: z.string().optional(),
  newImageBase64: z.string().optional(),
  newImagePrompt: z.string().optional(),
});
export type RefinePostResponse = z.infer<typeof refinePostResponseSchema>;

export const refineApplyRequestSchema = z.object({
  newContent: z.string().max(10000).optional(),
  newImageBase64: z.string().optional(),
  newImagePrompt: z.string().max(4000).optional(),
}).refine(
  (data) => data.newContent !== undefined || data.newImageBase64 !== undefined,
  { message: "At least one of newContent or newImageBase64 is required" },
);
export type RefineApplyRequest = z.infer<typeof refineApplyRequestSchema>;

export const PLATFORMS = ["linkedin", "x", "instagram", "facebook"] as const;
export const TONES = ["professional", "casual", "energetic", "friendly", "witty"] as const;
export const DEFAULT_CTAS = ["Learn More", "Shop Now", "Signup", "Get Started", "Contact Us", "Download Now"] as const;
export const CTAS = DEFAULT_CTAS;

export function buildCtaOptions(customCtas: readonly string[] | null | undefined): {
  defaults: readonly string[];
  customs: string[];
  all: string[];
} {
  const defaults = DEFAULT_CTAS;
  const seen = new Set<string>(defaults.map((c) => c.toLowerCase()));
  const customs: string[] = [];
  for (const raw of customCtas ?? []) {
    const value = raw?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    customs.push(value);
  }
  return { defaults, customs, all: [...defaults, ...customs] };
}

export const PLATFORM_SETTINGS = {
  linkedin: {
    label: "LinkedIn",
    characterLimit: 3000,
    recommendedLength: "100-200 words",
    hashtagLimit: 5,
    hashtagTip: "Use 3-5 industry-relevant hashtags",
    imageWidth: 1200,
    imageHeight: 627,
    imageAspectRatio: "1200x627" as const,
    imageLabel: "1200 x 627 px (landscape)",
  },
  x: {
    label: "X (Twitter)",
    characterLimit: 280,
    recommendedLength: "Under 280 characters",
    hashtagLimit: 3,
    hashtagTip: "Use 1-3 hashtags max, integrated into the text",
    imageWidth: 1200,
    imageHeight: 675,
    imageAspectRatio: "1200x675" as const,
    imageLabel: "1200 x 675 px (16:9)",
  },
  instagram: {
    label: "Instagram",
    characterLimit: 2200,
    recommendedLength: "50-150 words",
    hashtagLimit: 30,
    hashtagTip: "Use 8-15 relevant hashtags at the end of the caption",
    imageWidth: 1080,
    imageHeight: 1080,
    imageAspectRatio: "1080x1080" as const,
    imageLabel: "1080 x 1080 px (square)",
  },
  facebook: {
    label: "Facebook",
    characterLimit: 63206,
    recommendedLength: "100-250 words",
    hashtagLimit: 5,
    hashtagTip: "Use 2-3 hashtags, keep them natural in the text",
    imageWidth: 1200,
    imageHeight: 630,
    imageAspectRatio: "1200x630" as const,
    imageLabel: "1200 x 630 px (landscape)",
  },
} as const;

export type PlatformKey = keyof typeof PLATFORM_SETTINGS;

export const INDUSTRIES = [
  "Technology",
  "Healthcare",
  "Finance & Banking",
  "E-commerce & Retail",
  "Education",
  "Real Estate",
  "Marketing & Advertising",
  "Food & Beverage",
  "Travel & Hospitality",
  "Fashion & Beauty",
  "Sports & Fitness",
  "Entertainment & Media",
  "Non-Profit",
  "Legal",
  "Consulting",
  "Manufacturing",
  "Automotive",
  "Energy & Utilities",
  "Agriculture",
  "Other",
] as const;

export const marketIntelligence = pgTable("market_intelligence", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  targetDomain: text("target_domain"),
  seedKeywords: text("seed_keywords").array().default([]),
  discoveredCompetitors: jsonb("discovered_competitors").default([]),
  keywordInsights: jsonb("keyword_insights").default([]),
  lastRefreshedAt: timestamp("last_refreshed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const marketIntelligenceRelations = relations(marketIntelligence, ({ one }) => ({
  organization: one(organizations, { fields: [marketIntelligence.organizationId], references: [organizations.id] }),
}));

export const insertMarketIntelligenceSchema = createInsertSchema(marketIntelligence).omit({ createdAt: true });
export type InsertMarketIntelligence = z.infer<typeof insertMarketIntelligenceSchema>;
export type MarketIntelligence = typeof marketIntelligence.$inferSelect;

export const TIER_TYPES = ["trial", "founder", "professional", "enterprise"] as const;
export type TierType = (typeof TIER_TYPES)[number];

// Inert: subscriptions/billing removed. Kept only because it is written during
// core org creation; never used for billing. (subscription_plans table dropped.)
export const organizationSubscriptions = pgTable("organization_subscriptions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  planId: integer("plan_id"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  billingCustomerId: text("billing_customer_id"),
  status: text("status").notNull().default("trialing"),
  tier: text("tier").notNull().default("trial"),
  tierAssignedAt: timestamp("tier_assigned_at"),
  billingInterval: text("billing_interval"),
  trialStartedAt: timestamp("trial_started_at"),
  trialEndsAt: timestamp("trial_ends_at"),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  canceledAt: timestamp("canceled_at"),
  gracePeriodEndsAt: timestamp("grace_period_ends_at"),
  trialResetHistory: jsonb("trial_reset_history").default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const organizationSubscriptionsRelations = relations(organizationSubscriptions, ({ one }) => ({
  organization: one(organizations, { fields: [organizationSubscriptions.organizationId], references: [organizations.id] }),
}));

export const insertOrganizationSubscriptionSchema = createInsertSchema(organizationSubscriptions).omit({ createdAt: true });

export type InsertOrganizationSubscription = z.infer<typeof insertOrganizationSubscriptionSchema>;
export type OrganizationSubscription = typeof organizationSubscriptions.$inferSelect;

export const socialConnections = pgTable("social_connections", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull().default("facebook"),
  userAccessToken: text("user_access_token"),
  pageId: text("page_id"),
  pageName: text("page_name"),
  pageAccessToken: text("page_access_token"),
  igUserId: text("ig_user_id"),
  igUsername: text("ig_username"),
  linkedinId: text("linkedin_id"),
  linkedinName: text("linkedin_name"),
  linkedinOrganizationId: text("linkedin_organization_id"),
  linkedinOrganizationName: text("linkedin_organization_name"),
  xId: text("x_id"),
  xUsername: text("x_username"),
  xAccessToken: text("x_access_token"),
  xRefreshToken: text("x_refresh_token"),
  xTokenExpiresAt: timestamp("x_token_expires_at"),
  xOauth1Token: text("x_oauth1_token"),
  xOauth1TokenSecret: text("x_oauth1_token_secret"),
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
});

export const scheduledSocialPosts = pgTable("scheduled_social_posts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  campaignPostId: integer("campaign_post_id").references(() => campaignPosts.id, { onDelete: "set null" }),
  platform: text("platform").notNull().default("facebook"),
  pageId: text("page_id").notNull(),
  pageName: text("page_name").notNull(),
  pageAccessToken: text("page_access_token").notNull(),
  igUserId: text("ig_user_id"),
  message: text("message").notNull(),
  imageUrl: text("image_url"),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: text("status").notNull().default("pending"),
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const socialConnectionsRelations = relations(socialConnections, ({ one }) => ({
  user: one(users, { fields: [socialConnections.userId], references: [users.id] }),
}));

export const scheduledSocialPostsRelations = relations(scheduledSocialPosts, ({ one }) => ({
  user: one(users, { fields: [scheduledSocialPosts.userId], references: [users.id] }),
  campaignPost: one(campaignPosts, { fields: [scheduledSocialPosts.campaignPostId], references: [campaignPosts.id] }),
}));

export const insertSocialConnectionSchema = createInsertSchema(socialConnections).omit({ connectedAt: true });
export const insertScheduledSocialPostSchema = createInsertSchema(scheduledSocialPosts).omit({ createdAt: true });

export type InsertSocialConnection = z.infer<typeof insertSocialConnectionSchema>;
export type SocialConnection = typeof socialConnections.$inferSelect;
export type InsertScheduledSocialPost = z.infer<typeof insertScheduledSocialPostSchema>;
export type ScheduledSocialPost = typeof scheduledSocialPosts.$inferSelect;

export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id").notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;

export const createOrganizationSchema = z.object({
  name: nonBlank("Organization name", z.string().min(1).max(100)),
});

export const createRoleSchema = z.object({
  name: nonBlank("Role name", z.string().min(1).max(100)),
  description: z.string().max(500).optional(),
  permissions: z.array(z.object({
    module: z.enum(MODULES),
    action: z.enum(ACTIONS),
    granted: z.boolean(),
  })),
});

export const updateRoleSchema = z.object({
  name: nonBlank("Role name", z.string().min(1).max(100)).optional(),
  description: z.string().max(500).optional(),
  permissions: z.array(z.object({
    module: z.enum(MODULES),
    action: z.enum(ACTIONS),
    granted: z.boolean(),
  })).optional(),
});

export const assignRoleSchema = z.object({
  roleId: z.number().int().nullable(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  systemRole: z.enum(["admin", "creator"]),
  // Accept null (client sometimes serializes "no custom role" as null) in addition
  // to undefined. The route handler treats both as "use the org's default role".
  roleId: z.number().int().positive().nullable().optional(),
});

export type PermissionEntry = {
  module: ModuleKey;
  action: ActionKey;
  granted: boolean;
};

export const REMINDER_FREQUENCIES = ["daily", "weekly", "monthly"] as const;
export type ReminderFrequency = (typeof REMINDER_FREQUENCIES)[number];

export const notificationPreferences = pgTable("notification_preferences", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  approvalRemindersEnabled: boolean("approval_reminders_enabled").default(true).notNull(),
  approvalReminderFrequency: text("approval_reminder_frequency").default("weekly").notNull(),
  approvalReminderLastSentAt: timestamp("approval_reminder_last_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userOrgUnique: uniqueIndex("notification_preferences_user_org_unique").on(table.userId, table.organizationId),
}));

export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreferences = typeof notificationPreferences.$inferInsert;

export const notificationPreferencesUpdateSchema = z.object({
  approvalRemindersEnabled: z.boolean().optional(),
  approvalReminderFrequency: z.enum(REMINDER_FREQUENCIES).optional(),
});

export const schedulerRuns = pgTable("scheduler_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  kind: text("kind").notNull().unique(),
  lastRunAt: timestamp("last_run_at"),
});

export type SchedulerRun = typeof schedulerRuns.$inferSelect;
