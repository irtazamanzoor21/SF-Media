import type { GoogleGenerativeAI } from "@google/generative-ai";

export interface Block {
  role: "user" | "assistant" | "unknown";
  content: string;
  source: string;
}

export interface SourceMeta {
  filenames: string[];
  fileCount: number;
  blockCount: number;
  totalChars: number;
  inputType: "paste" | "files";
}

export type ImportProgress =
  | { stage: "parsing"; current: number; total: number }
  | { stage: "filtering"; kept: number; total: number }
  | { stage: "summarizing"; current: number; total: number }
  | { stage: "extracting" }
  | { stage: "done" };

const HEADING_PATTERNS: Array<{ regex: RegExp; role: "user" | "assistant" }> = [
  { regex: /^\s*#{1,6}\s+(?:You|User|Human|Me|Prompt)\s*:?\s*$/i, role: "user" },
  { regex: /^\s*#{1,6}\s+(?:ChatGPT|Assistant|GPT|AI|Bot|Claude|Gemini|Bard)\s*:?\s*$/i, role: "assistant" },
  { regex: /^\s*\*\*(?:You|User|Human|Me|Prompt)\s*\*\*\s*:?\s*$/i, role: "user" },
  { regex: /^\s*\*\*(?:ChatGPT|Assistant|GPT|AI|Bot|Claude|Gemini|Bard)\s*\*\*\s*:?\s*$/i, role: "assistant" },
  { regex: /^\s*>\s*(?:You|User|Human|Me|Prompt)\s*:\s*$/i, role: "user" },
  { regex: /^\s*>\s*(?:ChatGPT|Assistant|GPT|AI|Bot|Claude|Gemini|Bard)\s*:\s*$/i, role: "assistant" },
];

const SIGNAL_KEYWORDS = [
  "brand", "voice", "tone", "audience", "customer", "post", "linkedin",
  "instagram", "facebook", "twitter", "caption", "tagline", "mission",
  "value prop", "messaging", "copy", "headline", "slogan", "campaign",
  "marketing", "social media", "content", "story", "narrative", "positioning",
];

export function parseMarkdown(text: string, source: string): Block[] {
  const lines = text.split(/\r?\n/);
  const blocks: Block[] = [];
  let currentRole: "user" | "assistant" | "unknown" = "unknown";
  let currentLines: string[] = [];
  let foundAnyMarker = false;

  const flush = () => {
    const content = currentLines.join("\n").trim();
    if (content) blocks.push({ role: currentRole, content, source });
    currentLines = [];
  };

  const detectMarker = (line: string): "user" | "assistant" | null => {
    for (const { regex, role } of HEADING_PATTERNS) {
      if (regex.test(line)) return role;
    }
    return null;
  };

  for (const line of lines) {
    const marker = detectMarker(line);
    if (marker) {
      flush();
      currentRole = marker;
      foundAnyMarker = true;
    } else {
      currentLines.push(line);
    }
  }
  flush();

  if (!foundAnyMarker) {
    const allContent = text.trim();
    if (!allContent) return [];
    return [{ role: "unknown", content: allContent, source }];
  }

  return blocks;
}

export interface FilterContext {
  companyName?: string | null;
  industry?: string | null;
  includeAssistant?: boolean;
  minLength?: number;
}

export function filterRelevantBlocks(blocks: Block[], ctx: FilterContext = {}): Block[] {
  const minLength = ctx.minLength ?? 100;
  const includeAssistant = ctx.includeAssistant ?? false;

  const keywords = [...SIGNAL_KEYWORDS];
  if (ctx.companyName) keywords.push(ctx.companyName.toLowerCase());
  if (ctx.industry) keywords.push(ctx.industry.toLowerCase());

  return blocks.filter((b) => {
    if (b.role === "assistant" && !includeAssistant) return false;
    if (b.content.length < minLength) return false;

    if (b.role === "unknown") {
      return true;
    }

    const lower = b.content.toLowerCase();
    return keywords.some((k) => lower.includes(k));
  });
}

const CHUNK_CHAR_TARGET = 150_000;

function buildSummarizePrompt(content: string): string {
  return `You are a brand strategist. The text below is excerpts from a marketer's past chat conversations and brand notes. Extract concrete brand voice signals only:

- Tone descriptors (how the brand sounds)
- Recurring phrases or vocabulary
- "Do" language patterns (words and phrases the brand uses)
- "Don't" language patterns (words and phrases the brand avoids)
- Target audience cues (who the brand talks to)
- Recurring messaging themes / pillars
- Any explicit brand guidelines or rules stated by the user

Be concise. Use bullet points. Do not invent — only summarize what's present in the text. Skip anything that is not about brand voice or messaging.

Excerpts:
${content}`;
}

function buildChunks(blocks: Block[]): string[] {
  const chunks: string[] = [];
  let buf = "";
  for (const b of blocks) {
    const piece = `--- [${b.role}] from ${b.source} ---\n${b.content}\n`;
    if (buf.length + piece.length > CHUNK_CHAR_TARGET && buf.length > 0) {
      chunks.push(buf);
      buf = "";
    }
    buf += piece;
  }
  if (buf.length > 0) chunks.push(buf);
  return chunks;
}

export async function chunkSummarize(
  blocks: Block[],
  genAI: GoogleGenerativeAI,
  onProgress?: (p: ImportProgress) => void,
): Promise<string> {
  const totalChars = blocks.reduce((n, b) => n + b.content.length, 0);

  if (totalChars <= CHUNK_CHAR_TARGET) {
    return blocks
      .map((b) => `--- [${b.role}] from ${b.source} ---\n${b.content}`)
      .join("\n\n");
  }

  const chunks = buildChunks(blocks);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0.3, maxOutputTokens: 2500 },
  });

  const summaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.({ stage: "summarizing", current: i + 1, total: chunks.length });
    const prompt = buildSummarizePrompt(chunks[i]);
    const result = await model.generateContent(prompt);
    const text = result.response.text() || "";
    if (text.trim()) summaries.push(`Chunk ${i + 1} of ${chunks.length}:\n${text.trim()}`);
  }
  return summaries.join("\n\n---\n\n");
}

