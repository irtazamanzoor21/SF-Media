import { GoogleGenerativeAI } from "@google/generative-ai";
import { v2 as cloudinary } from "cloudinary";
import { PLATFORM_SETTINGS, type PlatformKey } from "@shared/schema";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function generateImageFromPrompt(prompt: string, platform: PlatformKey): Promise<Buffer> {
  const settings = PLATFORM_SETTINGS[platform];

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-image",
    generationConfig: {
      responseModalities: ["Text", "Image"] as any,
    } as any,
  });

  const response = await model.generateContent(
    `Generate a high-quality social media image for ${settings.label} based on this description: ${prompt}. The image must be optimized for ${settings.label} at ${settings.imageWidth}x${settings.imageHeight} pixels (${settings.imageLabel}). The image should be visually appealing, professional, and suitable for social media marketing.`
  );

  const result = response.response;
  const candidates = result.candidates;

  if (!candidates || candidates.length === 0) {
    throw new Error("No image generated from Gemini");
  }

  for (const part of candidates[0].content.parts) {
    if (part.inlineData) {
      const imageData = part.inlineData.data;
      return Buffer.from(imageData!, "base64");
    }
  }

  throw new Error("No image data found in Gemini response");
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
        if (error) reject(error);
        else if (result) resolve(result.secure_url);
        else reject(new Error("No result from Cloudinary upload"));
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
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-image",
    generationConfig: {
      responseModalities: ["Text", "Image"] as any,
    } as any,
  });

  const response = await model.generateContent(
    `Generate a high-quality image based on this description: ${prompt}. The image should be visually appealing and professional.`
  );

  const result = response.response;
  const candidates = result.candidates;

  if (!candidates || candidates.length === 0) {
    throw new Error("No image generated from Gemini");
  }

  for (const part of candidates[0].content.parts) {
    if (part.inlineData) {
      return Buffer.from(part.inlineData.data!, "base64");
    }
  }

  throw new Error("No image data found in Gemini response");
}

export type AIEditOperation = "remove_background" | "enhance" | "style_transfer" | "prompt_edit";

export async function aiEditImage(
  imageBase64: string,
  operation: Exclude<AIEditOperation, "prompt_edit">,
  style?: string
): Promise<Buffer> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-image",
    generationConfig: {
      responseModalities: ["Text", "Image"] as any,
    } as any,
  });

  const prompts: Record<Exclude<AIEditOperation, "prompt_edit">, string> = {
    remove_background: "Remove the background from this image completely. Replace the background with a clean, pure white background. Keep the main subject intact with clean edges. Return only the edited image.",
    enhance: "Enhance this image to look more professional. Improve the lighting, color balance, sharpness, and overall quality. Make the colors more vibrant and the image crisper. Do not change the subject or composition. Return only the enhanced image.",
    style_transfer: `Transform this image into a ${style || "watercolor painting"} style. Apply the artistic style while keeping the main subject recognizable. Return only the styled image.`,
  };

  const mimeType = imageBase64.includes("data:image/png") ? "image/png" : "image/jpeg";
  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  const response = await model.generateContent([
    {
      inlineData: {
        mimeType,
        data: cleanBase64,
      },
    },
    prompts[operation],
  ]);

  const result = response.response;
  const candidates = result.candidates;

  if (!candidates || candidates.length === 0) {
    throw new Error("No result from AI image editing");
  }

  for (const part of candidates[0].content.parts) {
    if (part.inlineData) {
      return Buffer.from(part.inlineData.data!, "base64");
    }
  }

  throw new Error("No image data returned from AI editing");
}

// Sniff the image MIME from the first few base64-decoded bytes. The
// data-URL prefix check above catches data: URLs; this catches raw
// base64 (used by callers that fetched the bytes directly).
function sniffImageMime(base64: string): "image/png" | "image/jpeg" {
  const head = Buffer.from(base64.slice(0, 16), "base64");
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) {
    return "image/png";
  }
  return "image/jpeg";
}

export async function aiPromptEditImage(
  imageBase64: string,
  prompt: string,
  options: { wrapInstruction?: boolean } = {},
): Promise<Buffer> {
  const { wrapInstruction = true } = options;

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-image",
    generationConfig: {
      responseModalities: ["Text", "Image"] as any,
    } as any,
  });

  const hasDataUrl = imageBase64.includes("data:image/");
  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const mimeType: "image/png" | "image/jpeg" = hasDataUrl
    ? (imageBase64.includes("data:image/png") ? "image/png" : "image/jpeg")
    : sniffImageMime(cleanBase64);

  // The default wrapper is conservative — appropriate for the standalone
  // image editor's small surgical edits. Callers doing broader creative
  // refinement (e.g. /api/campaigns/.../refine) should pass
  // { wrapInstruction: false } so their own prompt takes full control;
  // stacking a "keep the rest intact" wrapper on top of a transformational
  // prompt produces near-identical outputs.
  const finalPrompt = wrapInstruction
    ? `Edit this image according to the following instruction: ${prompt}. Apply the changes while keeping the rest of the image intact unless the instruction says otherwise. Return only the edited image.`
    : prompt;

  const response = await model.generateContent([
    {
      inlineData: {
        mimeType,
        data: cleanBase64,
      },
    },
    finalPrompt,
  ]);

  const result = response.response;
  const candidates = result.candidates;

  if (!candidates || candidates.length === 0) {
    throw new Error("No result from AI prompt-based image editing");
  }

  for (const part of candidates[0].content.parts) {
    if (part.inlineData) {
      return Buffer.from(part.inlineData.data!, "base64");
    }
  }

  throw new Error("No image data returned from AI prompt-based editing");
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
