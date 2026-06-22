import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./db";

const MIGRATIONS_FOLDER = "./migrations";

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

function hashMigration(tag: string): string {
  const sqlText = readFileSync(
    join(MIGRATIONS_FOLDER, `${tag}.sql`),
    "utf-8",
  );
  return createHash("sha256").update(sqlText).digest("hex");
}

function readJournal(): Journal {
  const raw = readFileSync(
    join(MIGRATIONS_FOLDER, "meta", "_journal.json"),
    "utf-8",
  );
  return JSON.parse(raw);
}

async function bootstrapPrePushedDb(): Promise<void> {
  const probe = await pool.query<{ reg: string | null }>(
    "SELECT to_regclass('public.users') AS reg",
  );
  const schemaExists = probe.rows[0]?.reg !== null;
  if (!schemaExists) return;

  await pool.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id serial PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const existing = await pool.query<{ n: string }>(
    'SELECT COUNT(*)::text AS n FROM "drizzle"."__drizzle_migrations"',
  );
  if (Number(existing.rows[0]?.n ?? "0") > 0) return;

  const journal = readJournal();
  console.log(
    `[startup] baselining ${journal.entries.length} existing migration(s) against pre-populated schema`,
  );
  for (const entry of journal.entries) {
    const hash = hashMigration(entry.tag);
    await pool.query(
      'INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
      [hash, entry.when],
    );
  }
}

export async function runDrizzleMigrations(): Promise<void> {
  console.log("[startup] applying drizzle migrations...");
  await bootstrapPrePushedDb();
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  const verify = await pool.query<{ reg: string | null }>(
    "SELECT to_regclass('public.users') AS reg",
  );
  if (verify.rows[0]?.reg === null) {
    throw new Error(
      "Post-migration sanity check failed: 'users' table missing. Refusing to start.",
    );
  }
  console.log("[startup] migrations complete.");
}
