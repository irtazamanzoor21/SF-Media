import { db } from "./db";
import { eq, desc, asc, and, or, isNull, isNotNull, inArray, count, sql } from "drizzle-orm";
import {
  users, brandProfiles, otpCodes, campaigns, campaignPosts, mediaFolders, mediaFiles,
  organizations, organizationMembers, roles, rolePermissions, roleAuditLogs, postMetrics,
  postMetricSnapshots,
  organizationSubscriptions, marketIntelligence,
  socialConnections, scheduledSocialPosts, adminAuditLogs,
  notificationPreferences, schedulerRuns,
  type User, type InsertUser,
  type NotificationPreferences, type InsertNotificationPreferences,
  type BrandProfile, type InsertBrandProfile,
  type OtpCode, type InsertOtp,
  type Campaign, type InsertCampaign,
  type CampaignPost, type InsertCampaignPost,
  type PostMetrics, type InsertPostMetrics,
  type PostMetricSnapshot, type InsertPostMetricSnapshot,
  type MediaFolder, type InsertMediaFolder,
  type MediaFile, type InsertMediaFile,
  type Organization, type InsertOrganization,
  type OrganizationMember, type InsertOrganizationMember,
  type Role, type InsertRole,
  type RolePermission, type InsertRolePermission,
  type RoleAuditLog, type InsertRoleAuditLog,
  type PermissionEntry,
  type OrganizationSubscription, type InsertOrganizationSubscription,
  type MarketIntelligence, type InsertMarketIntelligence,
  type SocialConnection, type InsertSocialConnection,
  type ScheduledSocialPost, type InsertScheduledSocialPost,
  DEFAULT_CREATOR_PERMISSIONS,
} from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  getUserByInvitationToken(token: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<User>): Promise<User>;
  deleteUser(id: number): Promise<void>;

  createOtp(otp: InsertOtp): Promise<OtpCode>;
  getOtp(email: string, code: string): Promise<OtpCode | undefined>;
  markOtpUsed(id: number): Promise<void>;
  getOtpByCode(code: string): Promise<OtpCode | undefined>;
  getOtpByEmailAndCode(email: string, code: string): Promise<OtpCode | undefined>;

  getBrandProfileByUserId(userId: number): Promise<BrandProfile | undefined>;
  getBrandProfileByOrganizationId(orgId: number): Promise<BrandProfile | undefined>;
  createBrandProfile(profile: InsertBrandProfile): Promise<BrandProfile>;
  updateBrandProfile(id: number, data: Partial<BrandProfile>): Promise<BrandProfile>;

  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  getCampaignsByUserId(userId: number): Promise<Campaign[]>;
  getCampaignsByOrganizationId(orgId: number): Promise<Campaign[]>;
  getCampaignById(id: number): Promise<Campaign | undefined>;
  getPublishedPostCountsByCampaign(campaignIds: number[]): Promise<Record<number, number>>;
  updateCampaign(id: number, data: Partial<Campaign>): Promise<Campaign>;
  deleteCampaign(id: number): Promise<void>;

  createCampaignPost(post: InsertCampaignPost): Promise<CampaignPost>;
  getCampaignPosts(campaignId: number): Promise<CampaignPost[]>;
  getCampaignPostById(postId: number): Promise<CampaignPost | undefined>;
  getAllCampaignPostsByUserId(userId: number): Promise<{ campaign: Campaign; posts: CampaignPost[] }[]>;
  getAllCampaignPostsByOrganizationId(orgId: number): Promise<{ campaign: Campaign; posts: CampaignPost[] }[]>;
  updateCampaignPost(id: number, data: Partial<CampaignPost>): Promise<CampaignPost>;
  deleteCampaignPost(id: number): Promise<void>;

  upsertPostMetrics(postId: number, data: Omit<InsertPostMetrics, 'postId'>): Promise<PostMetrics>;
  getMetricsByPostId(postId: number): Promise<PostMetrics | undefined>;
  getMetricsByCampaignId(campaignId: number): Promise<(PostMetrics & { post: CampaignPost })[]>;
  getTopPerformingPosts(userId: number, limit: number): Promise<Array<{ content: string; platform: string; impressions: number; reach: number; likes: number; comments: number; shares: number; saves: number; clicks: number; compositeScore: number }>>;
  getTopPerformingPostsByOrganizationId(orgId: number, limit: number): Promise<Array<{ content: string; platform: string; impressions: number; reach: number; likes: number; comments: number; shares: number; saves: number; clicks: number; compositeScore: number }>>;
  deletePostMetrics(postId: number): Promise<void>;

  updateCampaignPostPlatformId(postId: number, platformPostId: string, platformPostUrl?: string): Promise<CampaignPost>;
  getCampaignPostsWithPlatformIds(campaignId: number, userId?: number): Promise<CampaignPost[]>;
  createMetricSnapshot(data: InsertPostMetricSnapshot): Promise<PostMetricSnapshot>;
  getMetricSnapshotsByPostId(postId: number, limit?: number): Promise<PostMetricSnapshot[]>;

  createMediaFolder(folder: InsertMediaFolder): Promise<MediaFolder>;
  getMediaFoldersByUserId(userId: number): Promise<MediaFolder[]>;
  getMediaFolderById(id: number): Promise<MediaFolder | undefined>;
  updateMediaFolder(id: number, data: Partial<MediaFolder>): Promise<MediaFolder>;
  deleteMediaFolder(id: number): Promise<void>;

  createMediaFile(file: InsertMediaFile): Promise<MediaFile>;
  getMediaFilesByUserId(userId: number, folderId?: number | null): Promise<MediaFile[]>;
  getMediaFileById(id: number): Promise<MediaFile | undefined>;
  updateMediaFile(id: number, data: Partial<MediaFile>): Promise<MediaFile>;
  deleteMediaFile(id: number): Promise<void>;

  createOrganization(org: InsertOrganization): Promise<Organization>;
  getOrganizationById(id: number): Promise<Organization | undefined>;
  getOrganizationBySlug(slug: string): Promise<Organization | undefined>;
  updateOrganization(id: number, data: Partial<Organization>): Promise<Organization>;
  listAllOrganizations(): Promise<Organization[]>;

  createRole(role: InsertRole): Promise<Role>;
  getRoleById(id: number): Promise<Role | undefined>;
  getRolesByOrganizationId(orgId: number): Promise<Role[]>;
  getDefaultRole(orgId: number): Promise<Role | undefined>;
  updateRole(id: number, data: Partial<Role>): Promise<Role>;
  deleteRole(id: number): Promise<void>;

  setRolePermissions(roleId: number, permissions: InsertRolePermission[]): Promise<RolePermission[]>;
  getRolePermissions(roleId: number): Promise<RolePermission[]>;

  addOrganizationMember(member: InsertOrganizationMember): Promise<OrganizationMember>;
  getOrganizationMember(userId: number, orgId: number): Promise<OrganizationMember | undefined>;
  getOrganizationMembers(orgId: number): Promise<(OrganizationMember & { user: User })[]>;
  getUserOrganizations(userId: number): Promise<OrganizationMember[]>;
  updateOrganizationMember(id: number, data: Partial<OrganizationMember>): Promise<OrganizationMember>;
  removeOrganizationMember(id: number): Promise<void>;
  removeOrganizationMemberAndDeleteUser(memberId: number, userId: number): Promise<void>;
  getUsersWithRole(roleId: number): Promise<OrganizationMember[]>;

  getUserPermissions(userId: number, orgId: number): Promise<PermissionEntry[]>;

  createAuditLog(log: InsertRoleAuditLog): Promise<RoleAuditLog>;
  getAuditLogs(orgId: number, limit?: number, offset?: number): Promise<(RoleAuditLog & { user?: User })[]>;

  getOrganizationSubscription(organizationId: number): Promise<OrganizationSubscription | undefined>;
  createOrganizationSubscription(sub: InsertOrganizationSubscription): Promise<OrganizationSubscription>;
  updateOrganizationSubscription(id: number, data: Partial<OrganizationSubscription>): Promise<OrganizationSubscription>;
  getSubscriptionByStripeSubscriptionId(stripeSubId: string): Promise<OrganizationSubscription | undefined>;
  getSubscriptionByStripeCustomerId(stripeCustomerId: string): Promise<OrganizationSubscription | undefined>;

  getMarketIntelligenceByOrgId(orgId: number): Promise<MarketIntelligence | undefined>;
  upsertMarketIntelligence(orgId: number, data: Partial<InsertMarketIntelligence>): Promise<MarketIntelligence>;
  resetStuckMarketIntelligenceJobs(): Promise<number>;

  getSocialConnectionByUserId(userId: number, platform?: string): Promise<SocialConnection | undefined>;
  upsertSocialConnection(userId: number, data: Partial<InsertSocialConnection>): Promise<SocialConnection>;
  deleteSocialConnection(userId: number, platform?: string): Promise<void>;

  createScheduledSocialPost(data: InsertScheduledSocialPost): Promise<ScheduledSocialPost>;
  getScheduledSocialPostsByUserId(userId: number, platform?: string): Promise<ScheduledSocialPost[]>;
  getScheduledSocialPostById(id: number): Promise<ScheduledSocialPost | undefined>;
  updateScheduledSocialPost(id: number, data: Partial<ScheduledSocialPost>): Promise<ScheduledSocialPost>;
  deleteScheduledSocialPost(id: number): Promise<void>;
  getPendingScheduledSocialPosts(before: Date): Promise<ScheduledSocialPost[]>;

  countOrgCampaigns(orgId: number, since: Date): Promise<number>;
  countOrgScheduledPosts(orgId: number, since: Date): Promise<number>;
  countOrgSocialConnections(orgId: number): Promise<number>;
  countOrgMembers(orgId: number): Promise<number>;

  getNotificationPreferences(userId: number, orgId: number): Promise<NotificationPreferences | undefined>;
  upsertNotificationPreferences(userId: number, orgId: number, data: Partial<InsertNotificationPreferences>): Promise<NotificationPreferences>;
  getOrgAdminsForReminders(orgId: number): Promise<Array<{
    userId: number;
    email: string;
    fullName: string;
    prefs: NotificationPreferences | null;
  }>>;
  getUpcomingScheduledPostsForOrg(orgId: number, fromDate: Date, toDate: Date): Promise<Array<{
    id: number;
    content: string;
    platform: string;
    scheduledAt: Date;
    campaignId: number;
    campaignName: string;
  }>>;
  tryClaimSchedulerLease(kind: string, minIntervalMs: number): Promise<boolean>;
  countUserOrganizations(userId: number): Promise<number>;

  getAllUsersForAdmin(): Promise<(User & { organizationName?: string; organizationRole?: string; organizationId?: number })[]>;
  getOrganizationsWithDetails(): Promise<any[]>;
  deleteOrganization(orgId: number): Promise<void>;
  getAdminUserDetail(userId: number): Promise<any>;
  createAdminAuditLog(data: { adminId: number; action: string; targetType: string; targetId: number; details?: Record<string, unknown> }): Promise<void>;
  verifyUserEmail(userId: number): Promise<void>;
  deactivateUser(userId: number): Promise<void>;
  restoreUser(userId: number): Promise<void>;
  createOrganizationWithAdmin(input: {
    orgName: string;
    adminFullName: string;
    adminEmail: string;
    hashedPassword: string;
    tier: "trial" | "professional" | "enterprise" | "founder";
  }): Promise<{ org: Organization; user: User; member: OrganizationMember; subscription: OrganizationSubscription }>;
  getAdminDashboardStats(): Promise<{
    totalUsers: number;
    totalOrganizations: number;
    totalCampaigns: number;
    totalPosts: number;
    activeSubscriptions: number;
    trialingOrgs: number;
    blockedUsers: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }

  async getUserByInvitationToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.invitationToken, token));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const now = new Date();
    const trialExpiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const [user] = await db.insert(users).values({
      tier: "trial",
      tierAssignedAt: now,
      accountStatus: "active",
      trialExpiresAt,
      createdAt: now,
      trialResetHistory: [],
      ...insertUser,
      email: insertUser.email.toLowerCase(),
    }).returning();
    return user;
  }

  async updateUser(id: number, data: Partial<User>): Promise<User> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async createOtp(otp: InsertOtp): Promise<OtpCode> {
    const [created] = await db.insert(otpCodes).values(otp).returning();
    return created;
  }

  async getOtp(email: string, code: string): Promise<OtpCode | undefined> {
    const [otp] = await db.select().from(otpCodes)
      .where(eq(otpCodes.email, email.toLowerCase()));
    if (otp && otp.code === code && !otp.used && otp.expiresAt > new Date()) {
      return otp;
    }
    return undefined;
  }

  async markOtpUsed(id: number): Promise<void> {
    await db.update(otpCodes).set({ used: true }).where(eq(otpCodes.id, id));
  }

  async getOtpByCode(code: string): Promise<OtpCode | undefined> {
    const [otp] = await db.select().from(otpCodes)
      .where(and(eq(otpCodes.code, code), eq(otpCodes.used, false)))
      .limit(1);
    if (otp && otp.expiresAt > new Date()) return otp;
    return undefined;
  }

  async getOtpByEmailAndCode(email: string, code: string): Promise<OtpCode | undefined> {
    const now = new Date();
    const [otp] = await db.select().from(otpCodes)
      .where(and(
        eq(otpCodes.email, email.toLowerCase()),
        eq(otpCodes.code, code),
        eq(otpCodes.used, false),
        sql`${otpCodes.expiresAt} > ${now}`
      ))
      .orderBy(desc(otpCodes.id))
      .limit(1);
    return otp;
  }

  async getBrandProfileByUserId(userId: number): Promise<BrandProfile | undefined> {
    const [profile] = await db.select().from(brandProfiles).where(eq(brandProfiles.userId, userId));
    return profile;
  }

  async getBrandProfileByOrganizationId(orgId: number): Promise<BrandProfile | undefined> {
    const [profile] = await db.select()
      .from(brandProfiles)
      .where(eq(brandProfiles.organizationId, orgId))
      .limit(1);
    return profile;
  }

  async createBrandProfile(profile: InsertBrandProfile): Promise<BrandProfile> {
    const [created] = await db.insert(brandProfiles).values(profile).returning();
    return created;
  }

  async updateBrandProfile(id: number, data: Partial<BrandProfile>): Promise<BrandProfile> {
    const [updated] = await db.update(brandProfiles).set(data).where(eq(brandProfiles.id, id)).returning();
    return updated;
  }

  async createCampaign(campaign: InsertCampaign): Promise<Campaign> {
    const [created] = await db.insert(campaigns).values(campaign).returning();
    return created;
  }

  async getCampaignsByUserId(userId: number): Promise<Campaign[]> {
    return db.select().from(campaigns).where(eq(campaigns.userId, userId)).orderBy(desc(campaigns.createdAt));
  }

  async getCampaignsByOrganizationId(orgId: number): Promise<Campaign[]> {
    const members = await db.select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, orgId));
    const memberUserIds = members.map(m => m.userId);
    return db.select()
      .from(campaigns)
      .where(
        memberUserIds.length > 0
          ? or(eq(campaigns.organizationId, orgId), inArray(campaigns.userId, memberUserIds))
          : eq(campaigns.organizationId, orgId)
      )
      .orderBy(desc(campaigns.createdAt));
  }

  async getCampaignById(id: number): Promise<Campaign | undefined> {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    return campaign;
  }

  // Number of posts that have actually been published to a platform (platformPostId set),
  // keyed by campaign id. Used to derive a campaign's live/published display status.
  async getPublishedPostCountsByCampaign(campaignIds: number[]): Promise<Record<number, number>> {
    if (campaignIds.length === 0) return {};
    const rows = await db
      .select({ campaignId: campaignPosts.campaignId, n: count() })
      .from(campaignPosts)
      .where(and(inArray(campaignPosts.campaignId, campaignIds), isNotNull(campaignPosts.platformPostId)))
      .groupBy(campaignPosts.campaignId);
    const result: Record<number, number> = {};
    for (const row of rows) result[row.campaignId] = Number(row.n);
    return result;
  }

  async updateCampaign(id: number, data: Partial<Campaign>): Promise<Campaign> {
    const [updated] = await db.update(campaigns).set(data).where(eq(campaigns.id, id)).returning();
    return updated;
  }

  async deleteCampaign(id: number): Promise<void> {
    await db.delete(campaigns).where(eq(campaigns.id, id));
  }

  async createCampaignPost(post: InsertCampaignPost): Promise<CampaignPost> {
    const [created] = await db.insert(campaignPosts).values(post).returning();
    return created;
  }

  async getCampaignPosts(campaignId: number): Promise<CampaignPost[]> {
    return db.select().from(campaignPosts).where(eq(campaignPosts.campaignId, campaignId)).orderBy(campaignPosts.order);
  }

  async getAllCampaignPostsByUserId(userId: number): Promise<{ campaign: Campaign; posts: CampaignPost[] }[]> {
    const userCampaigns = await this.getCampaignsByUserId(userId);
    const results: { campaign: Campaign; posts: CampaignPost[] }[] = [];
    for (const campaign of userCampaigns) {
      const posts = await this.getCampaignPosts(campaign.id);
      results.push({ campaign, posts });
    }
    return results;
  }

  async getAllCampaignPostsByOrganizationId(orgId: number): Promise<{ campaign: Campaign; posts: CampaignPost[] }[]> {
    const orgCampaigns = await this.getCampaignsByOrganizationId(orgId);
    const results: { campaign: Campaign; posts: CampaignPost[] }[] = [];
    for (const campaign of orgCampaigns) {
      const posts = await this.getCampaignPosts(campaign.id);
      results.push({ campaign, posts });
    }
    return results;
  }

  async getCampaignPostById(postId: number): Promise<CampaignPost | undefined> {
    const [post] = await db.select().from(campaignPosts).where(eq(campaignPosts.id, postId));
    return post;
  }

  async updateCampaignPost(id: number, data: Partial<CampaignPost>): Promise<CampaignPost> {
    const [updated] = await db.update(campaignPosts).set(data).where(eq(campaignPosts.id, id)).returning();
    return updated;
  }

  async deleteCampaignPost(id: number): Promise<void> {
    await db.delete(campaignPosts).where(eq(campaignPosts.id, id));
  }

  async upsertPostMetrics(postId: number, data: Omit<InsertPostMetrics, 'postId'>): Promise<PostMetrics> {
    const existing = await this.getMetricsByPostId(postId);
    if (existing) {
      const [updated] = await db.update(postMetrics)
        .set({ ...data, uploadedAt: new Date() })
        .where(eq(postMetrics.postId, postId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(postMetrics).values({ ...data, postId }).returning();
    return created;
  }

  async getMetricsByPostId(postId: number): Promise<PostMetrics | undefined> {
    const [metric] = await db.select().from(postMetrics).where(eq(postMetrics.postId, postId));
    return metric;
  }

  async getMetricsByCampaignId(campaignId: number): Promise<(PostMetrics & { post: CampaignPost })[]> {
    const posts = await this.getCampaignPosts(campaignId);
    if (posts.length === 0) return [];
    const postIds = posts.map(p => p.id);
    const metrics = await db.select().from(postMetrics).where(inArray(postMetrics.postId, postIds));
    return metrics.map(m => {
      const post = posts.find(p => p.id === m.postId)!;
      return { ...m, post };
    });
  }

  async getTopPerformingPosts(userId: number, limit: number): Promise<Array<{ content: string; platform: string; impressions: number; reach: number; likes: number; comments: number; shares: number; saves: number; clicks: number; compositeScore: number }>> {
    const userCampaigns = await this.getCampaignsByUserId(userId);
    return this.scoreTopPerformingPosts(userCampaigns, limit);
  }

  async getTopPerformingPostsByOrganizationId(orgId: number, limit: number): Promise<Array<{ content: string; platform: string; impressions: number; reach: number; likes: number; comments: number; shares: number; saves: number; clicks: number; compositeScore: number }>> {
    const userCampaigns = await this.getCampaignsByOrganizationId(orgId);
    return this.scoreTopPerformingPosts(userCampaigns, limit);
  }

  private async scoreTopPerformingPosts(userCampaigns: Campaign[], limit: number): Promise<Array<{ content: string; platform: string; impressions: number; reach: number; likes: number; comments: number; shares: number; saves: number; clicks: number; compositeScore: number }>> {
    if (userCampaigns.length === 0) return [];

    const allPosts: CampaignPost[] = [];
    for (const c of userCampaigns) {
      const posts = await this.getCampaignPosts(c.id);
      allPosts.push(...posts);
    }
    if (allPosts.length === 0) return [];

    const postIds = allPosts.map(p => p.id);
    const metrics = await db.select().from(postMetrics).where(inArray(postMetrics.postId, postIds));
    if (metrics.length === 0) return [];

    const scored = metrics.map(m => {
      const post = allPosts.find(p => p.id === m.postId)!;
      const engagementRate = m.reach > 0 ? (m.likes + m.comments + m.shares + m.saves) / m.reach : 0;
      const ctr = m.impressions > 0 ? m.clicks / m.impressions : 0;
      const saveRate = m.reach > 0 ? m.saves / m.reach : 0;
      const compositeScore = (engagementRate * 0.5) + (ctr * 0.3) + (saveRate * 0.2);
      return {
        content: post.content,
        platform: post.platform,
        impressions: m.impressions,
        reach: m.reach,
        likes: m.likes,
        comments: m.comments,
        shares: m.shares,
        saves: m.saves,
        clicks: m.clicks,
        compositeScore: Math.round(compositeScore * 10000) / 10000,
      };
    });

    scored.sort((a, b) => b.compositeScore - a.compositeScore);
    return scored.slice(0, limit);
  }

  async deletePostMetrics(postId: number): Promise<void> {
    await db.delete(postMetrics).where(eq(postMetrics.postId, postId));
  }

  async updateCampaignPostPlatformId(postId: number, platformPostId: string, platformPostUrl?: string): Promise<CampaignPost> {
    const [updated] = await db.update(campaignPosts)
      .set({ platformPostId, platformPostUrl: platformPostUrl || null })
      .where(eq(campaignPosts.id, postId))
      .returning();
    return updated;
  }

  async getCampaignPostsWithPlatformIds(campaignId: number, userId?: number): Promise<CampaignPost[]> {
    if (userId !== undefined) {
      // When userId is provided, return all posts with platform IDs for campaigns owned by that user
      const userCampaigns = await db.select().from(campaigns).where(eq(campaigns.userId, userId));
      const campaignIds = userCampaigns.map((c) => c.id);
      if (campaignIds.length === 0) return [];
      return db.select().from(campaignPosts)
        .where(and(
          inArray(campaignPosts.campaignId, campaignIds),
          sql`${campaignPosts.platformPostId} IS NOT NULL`
        ))
        .orderBy(campaignPosts.order);
    }
    return db.select().from(campaignPosts)
      .where(and(
        eq(campaignPosts.campaignId, campaignId),
        sql`${campaignPosts.platformPostId} IS NOT NULL`
      ))
      .orderBy(campaignPosts.order);
  }

  async createMetricSnapshot(data: InsertPostMetricSnapshot): Promise<PostMetricSnapshot> {
    const [created] = await db.insert(postMetricSnapshots).values(data).returning();
    return created;
  }

  async getMetricSnapshotsByPostId(postId: number, limit = 10): Promise<PostMetricSnapshot[]> {
    return db.select().from(postMetricSnapshots)
      .where(eq(postMetricSnapshots.postId, postId))
      .orderBy(desc(postMetricSnapshots.recordedAt))
      .limit(limit);
  }

  async createMediaFolder(folder: InsertMediaFolder): Promise<MediaFolder> {
    const [created] = await db.insert(mediaFolders).values(folder).returning();
    return created;
  }

  async getMediaFoldersByUserId(userId: number): Promise<MediaFolder[]> {
    return db.select().from(mediaFolders).where(eq(mediaFolders.userId, userId)).orderBy(mediaFolders.createdAt);
  }

  async getMediaFolderById(id: number): Promise<MediaFolder | undefined> {
    const [folder] = await db.select().from(mediaFolders).where(eq(mediaFolders.id, id));
    return folder;
  }

  async updateMediaFolder(id: number, data: Partial<MediaFolder>): Promise<MediaFolder> {
    const [updated] = await db.update(mediaFolders).set(data).where(eq(mediaFolders.id, id)).returning();
    return updated;
  }

  async deleteMediaFolder(id: number): Promise<void> {
    await db.delete(mediaFolders).where(eq(mediaFolders.id, id));
  }

  async createMediaFile(file: InsertMediaFile): Promise<MediaFile> {
    const [created] = await db.insert(mediaFiles).values(file).returning();
    return created;
  }

  async getMediaFilesByUserId(userId: number, folderId?: number | null): Promise<MediaFile[]> {
    if (folderId === undefined) {
      return db.select().from(mediaFiles).where(eq(mediaFiles.userId, userId)).orderBy(desc(mediaFiles.createdAt));
    }
    if (folderId === null) {
      return db.select().from(mediaFiles).where(
        and(eq(mediaFiles.userId, userId), isNull(mediaFiles.folderId))
      ).orderBy(desc(mediaFiles.createdAt));
    }
    return db.select().from(mediaFiles).where(
      and(eq(mediaFiles.userId, userId), eq(mediaFiles.folderId, folderId))
    ).orderBy(desc(mediaFiles.createdAt));
  }

  async getMediaFileById(id: number): Promise<MediaFile | undefined> {
    const [file] = await db.select().from(mediaFiles).where(eq(mediaFiles.id, id));
    return file;
  }

  async updateMediaFile(id: number, data: Partial<MediaFile>): Promise<MediaFile> {
    const [updated] = await db.update(mediaFiles).set(data).where(eq(mediaFiles.id, id)).returning();
    return updated;
  }

  async deleteMediaFile(id: number): Promise<void> {
    await db.delete(mediaFiles).where(eq(mediaFiles.id, id));
  }

  async createOrganization(org: InsertOrganization): Promise<Organization> {
    const [created] = await db.insert(organizations).values(org).returning();
    return created;
  }

  async getOrganizationById(id: number): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org;
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
    return org;
  }

  async updateOrganization(id: number, data: Partial<Organization>): Promise<Organization> {
    const [updated] = await db.update(organizations).set(data).where(eq(organizations.id, id)).returning();
    return updated;
  }

  async listAllOrganizations(): Promise<Organization[]> {
    return db.select().from(organizations).orderBy(desc(organizations.createdAt));
  }

  async createRole(role: InsertRole): Promise<Role> {
    const [created] = await db.insert(roles).values(role).returning();
    return created;
  }

  async getRoleById(id: number): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    return role;
  }

  async getRolesByOrganizationId(orgId: number): Promise<Role[]> {
    return db.select().from(roles).where(eq(roles.organizationId, orgId)).orderBy(roles.createdAt);
  }

  async getDefaultRole(orgId: number): Promise<Role | undefined> {
    const [role] = await db.select().from(roles)
      .where(and(eq(roles.organizationId, orgId), eq(roles.isDefault, true)));
    return role;
  }

  async updateRole(id: number, data: Partial<Role>): Promise<Role> {
    const [updated] = await db.update(roles).set(data).where(eq(roles.id, id)).returning();
    return updated;
  }

  async deleteRole(id: number): Promise<void> {
    await db.delete(roles).where(eq(roles.id, id));
  }

  async setRolePermissions(roleId: number, permissions: InsertRolePermission[]): Promise<RolePermission[]> {
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (permissions.length === 0) return [];
    return db.insert(rolePermissions).values(permissions).returning();
  }

  async getRolePermissions(roleId: number): Promise<RolePermission[]> {
    return db.select().from(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  }

  async addOrganizationMember(member: InsertOrganizationMember): Promise<OrganizationMember> {
    const memberUserId = (member as any).userId;
    const memberOrganizationId = (member as any).organizationId;
    const user = await this.getUser(memberUserId);
    if (!user) {
      throw new Error("User not found");
    }
    if (user.organizationId && user.organizationId !== memberOrganizationId) {
      throw new Error("User already belongs to another organization");
    }
    const existingMemberships = await this.getUserOrganizations(memberUserId);
    if (existingMemberships.length > 0) {
      throw new Error("User already belongs to an organization");
    }
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(organizationMembers).values(member as typeof organizationMembers.$inferInsert).returning();
      await tx.update(users)
        .set({ organizationId: memberOrganizationId })
        .where(eq(users.id, memberUserId));
      return created;
    });
  }

  async getOrganizationMember(userId: number, orgId: number): Promise<OrganizationMember | undefined> {
    const [member] = await db.select().from(organizationMembers)
      .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, orgId)));
    return member;
  }

  async getOrganizationMembers(orgId: number): Promise<(OrganizationMember & { user: User })[]> {
    const rows = await db.select({
      id: organizationMembers.id,
      userId: organizationMembers.userId,
      organizationId: organizationMembers.organizationId,
      roleId: organizationMembers.roleId,
      systemRole: organizationMembers.systemRole,
      joinedAt: organizationMembers.joinedAt,
      isBlocked: organizationMembers.isBlocked,
      user: users,
    })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(eq(organizationMembers.organizationId, orgId));

    return rows.map(r => ({
      id: r.id,
      userId: r.userId,
      organizationId: r.organizationId,
      roleId: r.roleId,
      systemRole: r.systemRole,
      joinedAt: r.joinedAt,
      isBlocked: r.isBlocked,
      user: r.user,
    }));
  }

  async getUserOrganizations(userId: number): Promise<OrganizationMember[]> {
    return db.select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId))
      .orderBy(asc(organizationMembers.joinedAt), asc(organizationMembers.id));
  }

  async updateOrganizationMember(id: number, data: Partial<OrganizationMember>): Promise<OrganizationMember> {
    const [updated] = await db.update(organizationMembers).set(data).where(eq(organizationMembers.id, id)).returning();
    return updated;
  }

  async removeOrganizationMember(id: number): Promise<void> {
    const [member] = await db.select().from(organizationMembers).where(eq(organizationMembers.id, id));
    await db.transaction(async (tx) => {
      await tx.delete(organizationMembers).where(eq(organizationMembers.id, id));
      if (member) {
        await tx.update(users)
          .set({ organizationId: null })
          .where(and(eq(users.id, member.userId), eq(users.organizationId, member.organizationId)));
      }
    });
  }

  async removeOrganizationMemberAndDeleteUser(memberId: number, userId: number): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(organizationMembers).where(eq(organizationMembers.id, memberId));
      await tx.delete(users).where(eq(users.id, userId));
    });
  }

  async createOrganizationWithAdmin(input: {
    orgName: string;
    adminFullName: string;
    adminEmail: string;
    hashedPassword: string;
    tier: "trial" | "professional" | "enterprise" | "founder";
  }): Promise<{ org: Organization; user: User; member: OrganizationMember; subscription: OrganizationSubscription }> {
    const now = new Date();
    const email = input.adminEmail.toLowerCase().trim();
    const baseSlug = input.orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "org";
    const isTrial = input.tier === "trial";
    const trialExpiresAt = isTrial ? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) : null;

    return await db.transaction(async (tx) => {
      let finalSlug = baseSlug;
      let counter = 1;
      while (true) {
        const [existing] = await tx.select().from(organizations).where(eq(organizations.slug, finalSlug));
        if (!existing) break;
        finalSlug = `${baseSlug}-${counter}`;
        counter++;
      }

      const [user] = await tx.insert(users).values({
        fullName: input.adminFullName,
        email,
        password: input.hashedPassword,
        systemRole: "admin",
        onboardingCompleted: false,
        onboardingStep: 0,
        mustChangePassword: true,
        emailVerifiedAt: now,
        tier: input.tier,
        tierAssignedAt: now,
        accountStatus: "active",
        trialExpiresAt,
        createdAt: now,
        trialResetHistory: [],
      }).returning();

      const [org] = await tx.insert(organizations).values({
        name: input.orgName,
        slug: finalSlug,
        tier: input.tier,
        tierAssignedAt: now,
        trialExpiresAt,
        accountStatus: "active",
      }).returning();

      const [userWithOrg] = await tx.update(users)
        .set({ organizationId: org.id })
        .where(eq(users.id, user.id))
        .returning();

      const [member] = await tx.insert(organizationMembers).values({
        userId: user.id,
        organizationId: org.id,
        systemRole: "admin",
        roleId: null,
      }).returning();

      const [defaultRole] = await tx.insert(roles).values({
        organizationId: org.id,
        name: "Standard Creator",
        description: "Default role with standard content creation permissions",
        isDefault: true,
        isProtected: true,
      }).returning();

      await tx.insert(rolePermissions).values(
        DEFAULT_CREATOR_PERMISSIONS.map(p => ({
          roleId: defaultRole.id,
          module: p.module,
          action: p.action,
          granted: true,
        }))
      );

      const [subscription] = await tx.insert(organizationSubscriptions).values({
        organizationId: org.id,
        tier: input.tier,
        tierAssignedAt: now,
        status: isTrial ? "trialing" : "active",
        trialStartedAt: isTrial ? now : null,
        trialEndsAt: trialExpiresAt,
      }).returning();

      return { org, user: userWithOrg, member, subscription };
    });
  }

  async getUsersWithRole(roleId: number): Promise<OrganizationMember[]> {
    return db.select().from(organizationMembers).where(eq(organizationMembers.roleId, roleId));
  }

  async getUserPermissions(userId: number, orgId: number): Promise<PermissionEntry[]> {
    const member = await this.getOrganizationMember(userId, orgId);
    if (!member) return [];

    if (member.systemRole === "super_admin" || member.systemRole === "admin") {
      const { MODULES, ACTIONS } = await import("@shared/schema");
      const allPerms: PermissionEntry[] = [];
      for (const mod of MODULES) {
        for (const act of ACTIONS) {
          allPerms.push({ module: mod, action: act, granted: true });
        }
      }
      return allPerms;
    }

    if (!member.roleId) {
      return DEFAULT_CREATOR_PERMISSIONS.map(p => ({ ...p, granted: true }));
    }

    const perms = await this.getRolePermissions(member.roleId);
    return perms
      .filter(p => p.granted)
      .map(p => ({
        module: p.module as any,
        action: p.action as any,
        granted: p.granted,
      }));
  }

  async createAuditLog(log: InsertRoleAuditLog): Promise<RoleAuditLog> {
    const [created] = await db.insert(roleAuditLogs).values(log).returning();
    return created;
  }

  async getAuditLogs(orgId: number, limit = 50, offset = 0): Promise<(RoleAuditLog & { user?: User })[]> {
    const rows = await db.select({
      log: roleAuditLogs,
      user: users,
    })
      .from(roleAuditLogs)
      .innerJoin(users, eq(roleAuditLogs.userId, users.id))
      .where(eq(roleAuditLogs.organizationId, orgId))
      .orderBy(desc(roleAuditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return rows.map(r => ({
      ...r.log,
      user: r.user,
    }));
  }
  async getOrganizationSubscription(organizationId: number): Promise<OrganizationSubscription | undefined> {
    const [sub] = await db.select().from(organizationSubscriptions).where(eq(organizationSubscriptions.organizationId, organizationId));
    return sub;
  }

  async createOrganizationSubscription(sub: InsertOrganizationSubscription): Promise<OrganizationSubscription> {
    const [created] = await db.insert(organizationSubscriptions).values(sub).returning();
    return created;
  }

  async updateOrganizationSubscription(id: number, data: Partial<OrganizationSubscription>): Promise<OrganizationSubscription> {
    const [updated] = await db.update(organizationSubscriptions).set(data).where(eq(organizationSubscriptions.id, id)).returning();
    return updated;
  }

  async getSubscriptionByStripeSubscriptionId(stripeSubId: string): Promise<OrganizationSubscription | undefined> {
    const [sub] = await db.select().from(organizationSubscriptions).where(eq(organizationSubscriptions.stripeSubscriptionId, stripeSubId));
    return sub;
  }

  async getSubscriptionByStripeCustomerId(stripeCustomerId: string): Promise<OrganizationSubscription | undefined> {
    const [sub] = await db.select().from(organizationSubscriptions).where(eq(organizationSubscriptions.stripeCustomerId, stripeCustomerId));
    return sub;
  }

  async getMarketIntelligenceByOrgId(orgId: number): Promise<MarketIntelligence | undefined> {
    const [row] = await db.select().from(marketIntelligence).where(eq(marketIntelligence.organizationId, orgId));
    return row;
  }

  async upsertMarketIntelligence(orgId: number, data: Partial<InsertMarketIntelligence>): Promise<MarketIntelligence> {
    const existing = await this.getMarketIntelligenceByOrgId(orgId);
    if (existing) {
      const [updated] = await db.update(marketIntelligence)
        .set({ ...data })
        .where(eq(marketIntelligence.organizationId, orgId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(marketIntelligence)
      .values({ organizationId: orgId, ...data })
      .returning();
    return created;
  }

  async resetStuckMarketIntelligenceJobs(): Promise<number> {
    const result = await db.update(marketIntelligence)
      .set({ status: "failed" })
      .where(eq(marketIntelligence.status, "running"))
      .returning();
    return result.length;
  }

  async getSocialConnectionByUserId(userId: number, platform = "facebook"): Promise<SocialConnection | undefined> {
    const [row] = await db.select().from(socialConnections)
      .where(and(eq(socialConnections.userId, userId), eq(socialConnections.platform, platform)));
    return row;
  }

  async upsertSocialConnection(userId: number, data: Partial<InsertSocialConnection>): Promise<SocialConnection> {
    const platform = data.platform || "facebook";
    const existing = await this.getSocialConnectionByUserId(userId, platform);
    if (existing) {
      const [updated] = await db.update(socialConnections)
        .set({ ...data, connectedAt: new Date() })
        .where(and(eq(socialConnections.userId, userId), eq(socialConnections.platform, platform)))
        .returning();
      return updated;
    }
    const [created] = await db.insert(socialConnections)
      .values({ userId, platform, ...data })
      .returning();
    return created;
  }

  async deleteSocialConnection(userId: number, platform = "facebook"): Promise<void> {
    await db.delete(socialConnections)
      .where(and(eq(socialConnections.userId, userId), eq(socialConnections.platform, platform)));
  }

  async createScheduledSocialPost(data: InsertScheduledSocialPost): Promise<ScheduledSocialPost> {
    const [created] = await db.insert(scheduledSocialPosts).values(data).returning();
    return created;
  }

  async getScheduledSocialPostsByUserId(userId: number, platform?: string): Promise<ScheduledSocialPost[]> {
    // Newest-added first (latest created at the top). This is a display listing only;
    // the auto-send scheduler fetches due posts separately, ordered by scheduledAt.
    if (platform) {
      return db.select().from(scheduledSocialPosts)
        .where(and(eq(scheduledSocialPosts.userId, userId), eq(scheduledSocialPosts.platform, platform)))
        .orderBy(desc(scheduledSocialPosts.createdAt));
    }
    return db.select().from(scheduledSocialPosts)
      .where(eq(scheduledSocialPosts.userId, userId))
      .orderBy(desc(scheduledSocialPosts.createdAt));
  }

  async getScheduledSocialPostById(id: number): Promise<ScheduledSocialPost | undefined> {
    const [row] = await db.select().from(scheduledSocialPosts).where(eq(scheduledSocialPosts.id, id));
    return row;
  }

  async updateScheduledSocialPost(id: number, data: Partial<ScheduledSocialPost>): Promise<ScheduledSocialPost> {
    const [updated] = await db.update(scheduledSocialPosts).set(data).where(eq(scheduledSocialPosts.id, id)).returning();
    return updated;
  }

  async deleteScheduledSocialPost(id: number): Promise<void> {
    await db.delete(scheduledSocialPosts).where(eq(scheduledSocialPosts.id, id));
  }

  async getPendingScheduledSocialPosts(before: Date): Promise<ScheduledSocialPost[]> {
    return db.select().from(scheduledSocialPosts)
      .where(and(
        eq(scheduledSocialPosts.status, "pending"),
        sql`${scheduledSocialPosts.scheduledAt} <= ${before}`
      ));
  }

  async countOrgCampaigns(orgId: number, since: Date): Promise<number> {
    const members = await db.select({ userId: organizationMembers.userId })
      .from(organizationMembers).where(eq(organizationMembers.organizationId, orgId));
    if (members.length === 0) return 0;
    const userIds = members.map((m) => m.userId);
    const [row] = await db.select({ cnt: count() }).from(campaigns)
      .where(and(
        inArray(campaigns.userId, userIds),
        sql`${campaigns.createdAt} >= ${since}`
      ));
    return row?.cnt ?? 0;
  }

  async countOrgScheduledPosts(orgId: number, since: Date): Promise<number> {
    const members = await db.select({ userId: organizationMembers.userId })
      .from(organizationMembers).where(eq(organizationMembers.organizationId, orgId));
    if (members.length === 0) return 0;
    const userIds = members.map((m) => m.userId);
    const [row] = await db.select({ cnt: count() }).from(scheduledSocialPosts)
      .where(and(
        inArray(scheduledSocialPosts.userId, userIds),
        sql`${scheduledSocialPosts.createdAt} >= ${since}`
      ));
    return row?.cnt ?? 0;
  }

  async countOrgSocialConnections(orgId: number): Promise<number> {
    const members = await db.select({ userId: organizationMembers.userId })
      .from(organizationMembers).where(eq(organizationMembers.organizationId, orgId));
    if (members.length === 0) return 0;
    const userIds = members.map((m) => m.userId);
    const [row] = await db.select({ cnt: count() }).from(socialConnections)
      .where(inArray(socialConnections.userId, userIds));
    return row?.cnt ?? 0;
  }

  async countOrgMembers(orgId: number): Promise<number> {
    const [row] = await db.select({ cnt: count() }).from(organizationMembers)
      .where(eq(organizationMembers.organizationId, orgId));
    return row?.cnt ?? 0;
  }

  async countUserOrganizations(userId: number): Promise<number> {
    const [row] = await db.select({ cnt: count() }).from(organizationMembers)
      .where(eq(organizationMembers.userId, userId));
    return row?.cnt ?? 0;
  }

  async deleteOrganization(orgId: number): Promise<void> {
    await db.update(organizations).set({
      accountStatus: "deleted",
      suspended: true,
      tierAssignedAt: new Date(),
      deletedAt: new Date(),
    }).where(eq(organizations.id, orgId));
  }

  async createAdminAuditLog(data: { adminId: number; action: string; targetType: string; targetId: number; details?: Record<string, unknown> }): Promise<void> {
    await db.insert(adminAuditLogs).values({
      adminId: data.adminId,
      action: data.action,
      targetType: data.targetType,
      targetId: data.targetId,
      details: data.details ?? null,
    });
  }

  async verifyUserEmail(userId: number): Promise<void> {
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
  }

  async deactivateUser(userId: number): Promise<void> {
    await db.update(users).set({
      accountStatus: "deleted",
      blocked: true,
      deletedAt: new Date(),
    }).where(eq(users.id, userId));
  }

  async restoreUser(userId: number): Promise<void> {
    await db.update(users).set({
      accountStatus: "active",
      blocked: false,
      deletedAt: null,
    }).where(eq(users.id, userId));
  }

  async getAdminUserDetail(userId: number): Promise<any> {
    const user = await this.getUser(userId);
    if (!user) return null;
    const memberships = await db.select({
      orgId: organizations.id,
      orgName: organizations.name,
      orgTier: organizations.tier,
      orgStatus: organizations.accountStatus,
      orgSlug: organizations.slug,
      systemRole: organizationMembers.systemRole,
    })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
      .where(
        user.organizationId
          ? and(eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, user.organizationId))
          : eq(organizationMembers.userId, userId)
      )
      .limit(1);
    const membership = memberships[0];
    let subscription = null;
    const tierResetHistory: any[] = [];
    if (membership) {
      subscription = await this.getOrganizationSubscription(membership.orgId);
    }
    let usageStats = { campaignCount: 0, postCount: 0, scheduledPostCount: 0, aiImageEventCount: 0, socialConnectionCount: 0 };
    if (membership) {
      const orgId = membership.orgId;
      const members = await db.select({ userId: organizationMembers.userId }).from(organizationMembers).where(eq(organizationMembers.organizationId, orgId));
      const memberUserIds = members.map((m) => m.userId);
      if (memberUserIds.length > 0) {
        const [cc] = await db.select({ count: count() }).from(campaigns).where(inArray(campaigns.userId, memberUserIds));
        usageStats.campaignCount = cc?.count ?? 0;
        const orgCampaigns = await db.select({ id: campaigns.id }).from(campaigns).where(inArray(campaigns.userId, memberUserIds));
        if (orgCampaigns.length > 0) {
          const campIds = orgCampaigns.map((c) => c.id);
          const [pc] = await db.select({ count: count() }).from(campaignPosts).where(inArray(campaignPosts.campaignId, campIds));
          usageStats.postCount = pc?.count ?? 0;
        }
        const [sc] = await db.select({ count: count() }).from(scheduledSocialPosts).where(inArray(scheduledSocialPosts.userId, memberUserIds));
        usageStats.scheduledPostCount = sc?.count ?? 0;
        const [soc] = await db.select({ count: count() }).from(socialConnections).where(inArray(socialConnections.userId, memberUserIds));
        usageStats.socialConnectionCount = soc?.count ?? 0;
      }
    }
    let lastEmailDelivery: { sentAt: Date; used: boolean; expired: boolean } | null = null;
    const [lastVerifyOtp] = await db.select().from(otpCodes)
      .where(and(eq(otpCodes.email, user.email), sql`${otpCodes.code} LIKE 'verify_%'`))
      .orderBy(desc(otpCodes.id))
      .limit(1);
    if (lastVerifyOtp) {
      lastEmailDelivery = {
        sentAt: lastVerifyOtp.expiresAt ? new Date(lastVerifyOtp.expiresAt.getTime() - 24 * 60 * 60 * 1000) : new Date(),
        used: lastVerifyOtp.used,
        expired: lastVerifyOtp.expiresAt < new Date() && !lastVerifyOtp.used,
      };
    }
    const { password: _pwd, ...safeUser } = user;
    const tierAssignedAt = (subscription as { tierAssignedAt?: Date | string | null } | null)?.tierAssignedAt ?? null;
    return { ...safeUser, membership, subscription, tierResetHistory, usageStats, lastEmailDelivery, tierAssignedAt };
  }

  async getAllUsersForAdmin(): Promise<(User & { organizationName?: string; organizationRole?: string; organizationId?: number })[]> {
    const allUsers = await db.select().from(users).orderBy(desc(users.id));
    const results: (User & { organizationName?: string; organizationRole?: string; organizationId?: number })[] = [];
    for (const user of allUsers) {
      const memberships = await db.select({
        orgName: organizations.name,
        orgId: organizations.id,
        systemRole: organizationMembers.systemRole,
      })
        .from(organizationMembers)
        .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
        .where(eq(organizationMembers.userId, user.id))
        .limit(1);

      const directOrg = memberships.length === 0 && user.organizationId
        ? await this.getOrganizationById(user.organizationId)
        : undefined;

      results.push({
        ...user,
        organizationName: memberships[0]?.orgName || directOrg?.name || undefined,
        organizationRole: memberships[0]?.systemRole || undefined,
        organizationId: user.organizationId ?? memberships[0]?.orgId ?? undefined,
      });
    }
    return results;
  }

  async getOrganizationsWithDetails(includeDeleted = false): Promise<any[]> {
    const allOrgs = await db.select().from(organizations).orderBy(desc(organizations.createdAt));
    const orgs = includeDeleted ? allOrgs : allOrgs.filter((o) => (o.accountStatus as string) !== "deleted");
    const results: any[] = [];

    for (const org of orgs) {
      const [memberCount] = await db.select({ count: count() }).from(organizationMembers).where(eq(organizationMembers.organizationId, org.id));
      const members = await db.select({ userId: organizationMembers.userId }).from(organizationMembers).where(eq(organizationMembers.organizationId, org.id));
      const memberUserIds = members.map(m => m.userId);

      let campaignCount = 0;
      let postCount = 0;
      if (memberUserIds.length > 0) {
        const [cc] = await db.select({ count: count() }).from(campaigns).where(inArray(campaigns.userId, memberUserIds));
        campaignCount = cc?.count || 0;

        const orgCampaigns = await db.select({ id: campaigns.id }).from(campaigns).where(inArray(campaigns.userId, memberUserIds));
        if (orgCampaigns.length > 0) {
          const campIds = orgCampaigns.map(c => c.id);
          const [pc] = await db.select({ count: count() }).from(campaignPosts).where(inArray(campaignPosts.campaignId, campIds));
          postCount = pc?.count || 0;
        }
      }

      const sub = await this.getOrganizationSubscription(org.id);

      const adminMember = await db.select({
        email: users.email,
        fullName: users.fullName,
      })
        .from(organizationMembers)
        .innerJoin(users, eq(organizationMembers.userId, users.id))
        .where(and(eq(organizationMembers.organizationId, org.id), eq(organizationMembers.systemRole, "admin")))
        .limit(1);

      results.push({
        ...org,
        memberCount: memberCount?.count || 0,
        campaignCount,
        postCount,
        adminEmail: adminMember[0]?.email || null,
        adminName: adminMember[0]?.fullName || null,
        subscription: sub ? {
          status: sub.status,
          billingInterval: sub.billingInterval,
          trialEndsAt: sub.trialEndsAt,
          currentPeriodEnd: sub.currentPeriodEnd,
          planId: sub.planId,
          stripeSubscriptionId: sub.stripeSubscriptionId ?? null,
        } : null,
      });
    }

    return results;
  }

  async getNotificationPreferences(userId: number, orgId: number): Promise<NotificationPreferences | undefined> {
    const [row] = await db.select().from(notificationPreferences)
      .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.organizationId, orgId)));
    return row;
  }

  async upsertNotificationPreferences(userId: number, orgId: number, data: Partial<InsertNotificationPreferences>): Promise<NotificationPreferences> {
    const now = new Date();
    const updateSet: Record<string, any> = { ...data, updatedAt: now };
    // Strip immutable fields if caller accidentally passed them
    delete updateSet.userId;
    delete updateSet.organizationId;
    delete updateSet.id;
    delete updateSet.createdAt;

    const [row] = await db.insert(notificationPreferences)
      .values({ userId, organizationId: orgId, ...data })
      .onConflictDoUpdate({
        target: [notificationPreferences.userId, notificationPreferences.organizationId],
        set: updateSet,
      })
      .returning();
    return row;
  }

  async getOrgAdminsForReminders(orgId: number): Promise<Array<{
    userId: number;
    email: string;
    fullName: string;
    prefs: NotificationPreferences | null;
  }>> {
    const rows = await db
      .select({
        userId: organizationMembers.userId,
        email: users.email,
        fullName: users.fullName,
        prefs: notificationPreferences,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .leftJoin(
        notificationPreferences,
        and(
          eq(notificationPreferences.userId, organizationMembers.userId),
          eq(notificationPreferences.organizationId, orgId),
        ),
      )
      .where(and(
        eq(organizationMembers.organizationId, orgId),
        inArray(organizationMembers.systemRole, ["admin", "super_admin"]),
        eq(organizationMembers.isBlocked, false),
        eq(users.blocked, false),
      ));
    return rows.map((r) => ({ userId: r.userId, email: r.email, fullName: r.fullName, prefs: r.prefs }));
  }

  async getUpcomingScheduledPostsForOrg(orgId: number, fromDate: Date, toDate: Date): Promise<Array<{
    id: number;
    content: string;
    platform: string;
    scheduledAt: Date;
    campaignId: number;
    campaignName: string;
  }>> {
    // Campaign-post scheduled times (planning marker — any campaign status counts;
    // if the user explicitly set a scheduledAt, that's their intent).
    const campaignRows = await db
      .select({
        id: campaignPosts.id,
        content: campaignPosts.content,
        platform: campaignPosts.platform,
        scheduledAt: campaignPosts.scheduledAt,
        campaignId: campaigns.id,
        campaignName: campaigns.companyName,
      })
      .from(campaignPosts)
      .innerJoin(campaigns, eq(campaigns.id, campaignPosts.campaignId))
      .where(and(
        eq(campaigns.organizationId, orgId),
        sql`${campaignPosts.scheduledAt} IS NOT NULL`,
        sql`${campaignPosts.scheduledAt} >= ${fromDate}`,
        sql`${campaignPosts.scheduledAt} <= ${toDate}`,
      ));

    // Every pending social-publish row in this window (linked or direct).
    // For linked rows we LEFT JOIN to resolve the campaign name; otherwise fall back to "Direct post".
    const socialRows = await db
      .select({
        id: scheduledSocialPosts.id,
        content: scheduledSocialPosts.message,
        platform: scheduledSocialPosts.platform,
        scheduledAt: scheduledSocialPosts.scheduledAt,
        campaignPostId: scheduledSocialPosts.campaignPostId,
        linkedCampaignId: campaigns.id,
        linkedCampaignName: campaigns.companyName,
      })
      .from(scheduledSocialPosts)
      .innerJoin(
        organizationMembers,
        and(
          eq(organizationMembers.userId, scheduledSocialPosts.userId),
          eq(organizationMembers.organizationId, orgId),
        ),
      )
      .leftJoin(campaignPosts, eq(campaignPosts.id, scheduledSocialPosts.campaignPostId))
      .leftJoin(campaigns, eq(campaigns.id, campaignPosts.campaignId))
      .where(and(
        eq(scheduledSocialPosts.status, "pending"),
        sql`${scheduledSocialPosts.scheduledAt} >= ${fromDate}`,
        sql`${scheduledSocialPosts.scheduledAt} <= ${toDate}`,
      ));

    // Dedup: when a campaign post has a linked publish queue row, prefer the
    // social row (it's the canonical "what will actually publish").
    const linkedCampaignPostIds = new Set<number>(
      socialRows.map((r) => r.campaignPostId).filter((id): id is number => id != null),
    );

    const all = [
      ...campaignRows
        .filter((r) => r.scheduledAt !== null && !linkedCampaignPostIds.has(r.id))
        .map((r) => ({
          id: r.id,
          content: r.content,
          platform: r.platform,
          scheduledAt: r.scheduledAt as Date,
          campaignId: r.campaignId,
          campaignName: r.campaignName,
        })),
      ...socialRows.map((r) => ({
        id: r.id,
        content: r.content,
        platform: r.platform,
        scheduledAt: r.scheduledAt as Date,
        campaignId: r.linkedCampaignId ?? 0,
        campaignName: r.linkedCampaignName ?? "Direct post",
      })),
    ];
    all.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    return all;
  }

  async tryClaimSchedulerLease(kind: string, minIntervalMs: number): Promise<boolean> {
    const now = new Date();
    const threshold = new Date(now.getTime() - minIntervalMs);
    // Atomic upsert: INSERT a fresh row, or UPDATE the existing one only if it's
    // older than the threshold. The RETURNING clause emits a row only when we
    // actually wrote, which is the lease-acquired signal.
    const result = await db.execute(sql`
      INSERT INTO scheduler_runs (kind, last_run_at)
      VALUES (${kind}, ${now})
      ON CONFLICT (kind) DO UPDATE
        SET last_run_at = ${now}
        WHERE scheduler_runs.last_run_at IS NULL
           OR scheduler_runs.last_run_at < ${threshold}
      RETURNING id
    `);
    const rows = (result as any).rows ?? result;
    if (Array.isArray(rows)) return rows.length > 0;
    return ((result as any).rowCount ?? 0) > 0;
  }

  async getAdminDashboardStats(): Promise<{
    totalUsers: number;
    totalOrganizations: number;
    totalCampaigns: number;
    totalPosts: number;
    activeSubscriptions: number;
    trialingOrgs: number;
    blockedUsers: number;
  }> {
    const [userCount] = await db.select({ count: count() }).from(users);
    const [orgCount] = await db.select({ count: count() }).from(organizations);
    const [campCount] = await db.select({ count: count() }).from(campaigns);
    const [postCount] = await db.select({ count: count() }).from(campaignPosts);
    const [activeSubCount] = await db.select({ count: count() }).from(organizationSubscriptions).where(eq(organizationSubscriptions.status, "active"));
    const [trialCount] = await db.select({ count: count() }).from(organizationSubscriptions).where(eq(organizationSubscriptions.status, "trialing"));
    const [blockedCount] = await db.select({ count: count() }).from(users).where(eq(users.blocked, true));

    return {
      totalUsers: userCount?.count || 0,
      totalOrganizations: orgCount?.count || 0,
      totalCampaigns: campCount?.count || 0,
      totalPosts: postCount?.count || 0,
      activeSubscriptions: activeSubCount?.count || 0,
      trialingOrgs: trialCount?.count || 0,
      blockedUsers: blockedCount?.count || 0,
    };
  }
}

export const storage = new DatabaseStorage();
