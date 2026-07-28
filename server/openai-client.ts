import OpenAI from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";

export const TEXT_MODEL = "gpt-4.1-mini";

let client: OpenAI | null = null;

// MUST stay lazy. server/index.ts imports ./routes (line 2) before it calls
// dotenv.config() (line 14), so OPENAI_API_KEY is still undefined at module-eval
// time in dev — and `new OpenAI()` throws on a missing key, unlike
// GoogleGenerativeAI, which silently accepted undefined. Constructing at module
// scope would crash boot instead of failing at the first AI call.
export function getOpenAI(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set — AI features are unavailable. Add it to .env (dev) or the service env (prod).",
    );
  }
  client = new OpenAI({ apiKey, maxRetries: 2, timeout: 120_000 });
  return client;
}

// Non-fatal boot check. Mirrors the previous behaviour: a missing key leaves the
// app serving normally and fails only the AI routes.
export function logAiConfig(): void {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("[ai] OPENAI_API_KEY is not set — AI features will fail at call time.");
  }
}

export interface GenerateTextOptions {
  /** Plain string, or content parts for multimodal (image) prompts. */
  prompt: string | ChatCompletionContentPart[];
  temperature?: number;
  maxTokens?: number;
  /**
   * Sets response_format json_object. ONLY for prompts that return a top-level
   * JSON *object* — json_object mode never returns a bare array, so call sites
   * that parse a top-level array must leave this off.
   */
  json?: boolean;
  /** Log label, e.g. "brand-voice". */
  label?: string;
}

export async function generateText(o: GenerateTextOptions): Promise<string> {
  const completion = await getOpenAI().chat.completions.create({
    model: TEXT_MODEL,
    messages: [{ role: "user", content: o.prompt as any }],
    ...(o.temperature !== undefined ? { temperature: o.temperature } : {}),
    ...(o.maxTokens !== undefined ? { max_tokens: o.maxTokens } : {}),
    ...(o.json ? { response_format: { type: "json_object" as const } } : {}),
  });

  const choice = completion.choices[0];
  if (choice?.finish_reason === "length") {
    console.warn(
      `[ai:${o.label ?? "text"}] truncated at max_tokens=${o.maxTokens} (finish_reason=length) — output may be incomplete`,
    );
  }
  return choice?.message?.content ?? "";
}
