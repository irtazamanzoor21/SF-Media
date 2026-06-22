import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "@shared/schema";
import * as dotenv from "dotenv";
import dns from "dns";

dotenv.config();

// Prefer IPv4 when resolving the DB hostname. Neon's hostname returns both v4 and v6
// addresses; on networks without an IPv6 route Node otherwise tries v6 first, fails
// with ENETUNREACH, then falls back to v4 — adding latency and producing
// AggregateError [ETIMEDOUT] when the v4 attempts are also slow.
dns.setDefaultResultOrder("ipv4first");

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode=disable")
    ? false
    : { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
  statement_timeout: 30000,
  // Keep pooled sockets alive so an intermittent NAT/firewall drop doesn't leave
  // us reusing a dead connection on the next query.
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on("error", (err) => {
  console.warn("[db] Unexpected pool client error:", err.message);
});

// Connectivity to Neon (AWS us-east-1) from some networks is intermittently flaky:
// a single connect attempt occasionally fails with ETIMEDOUT/ECONNRESET even though
// the host is reachable moments later. Retry transient failures with backoff so a
// momentary blip doesn't surface as a 500 or kill a background job.
const TRANSIENT_DB_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "EAI_AGAIN",
  "EPIPE",
]);

function isTransientDbError(err: any): boolean {
  const codes = [err?.code, err?.cause?.code];
  if (Array.isArray(err?.errors)) {
    for (const e of err.errors) codes.push(e?.code);
  }
  return codes.some((c) => c && TRANSIENT_DB_CODES.has(c));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withDbRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientDbError(err) || i === attempts - 1) throw err;
      const delay = Math.min(2000, 250 * 2 ** i);
      console.warn(
        `[db] transient error (${(err as any)?.code || (err as any)?.cause?.code || "?"}), retry ${i + 1}/${attempts - 1} in ${delay}ms`,
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

// Wrap the promise-form query()/connect() that Drizzle uses, while leaving the
// callback form (used by connect-pg-simple's session store) untouched.
const rawQuery = pool.query.bind(pool);
const rawConnect = pool.connect.bind(pool);

(pool as any).query = function (...args: any[]) {
  const last = args[args.length - 1];
  if (typeof last === "function") {
    return (rawQuery as any)(...args); // callback form — pass through
  }
  return withDbRetry(() => (rawQuery as any)(...args));
};

(pool as any).connect = function (cb?: any) {
  if (typeof cb === "function") {
    return (rawConnect as any)(cb); // callback form — pass through
  }
  return withDbRetry(() => (rawConnect as any)());
};

export const db = drizzle(pool, { schema });

export async function runStartupMigrations() {
  try {
    await db.execute(
      sql`ALTER TABLE market_intelligence ADD COLUMN IF NOT EXISTS target_domain text`,
    );
    await db.execute(
      sql`ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS website_url text`,
    );
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamp
    `);
    await db.execute(sql`
      ALTER TABLE campaign_posts ADD COLUMN IF NOT EXISTS content_versions text[] DEFAULT '{}'::text[]
    `);
    // Subscriptions/trials removed — ensure every account is active with no expiry.
    await db.execute(sql`
      UPDATE organizations SET account_status = 'active', trial_expires_at = NULL
      WHERE account_status <> 'active' OR trial_expires_at IS NOT NULL
    `);
    await db.execute(sql`
      UPDATE users SET account_status = 'active', trial_expires_at = NULL
      WHERE account_status <> 'active' OR trial_expires_at IS NOT NULL
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id serial PRIMARY KEY,
        admin_id integer REFERENCES users(id),
        action text NOT NULL,
        target_type text NOT NULL,
        target_id integer NOT NULL,
        details jsonb,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deleted_at timestamp
    `);
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamp
    `);
    await db.execute(sql`
      ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_emails_sent jsonb DEFAULT '[]'
    `);
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false
    `);
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id integer
    `);
    await db.execute(sql`
      ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS organization_id integer
    `);
    await db.execute(sql`
      ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS organization_id integer
    `);
    await db.execute(sql`
      WITH ranked_memberships AS (
        SELECT
          id,
          row_number() OVER (
            PARTITION BY user_id
            ORDER BY joined_at ASC NULLS LAST, id ASC
          ) AS rn
        FROM organization_members
      )
      DELETE FROM organization_members
      WHERE id IN (
        SELECT id
        FROM ranked_memberships
        WHERE rn > 1
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS organization_members_user_id_unique
        ON organization_members (user_id)
    `);
    await db.execute(sql`
      UPDATE users
      SET organization_id = organization_members.organization_id
      FROM organization_members
      WHERE users.id = organization_members.user_id
        AND (
          users.organization_id IS NULL
          OR users.organization_id <> organization_members.organization_id
        )
    `);
    await db.execute(sql`
      UPDATE users
      SET organization_id = NULL
      WHERE organization_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM organization_members
          WHERE organization_members.user_id = users.id
            AND organization_members.organization_id = users.organization_id
        )
    `);
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'users_organization_id_organizations_id_fk'
        ) THEN
          ALTER TABLE users
          ADD CONSTRAINT users_organization_id_organizations_id_fk
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS users_organization_id_idx
        ON users (organization_id)
    `);
    await db.execute(sql`
      WITH ranked_profiles AS (
        SELECT
          brand_profiles.id,
          users.organization_id,
          row_number() OVER (
            PARTITION BY users.organization_id
            ORDER BY
              CASE WHEN organization_members.system_role = 'admin' THEN 0 ELSE 1 END,
              brand_profiles.id ASC
          ) AS rn
        FROM brand_profiles
        INNER JOIN users ON users.id = brand_profiles.user_id
        LEFT JOIN organization_members
          ON organization_members.user_id = users.id
          AND organization_members.organization_id = users.organization_id
        WHERE users.organization_id IS NOT NULL
      )
      UPDATE brand_profiles
      SET organization_id = ranked_profiles.organization_id
      FROM ranked_profiles
      WHERE brand_profiles.id = ranked_profiles.id
        AND ranked_profiles.rn = 1
        AND (
          brand_profiles.organization_id IS NULL
          OR brand_profiles.organization_id <> ranked_profiles.organization_id
        )
    `);
    await db.execute(sql`
      WITH ranked_profiles AS (
        SELECT
          brand_profiles.id,
          row_number() OVER (
            PARTITION BY brand_profiles.organization_id
            ORDER BY
              CASE WHEN organization_members.system_role = 'admin' THEN 0 ELSE 1 END,
              brand_profiles.id ASC
          ) AS rn
        FROM brand_profiles
        INNER JOIN users ON users.id = brand_profiles.user_id
        LEFT JOIN organization_members
          ON organization_members.user_id = users.id
          AND organization_members.organization_id = brand_profiles.organization_id
        WHERE brand_profiles.organization_id IS NOT NULL
      )
      UPDATE brand_profiles
      SET organization_id = NULL
      FROM ranked_profiles
      WHERE brand_profiles.id = ranked_profiles.id
        AND ranked_profiles.rn > 1
    `);
    await db.execute(sql`
      UPDATE brand_profiles
      SET organization_id = NULL
      WHERE organization_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM users
          WHERE users.id = brand_profiles.user_id
            AND users.organization_id = brand_profiles.organization_id
        )
    `);
    await db.execute(sql`
      UPDATE campaigns
      SET organization_id = users.organization_id
      FROM users
      WHERE users.id = campaigns.user_id
        AND users.organization_id IS NOT NULL
        AND (
          campaigns.organization_id IS NULL
          OR campaigns.organization_id <> users.organization_id
        )
    `);
    await db.execute(sql`
      UPDATE campaigns
      SET organization_id = NULL
      WHERE organization_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM organizations
          WHERE organizations.id = campaigns.organization_id
        )
    `);
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'brand_profiles_organization_id_organizations_id_fk'
        ) THEN
          ALTER TABLE brand_profiles
          ADD CONSTRAINT brand_profiles_organization_id_organizations_id_fk
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'campaigns_organization_id_organizations_id_fk'
        ) THEN
          ALTER TABLE campaigns
          ADD CONSTRAINT campaigns_organization_id_organizations_id_fk
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS brand_profiles_organization_id_unique
        ON brand_profiles (organization_id)
        WHERE organization_id IS NOT NULL
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS campaigns_organization_id_idx
        ON campaigns (organization_id)
    `);
  } catch (e: any) {
    console.error("Startup migration failed:", e?.message || e);
  }
}

export async function ensureSessionTableExists() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")
    `);
  } catch (e: any) {
    console.error("Session table bootstrap failed:", e?.message || e);
  }
}
