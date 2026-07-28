import { v2 as cloudinary } from "cloudinary";
import { toFile, APIError } from "openai";
import { getOpenAI } from "./openai-client";
import { PLATFORM_SETTINGS, type PlatformKey } from "@shared/schema";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Single constant so switching to gpt-image-1-mini (cheaper/faster) or away
// from a model that needs org verification is a one-line change.
const IMAGE_MODEL = "gpt-image-1";

// gpt-image-1 renders only these three shapes.
type GptImageSize = "1024x1024" | "1536x1024" | "1024x1536";

// Cost/latency dial. Roughly: low ~$0.01-0.02/image, medium ~$0.04-0.06,
// high ~$0.17-0.25. Overridable per environment.
const IMAGE_QUALITY: "low" | "medium" | "high" =
  process.env.OPENAI_IMAGE_QUALITY === "low" ||
  process.env.OPENAI_IMAGE_QUALITY === "high"
    ? process.env.OPENAI_IMAGE_QUALITY
    : "medium";

// gpt-image-1 always returns base64 — response_format is NOT supported for the
// GPT image models and sending it is a 400. Both images.generate and
// images.edit return this same shape, so one extractor covers all four sites.
// `data` and `b64_json` are both optional in the typings, hence the guard.
function extractImageBuffer(
  result: { data?: Array<{ b64_json?: string }> },
  context: string,
): Buffer {
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error(`No image data returned from ${context}`);
  }
  return Buffer.from(b64, "base64");
}

// The image routes relay error.message straight to the browser (see the
// /api/media/files/generate and /api/ai-edit-image handlers in routes.ts), and
// raw OpenAI errors leak account state — the gpt-image-1 org-verification
// notice in particular. Map to user-safe text here and keep detail in the log.
// No retry logic: the SDK already retries 408/409/429/5xx twice with backoff.
async function callImageApi<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof APIError) {
      console.error(`[image-service] ${label} failed:`, err.status, err.code, err.message);
      if (err.status === 400 || err.status === 422) {
        throw new Error("The image request was rejected — it may have been blocked by the content safety filter. Try rephrasing the prompt.");
      }
      if (err.status === 429) {
        throw new Error("Image generation is busy right now. Please try again in a moment.");
      }
      if (err.status === 401 || err.status === 403) {
        throw new Error("Image generation is not configured correctly. Please contact support.");
      }
      throw new Error("The image service is temporarily unavailable. Please try again.");
    }
    console.error(`[image-service] ${label} failed:`, err);
    throw err;
  }
}

function sizeForRatio(ratio: number): GptImageSize {
  if (ratio > 1.15) return "1536x1024";
  if (ratio < 0.87) return "1024x1536";
  return "1024x1024";
}

// Every PLATFORM_SETTINGS target is either square (instagram, 1:1) or ~1.9:1
// landscape (linkedin/x/facebook). gpt-image-1's widest is 1536x1024 (1.5:1),
// so landscape platforms are generated wide and then cropped to exact pixels by
// the crop:"fill"/gravity:"auto" transformation in uploadToCloudinary(). That
// discards ~20% of the height, which is why the prompt asks for a centred
// composition rather than stating raw pixel dimensions.
function platformImageSize(platform: PlatformKey): GptImageSize {
  const s = PLATFORM_SETTINGS[platform];
  return sizeForRatio(s.imageWidth / s.imageHeight);
}

const SIZE_ORIENTATION: Record<GptImageSize, string> = {
  "1024x1024": "square",
  "1536x1024": "wide landscape",
  "1024x1536": "tall portrait",
};

