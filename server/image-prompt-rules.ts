// Shared rules governing how an imagePrompt is written. Imported by the campaign
// post generator (server/routes.ts), the refine flow, and the backfill script
// (script/regenerate-image-prompts.ts) so the three can never drift apart.
//
// Context for why these are so blunt: the first generation of this app produced
// prompts like "a sleek modern website interface displaying AI data
// visualizations, a subtle logo is integrated", which render as UI screenshots
// full of garbled text — unusable on a brand feed. The rules below are written
// as prohibitions because that is what the text model actually respects.

export const IMAGE_PROMPT_RULES = `=== IMAGE PROMPT RULES ===
The imagePrompt is rendered by a text-to-image model into the visual that ships WITH its post. It must illustrate THAT SPECIFIC POST — not the company, not the industry in general.

1. ANCHOR TO THE POST, BUT TRANSLATE — NEVER RENDER THE PRODUCT LITERALLY. Identify the single most concrete thing the post is about — the milestone, the benefit, the number, the offer, the problem, the moment — then find a PHYSICAL, REAL-WORLD scene that evokes it. A reader seeing the image alone should sense the post's subject.
   Critically: when the post is about software, a website, an app, a platform, a dashboard, or "AI", do NOT depict that software. Depict the human outcome or a tangible metaphor instead.
   - "we launched a new website" → NOT a screenshot of a website. Instead: a shop's hand-painted OPEN sign being turned in a doorway at dawn; ribbon being cut; a freshly printed map unfolded on a table.
   - "AI that saves you time" → NOT a robot or a dashboard. Instead: an empty desk at 5pm with the chair pushed in and low golden light; a barista locking up early.
   - "25 years in business" → NOT a "25" graphic. Instead: worn workshop tools passed down; a tree's growth rings; a well-used leather ledger.
2. ONE FOCAL SUBJECT. Name one clear subject and put it at the centre. No busy collages, no split scenes, no three ideas competing for attention.
3. NO TEXT IN THE IMAGE. No words, letters, numerals, logos, wordmarks, UI labels, captions, or watermarks — image models render text as garbled glyphs and it looks broken on a brand feed. Express the idea through imagery alone. The caption carries the words.
4. BANNED VISUALS — these make marketing imagery look like filler. Never use any of them, even if the post is about software:
   - ANY user interface: website mockups, app screens, dashboards, analytics panels, data visualisations, charts, graphs, browser windows, phone or laptop screens with content on them. This is the single most common failure — do not describe a screen.
   - any logo, wordmark, brand mark, sign, or label
   - people gathered around a monitor or pointing at a chart; "diverse team in a modern office" stock scenes
   - glowing brains, glowing circuit boards, exposed microchips, humanoid robots, floating holograms
   - handshakes, rising arrows, ascending bars, lightbulbs, gears, jigsaw pieces
   - abstract blue swirls, particle networks, binary-code rain, hexagon grids, "digital" gradients
5. BE CONCRETE AND PHYSICAL. Prefer real, tangible, photographable scenes over abstract technology motifs. Name the subject, the setting, the action, the time of day, the lighting, and a specific colour palette. "A weathered brass workshop stopwatch resting on an architect's drafting table, warm afternoon light raking across it" beats "an image representing time and innovation".
6. VARY ACROSS POSTS. No two posts in this campaign may share a setting, subject, or composition. If one is a close-up object, make another a wide environment, another a human moment.
7. COMPOSITION. Keep the subject and all important detail in the CENTRE of the frame — the image is centre-cropped for publishing and the edges are discarded. No borders, no letterboxing, no device mockups or picture-frame effects.`;
