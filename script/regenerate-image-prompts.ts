// Rewrites stored campaign_posts.image_prompt values using the current
// IMAGE_PROMPT_RULES. Needed because posts generated before those rules existed
// hold prompts like "a sleek modern website interface ... a subtle logo is
// integrated", which render as UI screenshots full of garbled text. The
// render-time wrapper in server/image-service.ts can suppress the text but
// cannot invent a better subject, so the stored prompt itself must be replaced.
//
// Does NOT touch post content, and does NOT regenerate images — it only updates
// the prompt. Regenerate images from the UI afterwards.
//
//   npx tsx script/regenerate-image-prompts.ts                  # dry run (default)
//   npx tsx script/regenerate-image-prompts.ts --apply          # write changes
//   npx tsx script/regenerate-image-prompts.ts --campaign 12    # limit to one campaign
//   npx tsx script/regenerate-image-prompts.ts --apply --all    # include already-clean prompts
import dotenv from "dotenv";
dotenv.config();

import { pool } from "../server/db";
import { generateText } from "../server/openai-client";
import { IMAGE_PROMPT_RULES } from "../server/image-prompt-rules";

const APPLY = process.argv.includes("--apply");
const ALL = process.argv.includes("--all");
const campaignArg = process.argv.indexOf("--campaign");
const CAMPAIGN_ID = campaignArg !== -1 ? Number(process.argv[campaignArg + 1]) : null;

// Markers of the pre-rules prompt style. Used only to pick which rows are worth
// rewriting; --all overrides it.
const STALE_MARKERS = /\b(interface|dashboard|screen|monitor|laptop|logo|UI|data visuali[sz]ation|chart|graph|hologram|glowing|circuit|neural network|futuristic|sleek, modern)\b/i;

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set — cannot regenerate prompts.");
    process.exit(1);
  }

  const params: any[] = [];
  let where = "p.image_prompt IS NOT NULL AND p.image_prompt <> ''";
  if (CAMPAIGN_ID !== null) {
    params.push(CAMPAIGN_ID);
    where += ` AND p.campaign_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT p.id, p.campaign_id, p.post_identifier, p.platform, p.content, p.image_prompt,
            c.company_name AS campaign_name, c.description AS campaign_description, c.tone
       FROM campaign_posts p
       JOIN campaigns c ON c.id = p.campaign_id
      WHERE ${where}
      ORDER BY p.id`,
    params,
  );

  const targets = ALL ? rows : rows.filter((r) => STALE_MARKERS.test(r.image_prompt));
  console.log(
    `${rows.length} post(s) with a stored prompt; ${targets.length} need rewriting` +
      (ALL ? " (--all)" : " (matched the stale-style heuristic)"),
  );
  if (!APPLY) console.log("DRY RUN — nothing will be written. Re-run with --apply to save.\n");
  else console.log("APPLY mode — rows will be updated.\n");

  let changed = 0;
  // Rule 6 (vary across posts) only works if each rewrite knows what its
  // siblings already used — otherwise every post in a campaign converges on the
  // same metaphor. Tracked per campaign.
  const usedByCampaign = new Map<number, string[]>();

  for (const r of targets) {
    const label = r.post_identifier || `#${r.id}`;
    const used = usedByCampaign.get(r.campaign_id) ?? [];
    const avoidBlock = used.length
      ? `\nSCENES ALREADY USED BY OTHER POSTS IN THIS CAMPAIGN — yours must be visually distinct from every one of them (different subject, setting, and composition):\n${used.map((u, i) => `${i + 1}. ${u}`).join("\n")}\n`
      : "";
    let next: string;
    try {
      next = (
        await generateText({
          label: "backfill-image-prompt",
          temperature: 0.8,
          maxTokens: 400,
          prompt: `You are a social media art director rewriting the image prompt for an existing post.

Campaign: ${r.campaign_name}
Campaign topic: ${r.campaign_description || "(none)"}
Tone: ${r.tone || "(unspecified)"}
Platform: ${r.platform}

THE POST:
"${r.content}"

THE OLD IMAGE PROMPT (written before the rules below existed — it is the problem, do not preserve it):
"${r.image_prompt}"

${IMAGE_PROMPT_RULES}
${avoidBlock}
Write ONE replacement imagePrompt for this post, 50 to 100 words, obeying every rule above.
Output ONLY the prompt text — no preamble, no quotes, no labels.`,
        })
      ).trim();
    } catch (e: any) {
      console.error(`  ${label}: FAILED — ${e.message}`);
      continue;
    }

    if (!next) {
      console.error(`  ${label}: FAILED — empty response`);
      continue;
    }

    console.log(`── ${label} (${r.platform})`);
    console.log(`   OLD: ${r.image_prompt.slice(0, 150)}${r.image_prompt.length > 150 ? "…" : ""}`);
    console.log(`   NEW: ${next.slice(0, 150)}${next.length > 150 ? "…" : ""}`);
    if (STALE_MARKERS.test(next)) {
      console.log(`   ⚠  the rewrite still mentions a banned motif — review this one by hand`);
    }
    console.log();

    usedByCampaign.set(r.campaign_id, [...used, next]);

    if (APPLY) {
      await pool.query(`UPDATE campaign_posts SET image_prompt = $1 WHERE id = $2`, [next, r.id]);
      changed++;
    }
  }

  console.log(
    APPLY
      ? `Updated ${changed} post(s). Regenerate their images from the UI to see the new visuals.`
      : `Dry run complete — ${targets.length} post(s) would be rewritten.`,
  );
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