export async function generateImageFromPrompt(prompt: string, platform: PlatformKey): Promise<Buffer> {
  const settings = PLATFORM_SETTINGS[platform];
  const size = platformImageSize(platform);

  return callImageApi("generateImageFromPrompt", async () => {
    const result = await getOpenAI().images.generate({
      model: IMAGE_MODEL,
      prompt:
        `Editorial photograph, shot on assignment for a ${settings.label} post.\n\n` +
        `SCENE BRIEF:\n${prompt}\n\n` +
        `NON-NEGOTIABLE RENDERING RULES — these OVERRIDE the scene brief above wherever they conflict. ` +
        `If the brief asks for a screen, interface, logo, or text, IGNORE that part of the brief and substitute a ` +
        `real physical subject that conveys the same idea:\n` +
        `1. Zero text anywhere in the frame. No words, letters, numerals, logos, wordmarks, signage, captions, ` +
        `watermarks, or UI labels. Not even blurred or partial text.\n` +
        `2. No screens or interfaces of any kind — no websites, apps, dashboards, analytics panels, charts, ` +
        `graphs, browser windows, monitors, phones, tablets, or laptops displaying content.\n` +
        `3. No stock-photo clichés: people pointing at screens, glowing brains, glowing circuit boards, humanoid ` +
        `robots, floating holograms, teams around a conference monitor, handshakes, rising arrows, lightbulbs, ` +
        `gears, abstract blue swirls, particle networks, binary-code backgrounds.\n` +
        `4. A real, tangible, photographable scene with ONE clear focal subject. Natural light, believable depth ` +
        `of field, authentic materials and textures. Photojournalism, not corporate illustration.\n` +
        `5. Compose as a ${SIZE_ORIENTATION[size]} frame with the subject and all important detail well inside ` +
        `the CENTRE — the edges are cropped away for publishing at ${settings.imageLabel}. No borders, ` +
        `letterboxing, collages, split screens, device mockups, or picture frames.`,
      size,
      quality: IMAGE_QUALITY,
      output_format: "png",
      n: 1,
    });
    return extractImageBuffer(result, "image generation");
  });
}

export async function uploadToCloudinary(
  imageBuffer: Buffer,
  folder: string,
  publicId: string,
  platform: PlatformKey
): Promise<string> {
  const settings = PLATFORM_SETTINGS[platform];
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "image",
        format: "png",
        transformation: [
          { width: settings.imageWidth, height: settings.imageHeight, crop: "fill", gravity: "auto" },
        ],
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else if (result) {
          resolve(result.secure_url);
        } else {
          reject(new Error("No result from Cloudinary upload"));
        }
      }
    );
    uploadStream.end(imageBuffer);
  });
}

export async function uploadBufferToCloudinary(
  imageBuffer: Buffer,
  folder: string,
  publicId: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "image",
        format: "png",
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else if (result) {
          resolve(result.secure_url);
        } else {
          reject(new Error("No result from Cloudinary upload"));
        }
      }
    );
    uploadStream.end(imageBuffer);
  });
}

export async function uploadStreamToCloudinary(
  fileBuffer: Buffer,
  folder: string,
  publicId: string,
  format?: string,
): Promise<{ url: string; size: number }> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "image",
        format: format || "png",
      },
      (error, result) => {
        if (error) reject(error);
        else if (result) resolve({ url: result.secure_url, size: result.bytes });
        else reject(new Error("No result from Cloudinary upload"));
      }
    );
    uploadStream.end(fileBuffer);
  });
}

export async function generateMediaImage(prompt: string): Promise<Buffer> {
  return callImageApi("generateMediaImage", async () => {
    const result = await getOpenAI().images.generate({
      model: IMAGE_MODEL,
      prompt: `Generate a high-quality image based on this description: ${prompt}. The image should be visually appealing and professional.`,
      // "auto" lets the model pick the aspect that suits the prompt. The media
      // library has no target aspect and uploadBufferToCloudinary applies no
      // transformation, so the model's choice is the final asset.
      size: "auto",
      quality: IMAGE_QUALITY,
      output_format: "png",
      n: 1,
    });
    return extractImageBuffer(result, "media image generation");
  });
}

export type AIEditOperation = "remove_background" | "enhance" | "style_transfer" | "prompt_edit";

const EDIT_PROMPTS: Record<Exclude<AIEditOperation, "prompt_edit">, (style?: string) => string> = {
  remove_background: () =>
    "Remove the background from this image completely. Replace the background with a clean, pure white background. Keep the main subject intact with clean edges. Return only the edited image.",
  enhance: () =>
    "Enhance this image to look more professional. Improve the lighting, color balance, sharpness, and overall quality. Make the colors more vibrant and the image crisper. Do not change the subject or composition. Return only the enhanced image.",
  style_transfer: (style) =>
    `Transform this image into a ${style || "watercolor painting"} style. Apply the artistic style while keeping the main subject recognizable. Return only the styled image.`,
};

const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,/i;

type EditableMime = "image/png" | "image/jpeg" | "image/webp";

