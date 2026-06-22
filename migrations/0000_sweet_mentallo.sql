CREATE TABLE "admin_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" integer NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_profiles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "brand_profiles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"organization_id" integer,
	"company_name" text NOT NULL,
	"industry" text NOT NULL,
	"website_url" text,
	"brand_summary" text,
	"target_audience" text,
	"messaging_pillars" text[],
	"tone_style" text,
	"do_language_rules" text[],
	"dont_language_rules" text[],
	"cta_preferences" text[],
	"custom_ctas" text[],
	"hashtag_themes" text[],
	"raw_brand_voice_json" jsonb,
	"sample_linkedin_post" text,
	"sample_instagram_post" text
);
--> statement-breakpoint
CREATE TABLE "campaign_posts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "campaign_posts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"campaign_id" integer NOT NULL,
	"post_identifier" text,
	"platform" text NOT NULL,
	"content" text NOT NULL,
	"image_prompt" text,
	"image_url" text,
	"image_urls" text[] DEFAULT '{}',
	"order" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp,
	"sources" jsonb,
	"platform_post_id" text,
	"platform_post_url" text
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "campaigns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"organization_id" integer,
	"company_name" text NOT NULL,
	"description" text NOT NULL,
	"platforms" text[] NOT NULL,
	"tone" text NOT NULL,
	"posts_count" integer NOT NULL,
	"call_to_action" text NOT NULL,
	"scheduled_at" timestamp,
	"start_date" timestamp,
	"end_date" timestamp,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_intelligence" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "market_intelligence_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"target_domain" text,
	"seed_keywords" text[] DEFAULT '{}',
	"discovered_competitors" jsonb DEFAULT '[]'::jsonb,
	"keyword_insights" jsonb DEFAULT '[]'::jsonb,
	"last_refreshed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_files" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "media_files_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"folder_id" integer,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"mime_type" text DEFAULT 'image/png' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_folders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "media_folders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notification_preferences_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"approval_reminders_enabled" boolean DEFAULT true NOT NULL,
	"approval_reminder_frequency" text DEFAULT 'weekly' NOT NULL,
	"approval_reminder_last_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_quota_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "org_quota_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "organization_members_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"role_id" integer,
	"system_role" text DEFAULT 'creator' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_subscriptions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "organization_subscriptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer NOT NULL,
	"plan_id" integer,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"billing_customer_id" text,
	"status" text DEFAULT 'trialing' NOT NULL,
	"tier" text DEFAULT 'trial' NOT NULL,
	"tier_assigned_at" timestamp,
	"billing_interval" text,
	"trial_started_at" timestamp,
	"trial_ends_at" timestamp,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"canceled_at" timestamp,
	"grace_period_ends_at" timestamp,
	"trial_reset_history" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "organizations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"account_status" text DEFAULT 'active' NOT NULL,
	"tier" text DEFAULT 'trial' NOT NULL,
	"tier_assigned_at" timestamp,
	"trial_expires_at" timestamp,
	"billing_customer_id" text,
	"trial_reset_history" jsonb DEFAULT '[]'::jsonb,
	"trial_emails_sent" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "otp_codes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_metric_snapshots" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "post_metric_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"post_id" integer NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_metrics" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "post_metrics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"post_id" integer NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_audit_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "role_audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"target_user_id" integer,
	"action" text NOT NULL,
	"previous_value" jsonb,
	"new_value" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "role_permissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"role_id" integer NOT NULL,
	"module" text NOT NULL,
	"action" text NOT NULL,
	"granted" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "roles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_protected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_social_posts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scheduled_social_posts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"campaign_post_id" integer,
	"platform" text DEFAULT 'facebook' NOT NULL,
	"page_id" text NOT NULL,
	"page_name" text NOT NULL,
	"page_access_token" text NOT NULL,
	"ig_user_id" text,
	"message" text NOT NULL,
	"image_url" text,
	"scheduled_at" timestamp NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduler_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scheduler_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"last_run_at" timestamp,
	CONSTRAINT "scheduler_runs_kind_unique" UNIQUE("kind")
);
--> statement-breakpoint
CREATE TABLE "social_connections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "social_connections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"platform" text DEFAULT 'facebook' NOT NULL,
	"user_access_token" text,
	"page_id" text,
	"page_name" text,
	"page_access_token" text,
	"ig_user_id" text,
	"ig_username" text,
	"linkedin_id" text,
	"linkedin_name" text,
	"linkedin_organization_id" text,
	"linkedin_organization_name" text,
	"x_id" text,
	"x_username" text,
	"x_access_token" text,
	"x_refresh_token" text,
	"x_token_expires_at" timestamp,
	"x_oauth1_token" text,
	"x_oauth1_token_secret" text,
	"connected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscription_plans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"monthly_price" integer NOT NULL,
	"annual_price" integer NOT NULL,
	"stripe_monthly_price_id" text,
	"stripe_annual_price_id" text,
	"stripe_product_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tier_quota_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tier" text NOT NULL,
	"resource" text NOT NULL,
	"limit" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "tier_reset_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tier_reset_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer NOT NULL,
	"admin_id" integer NOT NULL,
	"reason" text NOT NULL,
	"previous_expiry" timestamp,
	"new_expiry" timestamp NOT NULL,
	"usage_reset" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"password" text,
	"google_id" text,
	"profile_image" text,
	"organization_id" integer,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"onboarding_step" integer DEFAULT 0 NOT NULL,
	"system_role" text DEFAULT 'creator',
	"blocked" boolean DEFAULT false NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"invitation_token" text,
	"invitation_expires_at" timestamp,
	"tier" text DEFAULT 'trial' NOT NULL,
	"tier_assigned_at" timestamp,
	"account_status" text DEFAULT 'active' NOT NULL,
	"trial_expires_at" timestamp,
	"billing_customer_ref" text,
	"trial_reset_history" jsonb DEFAULT '[]'::jsonb,
	"email_verified_at" timestamp,
	"created_at" timestamp,
	"deleted_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_invitation_token_unique" UNIQUE("invitation_token")
);
--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_posts" ADD CONSTRAINT "campaign_posts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_intelligence" ADD CONSTRAINT "market_intelligence_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_folder_id_media_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."media_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_quota_events" ADD CONSTRAINT "org_quota_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_metric_snapshots" ADD CONSTRAINT "post_metric_snapshots_post_id_campaign_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."campaign_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_metrics" ADD CONSTRAINT "post_metrics_post_id_campaign_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."campaign_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_audit_logs" ADD CONSTRAINT "role_audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_audit_logs" ADD CONSTRAINT "role_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_audit_logs" ADD CONSTRAINT "role_audit_logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_social_posts" ADD CONSTRAINT "scheduled_social_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_social_posts" ADD CONSTRAINT "scheduled_social_posts_campaign_post_id_campaign_posts_id_fk" FOREIGN KEY ("campaign_post_id") REFERENCES "public"."campaign_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_connections" ADD CONSTRAINT "social_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_quota_configs" ADD CONSTRAINT "tier_quota_configs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_reset_logs" ADD CONSTRAINT "tier_reset_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_reset_logs" ADD CONSTRAINT "tier_reset_logs_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_profiles_organization_id_unique" ON "brand_profiles" USING btree ("organization_id") WHERE "brand_profiles"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "campaigns_organization_id_idx" ON "campaigns" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_user_org_unique" ON "notification_preferences" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_members_user_id_unique" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_organization_id_idx" ON "users" USING btree ("organization_id");