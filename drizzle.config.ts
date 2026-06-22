import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // The "session" table is managed at runtime by connect-pg-simple
  // (created via ensureSessionTableExists in server/db.ts), not by the Drizzle
  // schema. Exclude it so `drizzle-kit push` never tries to drop it.
  tablesFilter: ["!session"],
});