export interface ImportInput {
  files?: Array<{ name: string; text: string }>;
  pasteText?: string;
  pasteTag?: "transcript" | "brand_notes" | "past_posts";
  includeAssistant?: boolean;
}

export interface ImportResult {
  condensedText: string;
  sourceMeta: SourceMeta;
  blocksKept: number;
  blocksTotal: number;
}

export async function runImportPipeline(
  input: ImportInput,
  ctx: { companyName?: string | null; industry?: string | null },
  genAI: GoogleGenerativeAI,
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const allBlocks: Block[] = [];
  const filenames: string[] = [];
  let inputType: "paste" | "files" = "files";

  if (input.pasteText && input.pasteText.trim()) {
    inputType = "paste";
    const tagLabel =
      input.pasteTag === "brand_notes" ? "brand notes" :
      input.pasteTag === "past_posts" ? "past posts" : "chat transcript";
    onProgress?.({ stage: "parsing", current: 1, total: 1 });
    const parsed = parseMarkdown(input.pasteText, `pasted ${tagLabel}`);
    allBlocks.push(...parsed);
    filenames.push(`Pasted ${tagLabel}`);
  } else if (input.files && input.files.length > 0) {
    inputType = "files";
    for (let i = 0; i < input.files.length; i++) {
      const f = input.files[i];
      onProgress?.({ stage: "parsing", current: i + 1, total: input.files.length });
      const parsed = parseMarkdown(f.text, f.name);
      allBlocks.push(...parsed);
      filenames.push(f.name);
    }
  }

  const blocksTotal = allBlocks.length;
  const filtered = filterRelevantBlocks(allBlocks, {
    companyName: ctx.companyName,
    industry: ctx.industry,
    includeAssistant: input.includeAssistant,
  });
  onProgress?.({ stage: "filtering", kept: filtered.length, total: blocksTotal });

  const blocksToUse = filtered.length > 0 ? filtered : allBlocks;
  const condensedText = await chunkSummarize(blocksToUse, genAI, onProgress);

  const totalChars = blocksToUse.reduce((n, b) => n + b.content.length, 0);

  return {
    condensedText,
    sourceMeta: {
      filenames,
      fileCount: filenames.length,
      blockCount: blocksTotal,
      totalChars,
      inputType,
    },
    blocksKept: filtered.length,
    blocksTotal,
  };
}

export const BRAND_VOICE_FIELDS = [
  "brandSummary",
  "targetAudience",
  "toneStyle",
  "messagingPillars",
  "doLanguageRules",
  "dontLanguageRules",
  "ctaPreferences",
  "hashtagThemes",
] as const;

export type BrandVoiceField = (typeof BRAND_VOICE_FIELDS)[number];

export const SCALAR_FIELDS = new Set<BrandVoiceField>([
  "brandSummary",
  "targetAudience",
  "toneStyle",
]);

export type FieldAction = "keep" | "replace" | "append";

export function mergeBrandVoice(
  current: Record<string, any>,
  extracted: Record<string, any>,
  actions: Partial<Record<BrandVoiceField, FieldAction>>,
): Partial<Record<BrandVoiceField, any>> {
  const update: Partial<Record<BrandVoiceField, any>> = {};

  for (const field of BRAND_VOICE_FIELDS) {
    const action = actions[field] || "keep";
    if (action === "keep") continue;

    const extractedVal = extracted[field];

    if (SCALAR_FIELDS.has(field)) {
      if (action === "replace" && typeof extractedVal === "string" && extractedVal.trim()) {
        update[field] = extractedVal.trim();
      }
      continue;
    }

    const extractedArr = Array.isArray(extractedVal) ? extractedVal.filter((v) => typeof v === "string" && v.trim()) : [];
    if (extractedArr.length === 0) continue;

    if (action === "replace") {
      update[field] = extractedArr;
    } else if (action === "append") {
      const currentArr = Array.isArray(current[field]) ? current[field] : [];
      const seen = new Set(currentArr.map((v: string) => v.toLowerCase().trim()));
      const merged = [...currentArr];
      for (const v of extractedArr) {
        const key = v.toLowerCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(v);
        }
      }
      update[field] = merged;
    }
  }

  return update;
}