// gpt-image-1 accepts png / jpeg / webp for edit inputs.
function normalizeImageMime(declared: string): EditableMime | null {
  const m = declared.toLowerCase();
  if (m === "image/png") return "image/png";
  if (m === "image/jpeg" || m === "image/jpg") return "image/jpeg";
  if (m === "image/webp") return "image/webp";
  return null;
}

// Magic-byte sniff for callers that pass raw base64 with no data-URL prefix.
// This is load-bearing now: images.edit uploads multipart/form-data and
// validates the part's Content-Type, so a mislabelled image is a hard 400.
function sniffImageMime(bytes: Buffer): EditableMime {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return "image/jpeg";
}

const MIME_EXT: Record<EditableMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// images.edit needs a real file part (filename + Content-Type), not inline
// base64. toFile() accepts a Node Buffer directly and returns a File, which is
// a valid Uploadable.
async function toUploadableImage(imageBase64: string): Promise<{ file: File; bytes: Buffer }> {
  const match = imageBase64.match(DATA_URL_RE);
  const cleanBase64 = match ? imageBase64.slice(match[0].length) : imageBase64;
  const bytes = Buffer.from(cleanBase64, "base64");

  if (bytes.length === 0) {
    throw new Error("The supplied image is empty or not valid base64.");
  }
  if (bytes.length > 50 * 1024 * 1024) {
    throw new Error("The image is too large to edit (50MB maximum).");
  }

  const mime = (match && normalizeImageMime(match[1])) || sniffImageMime(bytes);
  const file = await toFile(bytes, `image.${MIME_EXT[mime]}`, { type: mime });
  return { file, bytes };
}

// PNG: 8-byte signature, then IHDR — length(4) + "IHDR"(4) + width(4 BE) +
// height(4 BE). Reading it directly avoids an image-decoding dependency. The
// editor canvas always exports PNG, which is the only path that reaches here.
function pngDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  if (bytes.toString("ascii", 12, 16) !== "IHDR") return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

// gpt-image-1 always renders one of three shapes, so an edit does NOT preserve
// the input's aspect ratio unless we ask for the nearest one. Without this a
// 1200x627 image silently comes back square.
function editSizeFor(bytes: Buffer): GptImageSize | "auto" {
  const dims = pngDimensions(bytes);
  if (!dims) return "auto";
  return sizeForRatio(dims.width / dims.height);
}

export async function aiEditImage(
  imageBase64: string,
  operation: Exclude<AIEditOperation, "prompt_edit">,
  style?: string
): Promise<Buffer> {
  const { file, bytes } = await toUploadableImage(imageBase64);

  return callImageApi(`aiEditImage:${operation}`, async () => {
    const result = await getOpenAI().images.edit({
      model: IMAGE_MODEL,
      image: file,
      prompt: EDIT_PROMPTS[operation](style),
      size: editSizeFor(bytes),
      quality: IMAGE_QUALITY,
      // remove_background and enhance must preserve the subject exactly;
      // style_transfer is intentionally transformational, so the cheaper
      // default fidelity is correct there.
      input_fidelity: operation === "style_transfer" ? "low" : "high",
      output_format: "png",
      n: 1,
    });
    return extractImageBuffer(result, "AI image editing");
  });
}

export async function aiPromptEditImage(
  imageBase64: string,
  prompt: string,
): Promise<Buffer> {
  const { file, bytes } = await toUploadableImage(imageBase64);

  return callImageApi("aiPromptEditImage", async () => {
    const result = await getOpenAI().images.edit({
      model: IMAGE_MODEL,
      image: file,
      prompt:
        `Edit this image according to the following instruction: ${prompt}. ` +
        `Apply the changes while keeping the rest of the image intact unless the instruction says otherwise. ` +
        `Return only the edited image.`,
      size: editSizeFor(bytes),
      quality: IMAGE_QUALITY,
      input_fidelity: "high",
      output_format: "png",
      n: 1,
    });
    return extractImageBuffer(result, "AI prompt-based image editing");
  });
}

export async function generateAndUploadImage(
  imagePrompt: string,
  campaignId: number,
  postId: number,
  platform: PlatformKey
): Promise<string> {
  const imageBuffer = await generateImageFromPrompt(imagePrompt, platform);
  const imageUrl = await uploadToCloudinary(
    imageBuffer,
    `campaignai/campaigns/${campaignId}`,
    `post_${postId}`,
    platform
  );
  return imageUrl;
}
