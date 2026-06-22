import { pool } from "../server/db";

async function main() {
  const check = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'campaign_posts' AND column_name = 'content_versions';
  `);
  if (check.rowCount && check.rowCount > 0) {
    console.log("content_versions column already exists — skipping.");
  } else {
    await pool.query(
      `ALTER TABLE campaign_posts ADD COLUMN content_versions text[] DEFAULT '{}'::text[];`,
    );
    console.log("Added column content_versions to campaign_posts.");
  }
  const verify = await pool.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'campaign_posts'
      AND column_name IN ('content_versions', 'image_urls')
    ORDER BY column_name;
  `);
  console.table(verify.rows);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
