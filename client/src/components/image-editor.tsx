import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Type,
  Save,
  X,
  Undo2,
  Crop,
  SlidersHorizontal,
  Droplets,
  Sparkles,
  Eraser,
  Wand2,
  Palette,
  MessageSquare,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ImageEditorProps {
  imageUrl: string;
  open: boolean;
  onClose: () => void;
  onSave: (newUrl: string) => void;
  context?: "campaign" | "media";
  campaignId?: number;
  postId?: number;
  mediaFileId?: number;
}

type EditorTab = "adjust" | "filters" | "watermark" | "crop" | "ai";

type AIOperation =
  | "remove_background"
  | "enhance"
  | "style_transfer"
  | "prompt_edit";

const AI_STYLES = [
  "Watercolor Painting",
  "Oil Painting",
  "Pencil Sketch",
  "Pop Art",
  "Anime",
  "Cyberpunk",
  "Impressionist",
  "Minimalist Flat",
];

interface FilterPreset {
  name: string;
  brightness: number;
  contrast: number;
  saturate: number;
  grayscale: number;
  sepia: number;
  blur: number;
  hueRotate: number;
}

const FILTER_PRESETS: FilterPreset[] = [
  {
    name: "None",
    brightness: 100,
    contrast: 100,
    saturate: 100,
    grayscale: 0,
    sepia: 0,
    blur: 0,
    hueRotate: 0,
  },
  {
    name: "Grayscale",
    brightness: 100,
    contrast: 110,
    saturate: 0,
    grayscale: 100,
    sepia: 0,
    blur: 0,
    hueRotate: 0,
  },
  {
    name: "Sepia",
    brightness: 100,
    contrast: 100,
    saturate: 100,
    grayscale: 0,
    sepia: 80,
    blur: 0,
    hueRotate: 0,
  },
  {
    name: "Vintage",
    brightness: 110,
    contrast: 90,
    saturate: 70,
    grayscale: 0,
    sepia: 40,
    blur: 0,
    hueRotate: 0,
  },
  {
    name: "Warm",
    brightness: 105,
    contrast: 105,
    saturate: 130,
    grayscale: 0,
    sepia: 20,
    blur: 0,
    hueRotate: -10,
  },
  {
    name: "Cool",
    brightness: 100,
    contrast: 105,
    saturate: 90,
    grayscale: 0,
    sepia: 0,
    blur: 0,
    hueRotate: 20,
  },
  {
    name: "Dramatic",
    brightness: 90,
    contrast: 150,
    saturate: 120,
    grayscale: 0,
    sepia: 0,
    blur: 0,
    hueRotate: 0,
  },
  {
    name: "Fade",
    brightness: 115,
    contrast: 85,
    saturate: 80,
    grayscale: 10,
    sepia: 10,
    blur: 0,
    hueRotate: 0,
  },
  {
    name: "Vivid",
    brightness: 105,
    contrast: 120,
    saturate: 160,
    grayscale: 0,
    sepia: 0,
    blur: 0,
    hueRotate: 0,
  },
  {
    name: "Muted",
    brightness: 105,
    contrast: 95,
    saturate: 50,
    grayscale: 0,
    sepia: 10,
    blur: 0,
    hueRotate: 0,
  },
  {
    name: "B&W High",
    brightness: 110,
    contrast: 140,
    saturate: 0,
    grayscale: 100,
    sepia: 0,
    blur: 0,
    hueRotate: 0,
  },
  {
    name: "Sunset",
    brightness: 105,
    contrast: 110,
    saturate: 140,
    grayscale: 0,
    sepia: 30,
    blur: 0,
    hueRotate: -15,
  },
];

const CROP_PRESETS = [
  { name: "Free", ratio: 0 },
  { name: "1:1", ratio: 1 },
  { name: "4:5", ratio: 4 / 5 },
  { name: "16:9", ratio: 16 / 9 },
  { name: "9:16", ratio: 9 / 16 },
  { name: "4:3", ratio: 4 / 3 },
];

export function ImageEditor({
  imageUrl,
  open,
  onClose,
  onSave,
  context = "campaign",
  campaignId,
  postId,
  mediaFileId,
}: ImageEditorProps) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [loadingImage, setLoadingImage] = useState(true);
  const [activeTab, setActiveTab] = useState<EditorTab>("adjust");

  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturate, setSaturate] = useState(100);
  const [grayscale, setGrayscale] = useState(0);
  const [sepia, setSepia] = useState(0);
  const [blur, setBlur] = useState(0);
  const [hueRotate, setHueRotate] = useState(0);

  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  const [watermarkText, setWatermarkText] = useState("");
  const [watermarkSize, setWatermarkSize] = useState(32);
  const [watermarkOpacity, setWatermarkOpacity] = useState(50);
  const [watermarkColor, setWatermarkColor] = useState("#ffffff");
  const [watermarkPosition, setWatermarkPosition] = useState<
    "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right"
  >("bottom-right");

  const [isCropping, setIsCropping] = useState(false);
  const [cropRatio, setCropRatio] = useState(0);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [cropEnd, setCropEnd] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [croppedData, setCroppedData] = useState<ImageData | null>(null);

  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiOperation, setAiOperation] = useState<AIOperation | null>(null);
  const [selectedAiStyle, setSelectedAiStyle] = useState(AI_STYLES[0]);
  const [aiPromptText, setAiPromptText] = useState("");

  const resetAll = useCallback(() => {
    setBrightness(100);
    setContrast(100);
    setSaturate(100);
    setGrayscale(0);
    setSepia(0);
    setBlur(0);
    setHueRotate(0);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setWatermarkText("");
    setWatermarkSize(32);
    setWatermarkOpacity(50);
    setWatermarkColor("#ffffff");
    setWatermarkPosition("bottom-right");
    setIsCropping(false);
    setCropStart(null);
    setCropEnd(null);
    setCroppedData(null);
  }, []);

  useEffect(() => {
    if (!open || !imageUrl) return;
    setLoadingImage(true);
    resetAll();

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      originalImageRef.current = img;
      setLoadingImage(false);
    };
    img.onerror = () => {
      fetch(imageUrl)
        .then((res) => res.blob())
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const img2 = new Image();
          img2.onload = () => {
            originalImageRef.current = img2;
            setLoadingImage(false);
          };
          img2.src = url;
        })
        .catch(() => {
          toast({
            title: "Error",
            description: "Failed to load image.",
            variant: "destructive",
          });
          setLoadingImage(false);
        });
    };
    img.src = imageUrl;
  }, [open, imageUrl]);

  const getFilterString = useCallback(() => {
    return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) grayscale(${grayscale}%) sepia(${sepia}%) blur(${blur}px) hue-rotate(${hueRotate}deg)`;
  }, [brightness, contrast, saturate, grayscale, sepia, blur, hueRotate]);

  const drawCanvas = useCallback(
    (targetCanvas: HTMLCanvasElement, forExport = false) => {
      const img = originalImageRef.current;
      if (!img || !targetCanvas) return;

      const ctx = targetCanvas.getContext("2d");
      if (!ctx) return;

      let srcWidth = img.naturalWidth;
      let srcHeight = img.naturalHeight;

      if (croppedData) {
        srcWidth = croppedData.width;
        srcHeight = croppedData.height;
      }

      const isRotated90 = rotation === 90 || rotation === 270;
      const drawW = isRotated90 ? srcHeight : srcWidth;
      const drawH = isRotated90 ? srcWidth : srcHeight;

      if (forExport) {
        targetCanvas.width = drawW;
        targetCanvas.height = drawH;
      } else {
        const container = targetCanvas.parentElement;
        if (!container) return;
        const maxW = container.clientWidth;
        const maxH = container.clientHeight;
        const scale = Math.min(maxW / drawW, maxH / drawH, 1);
        targetCanvas.width = drawW * scale;
        targetCanvas.height = drawH * scale;
        ctx.scale(scale, scale);
      }

      ctx.filter = getFilterString();

      ctx.save();
      ctx.translate(drawW / 2, drawH / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      if (flipH) ctx.scale(-1, 1);
      if (flipV) ctx.scale(1, -1);

      if (croppedData) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = croppedData.width;
        tempCanvas.height = croppedData.height;
        const tempCtx = tempCanvas.getContext("2d");
        if (tempCtx) {
          tempCtx.putImageData(croppedData, 0, 0);
          ctx.drawImage(tempCanvas, -srcWidth / 2, -srcHeight / 2);
        }
      } else {
        ctx.drawImage(img, -srcWidth / 2, -srcHeight / 2);
      }
      ctx.restore();

      if (watermarkText) {
        ctx.filter = "none";
        const fontSize = forExport
          ? watermarkSize
          : Math.max(12, watermarkSize * (targetCanvas.width / drawW));
        ctx.font = `bold ${fontSize}px Arial, sans-serif`;
        ctx.fillStyle = watermarkColor;
        ctx.globalAlpha = watermarkOpacity / 100;
        ctx.textBaseline = "middle";

        const metrics = ctx.measureText(watermarkText);
        const textW = metrics.width;
        const padding = forExport ? 20 : 20 * (targetCanvas.width / drawW);
        const canvasW = forExport
          ? drawW
          : targetCanvas.width / (targetCanvas.width / drawW);
        const canvasH = forExport
          ? drawH
          : targetCanvas.height / (targetCanvas.height / drawH);

        let tx: number, ty: number;
        const actualCanvasW = targetCanvas.width;
        const actualCanvasH = targetCanvas.height;
        const scaleFactor = forExport ? 1 : actualCanvasW / drawW;

        switch (watermarkPosition) {
          case "top-left":
            tx = padding * scaleFactor;
            ty = (padding + fontSize / 2) * scaleFactor;
            ctx.textAlign = "left";
            break;
          case "top-right":
            tx = actualCanvasW - padding * scaleFactor;
            ty = (padding + fontSize / 2) * scaleFactor;
            ctx.textAlign = "right";
            break;
          case "bottom-left":
            tx = padding * scaleFactor;
            ty = actualCanvasH - (padding + fontSize / 2) * scaleFactor;
            ctx.textAlign = "left";
            break;
          case "bottom-right":
            tx = actualCanvasW - padding * scaleFactor;
            ty = actualCanvasH - (padding + fontSize / 2) * scaleFactor;
            ctx.textAlign = "right";
            break;
          case "center":
          default:
            tx = actualCanvasW / 2;
            ty = actualCanvasH / 2;
            ctx.textAlign = "center";
            break;
        }

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.font = `bold ${fontSize}px Arial, sans-serif`;
        ctx.fillStyle = watermarkColor;
        ctx.globalAlpha = watermarkOpacity / 100;

        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = forExport ? 2 : 1;
        ctx.strokeText(watermarkText, tx, ty);
        ctx.fillText(watermarkText, tx, ty);
        ctx.restore();
      }

      ctx.globalAlpha = 1;
    },
    [
      brightness,
      contrast,
      saturate,
      grayscale,
      sepia,
      blur,
      hueRotate,
      rotation,
      flipH,
      flipV,
      watermarkText,
      watermarkSize,
      watermarkOpacity,
      watermarkColor,
      watermarkPosition,
      croppedData,
      getFilterString,
    ],
  );

  useEffect(() => {
    if (!loadingImage && previewCanvasRef.current && originalImageRef.current) {
      drawCanvas(previewCanvasRef.current, false);
    }
  }, [loadingImage, drawCanvas]);

  useEffect(() => {
    if (!loadingImage && previewCanvasRef.current && originalImageRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        if (previewCanvasRef.current) {
          drawCanvas(previewCanvasRef.current, false);
        }
      });
      const container = previewCanvasRef.current.parentElement;
      if (container) resizeObserver.observe(container);
      return () => resizeObserver.disconnect();
    }
  }, [loadingImage, drawCanvas]);

  const applyFilter = (preset: FilterPreset) => {
    setBrightness(preset.brightness);
    setContrast(preset.contrast);
    setSaturate(preset.saturate);
    setGrayscale(preset.grayscale);
    setSepia(preset.sepia);
    setBlur(preset.blur);
    setHueRotate(preset.hueRotate);
  };

  const handleCropMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isCropping) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCropStart({ x, y });
    setCropEnd({ x, y });
    setIsDragging(true);
  };

  const handleCropMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isCropping || !isDragging || !cropStart) return;
    const rect = e.currentTarget.getBoundingClientRect();
    let x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    let y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    if (cropRatio > 0 && cropStart) {
      const dx = x - cropStart.x;
      const dy = y - cropStart.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const width = Math.max(absDx, absDy * cropRatio);
      const height = width / cropRatio;
      x = cropStart.x + (dx >= 0 ? width : -width);
      y = cropStart.y + (dy >= 0 ? height : -height);
    }

    setCropEnd({ x, y });
  };

  const handleCropMouseUp = () => {
    setIsDragging(false);
  };

  const applyCrop = () => {
    if (
      !cropStart ||
      !cropEnd ||
      !previewCanvasRef.current ||
      !originalImageRef.current
    )
      return;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = originalImageRef.current;
    const srcWidth = croppedData ? croppedData.width : img.naturalWidth;
    const srcHeight = croppedData ? croppedData.height : img.naturalHeight;
    const isRotated90 = rotation === 90 || rotation === 270;
    const drawW = isRotated90 ? srcHeight : srcWidth;
    const drawH = isRotated90 ? srcWidth : srcHeight;
    const scaleX = drawW / canvas.width;
    const scaleY = drawH / canvas.height;

    const x1 = Math.min(cropStart.x, cropEnd.x) * scaleX;
    const y1 = Math.min(cropStart.y, cropEnd.y) * scaleY;
    const w = Math.abs(cropEnd.x - cropStart.x) * scaleX;
    const h = Math.abs(cropEnd.y - cropStart.y) * scaleY;

    if (w < 10 || h < 10) return;

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = drawW;
    tempCanvas.height = drawH;
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return;

    tempCtx.save();
    tempCtx.translate(drawW / 2, drawH / 2);
    tempCtx.rotate((rotation * Math.PI) / 180);
    if (flipH) tempCtx.scale(-1, 1);
    if (flipV) tempCtx.scale(1, -1);

    if (croppedData) {
      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = croppedData.width;
      srcCanvas.height = croppedData.height;
      const srcCtx = srcCanvas.getContext("2d");
      if (srcCtx) {
        srcCtx.putImageData(croppedData, 0, 0);
        tempCtx.drawImage(srcCanvas, -srcWidth / 2, -srcHeight / 2);
      }
    } else {
      tempCtx.drawImage(img, -srcWidth / 2, -srcHeight / 2);
    }
    tempCtx.restore();

    const cropData = tempCtx.getImageData(x1, y1, w, h);
    setCroppedData(cropData);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setIsCropping(false);
    setCropStart(null);
    setCropEnd(null);
  };

  const drawCropOverlay = () => {
    if (!isCropping || !cropStart || !cropEnd || !previewCanvasRef.current)
      return null;
    const canvas = previewCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const containerRect = canvas.parentElement?.getBoundingClientRect();
    if (!containerRect) return null;

    const offsetX = rect.left - containerRect.left;
    const offsetY = rect.top - containerRect.top;

    const x = Math.min(cropStart.x, cropEnd.x) + offsetX;
    const y = Math.min(cropStart.y, cropEnd.y) + offsetY;
    const w = Math.abs(cropEnd.x - cropStart.x);
    const h = Math.abs(cropEnd.y - cropStart.y);

    return (
      <>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: w,
              height: h,
              backgroundColor: "transparent",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
              border: "2px dashed white",
            }}
          />
        </div>
      </>
    );
  };

  const handleSave = async () => {
    if (!originalImageRef.current) return;
    setIsSaving(true);
    try {
      const exportCanvas = document.createElement("canvas");
      drawCanvas(exportCanvas, true);
      const base64Data = exportCanvas.toDataURL("image/png");

      const res = await apiRequest("POST", "/api/upload-edited-image", {
        imageBase64: base64Data,
        context,
        campaignId,
        postId,
        mediaFileId,
      });
      const data = await res.json();
      onSave(data.url);
      onClose();
      toast({
        title: "Image saved",
        description: "Your edited image has been saved.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save edited image.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAiEdit = async (
    operation: AIOperation,
    style?: string,
    prompt?: string,
  ) => {
    if (!originalImageRef.current || aiProcessing) return;
    if (operation === "prompt_edit" && (!prompt || !prompt.trim())) {
      toast({
        title: "Prompt required",
        description: "Please describe how you want to edit the image.",
        variant: "destructive",
      });
      return;
    }
    setAiProcessing(true);
    setAiOperation(operation);
    try {
      const exportCanvas = document.createElement("canvas");
      drawCanvas(exportCanvas, true);
      const base64Data = exportCanvas.toDataURL("image/png");

      const res = await apiRequest("POST", "/api/ai-edit-image", {
        imageBase64: base64Data,
        operation,
        style,
        prompt,
      });
      const data = await res.json();

      const img = new Image();
      img.crossOrigin = "anonymous";
      setLoadingImage(true);
      img.onload = () => {
        originalImageRef.current = img;
        resetAll();
        setAiPromptText("");
        setLoadingImage(false);
        toast({
          title: "AI Edit Applied",
          description: `${operation === "remove_background" ? "Background removed" : operation === "enhance" ? "Image enhanced" : operation === "prompt_edit" ? "Prompt edit applied" : "Style applied"} successfully.`,
        });
      };
      img.onerror = () => {
        setLoadingImage(false);
        toast({
          title: "Error",
          description: "Failed to load AI-edited image.",
          variant: "destructive",
        });
      };
      img.src = data.imageBase64;
    } catch (error: any) {
      toast({
        title: "AI Edit Failed",
        description: error.message || "Something went wrong with the AI edit.",
        variant: "destructive",
      });
    } finally {
      setAiProcessing(false);
      setAiOperation(null);
    }
  };

  const generateFilterPreview = (preset: FilterPreset): string => {
    const img = originalImageRef.current;
    if (!img) return "";
    const size = 60;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    ctx.filter = `brightness(${preset.brightness}%) contrast(${preset.contrast}%) saturate(${preset.saturate}%) grayscale(${preset.grayscale}%) sepia(${preset.sepia}%) blur(${preset.blur}px) hue-rotate(${preset.hueRotate}deg)`;
    const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return c.toDataURL("image/jpeg", 0.5);
  };

  const [filterPreviews, setFilterPreviews] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    if (!loadingImage && originalImageRef.current && activeTab === "filters") {
      const previews: Record<string, string> = {};
      FILTER_PRESETS.forEach((preset) => {
        previews[preset.name] = generateFilterPreview(preset);
      });
      setFilterPreviews(previews);
    }
  }, [loadingImage, activeTab]);

  if (!open) return null;

  const tabs: { id: EditorTab; label: string; icon: any }[] = [
    { id: "adjust", label: "Adjust", icon: SlidersHorizontal },
    { id: "filters", label: "Filters", icon: Droplets },
    { id: "watermark", label: "Watermark", icon: Type },
    { id: "crop", label: "Crop", icon: Crop },
    { id: "ai", label: "AI", icon: Sparkles },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-[95vw] h-[90vh] p-0 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            {tabs.map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? "default" : "ghost"}
                size="sm"
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === "crop") {
                    setIsCropping(true);
                  } else {
                    setIsCropping(false);
                    setCropStart(null);
                    setCropEnd(null);
                  }
                }}
                data-testid={`button-tab-${tab.id}`}
              >
                <tab.icon className="w-4 h-4 mr-1" />
                {tab.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1 flex-wrap mr-8">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetAll}
              data-testid="button-reset-all"
            >
              <Undo2 className="w-4 h-4 mr-1" />
              Reset
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRotation((r) => (r + 270) % 360)}
              data-testid="button-rotate-left"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              data-testid="button-rotate-right"
            >
              <RotateCw className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFlipH((f) => !f)}
              data-testid="button-flip-h"
            >
              <FlipHorizontal className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFlipV((f) => !f)}
              data-testid="button-flip-v"
            >
              <FlipVertical className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              data-testid="button-save-image"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              Save
            </Button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex items-center justify-center bg-muted/30 p-4 relative overflow-hidden">
            {loadingImage ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  Loading image...
                </p>
              </div>
            ) : (
              <div className="relative flex items-center justify-center w-full h-full">
                <canvas
                  ref={previewCanvasRef}
                  className={isCropping ? "cursor-crosshair" : ""}
                  onMouseDown={handleCropMouseDown}
                  onMouseMove={handleCropMouseMove}
                  onMouseUp={handleCropMouseUp}
                  onMouseLeave={handleCropMouseUp}
                  data-testid="canvas-preview"
                />
                {drawCropOverlay()}
              </div>
            )}
          </div>

          <div className="w-80 border-l overflow-y-auto p-3 flex flex-col gap-3">
            {activeTab === "adjust" && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">
                    Brightness ({brightness}%)
                  </Label>
                  <Slider
                    min={0}
                    max={200}
                    step={1}
                    value={[brightness]}
                    onValueChange={([v]) => setBrightness(v)}
                    data-testid="slider-brightness"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">
                    Contrast ({contrast}%)
                  </Label>
                  <Slider
                    min={0}
                    max={200}
                    step={1}
                    value={[contrast]}
                    onValueChange={([v]) => setContrast(v)}
                    data-testid="slider-contrast"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">
                    Saturation ({saturate}%)
                  </Label>
                  <Slider
                    min={0}
                    max={200}
                    step={1}
                    value={[saturate]}
                    onValueChange={([v]) => setSaturate(v)}
                    data-testid="slider-saturate"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">
                    Grayscale ({grayscale}%)
                  </Label>
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[grayscale]}
                    onValueChange={([v]) => setGrayscale(v)}
                    data-testid="slider-grayscale"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">
                    Sepia ({sepia}%)
                  </Label>
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[sepia]}
                    onValueChange={([v]) => setSepia(v)}
                    data-testid="slider-sepia"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Blur ({blur}px)</Label>
                  <Slider
                    min={0}
                    max={20}
                    step={0.5}
                    value={[blur]}
                    onValueChange={([v]) => setBlur(v)}
                    data-testid="slider-blur"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">
                    Hue Rotate ({hueRotate}°)
                  </Label>
                  <Slider
                    min={-180}
                    max={180}
                    step={1}
                    value={[hueRotate]}
                    onValueChange={([v]) => setHueRotate(v)}
                    data-testid="slider-hue"
                  />
                </div>
              </>
            )}

            {activeTab === "filters" && (
              <div className="grid grid-cols-2 gap-2">
                {FILTER_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    className="flex flex-col items-center gap-1 p-1 rounded-md hover-elevate cursor-pointer border border-transparent hover:border-border"
                    onClick={() => applyFilter(preset)}
                    data-testid={`button-filter-${preset.name.toLowerCase()}`}
                  >
                    {filterPreviews[preset.name] ? (
                      <img
                        src={filterPreviews[preset.name]}
                        alt={preset.name}
                        className="w-full aspect-square rounded object-cover"
                      />
                    ) : (
                      <div className="w-full aspect-square rounded bg-muted" />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {preset.name}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {activeTab === "watermark" && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Watermark Text</Label>
                  <Input
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    placeholder="Enter watermark text..."
                    data-testid="input-watermark-text"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">
                    Font Size ({watermarkSize}px)
                  </Label>
                  <Slider
                    min={10}
                    max={120}
                    step={1}
                    value={[watermarkSize]}
                    onValueChange={([v]) => setWatermarkSize(v)}
                    data-testid="slider-watermark-size"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">
                    Opacity ({watermarkOpacity}%)
                  </Label>
                  <Slider
                    min={5}
                    max={100}
                    step={1}
                    value={[watermarkOpacity]}
                    onValueChange={([v]) => setWatermarkOpacity(v)}
                    data-testid="slider-watermark-opacity"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={watermarkColor}
                      onChange={(e) => setWatermarkColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border"
                      data-testid="input-watermark-color"
                    />
                    <Input
                      value={watermarkColor}
                      onChange={(e) => setWatermarkColor(e.target.value)}
                      className="flex-1"
                      data-testid="input-watermark-color-text"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Position</Label>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        ["top-left", "TL"],
                        ["top-right", "TR"],
                        ["center", "C"],
                        ["bottom-left", "BL"],
                        ["bottom-right", "BR"],
                      ] as const
                    ).map(([pos, label]) => (
                      <Button
                        key={pos}
                        variant={
                          watermarkPosition === pos ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setWatermarkPosition(pos)}
                        data-testid={`button-watermark-pos-${pos}`}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeTab === "crop" && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Aspect Ratio</Label>
                  <div className="grid grid-cols-2 gap-1">
                    {CROP_PRESETS.map((preset) => (
                      <Button
                        key={preset.name}
                        variant={
                          cropRatio === preset.ratio ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setCropRatio(preset.ratio)}
                        data-testid={`button-crop-${preset.name}`}
                      >
                        {preset.name}
                      </Button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Click and drag on the image to select the crop area.
                </p>
                {cropStart && cropEnd && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      onClick={applyCrop}
                      data-testid="button-apply-crop"
                    >
                      Apply Crop
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCropStart(null);
                        setCropEnd(null);
                      }}
                      data-testid="button-cancel-crop"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </>
            )}

            {activeTab === "ai" && (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-bold text-muted-foreground">
                  Use AI to transform your image. Each operation replaces the
                  current image.
                </p>

                <div className="space-y-2">
                  <Label className="text-xs font-medium flex items-center gap-1">
                    <Eraser className="w-3 h-3" />
                    Remove Background
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Strip the background and replace it with white.
                  </p>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => handleAiEdit("remove_background")}
                    disabled={aiProcessing}
                    data-testid="button-ai-remove-bg"
                  >
                    {aiProcessing && aiOperation === "remove_background" ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />{" "}
                        Processing...
                      </>
                    ) : (
                      <>
                        <Eraser className="w-4 h-4 mr-1" /> Remove Background
                      </>
                    )}
                  </Button>
                </div>

                <div className="border-t" />

                <div className="space-y-2">
                  <Label className="text-xs font-medium flex items-center gap-1">
                    <Wand2 className="w-3 h-3" />
                    Enhance Image
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Improve lighting, colors, and sharpness automatically.
                  </p>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => handleAiEdit("enhance")}
                    disabled={aiProcessing}
                    data-testid="button-ai-enhance"
                  >
                    {aiProcessing && aiOperation === "enhance" ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />{" "}
                        Enhancing...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 mr-1" /> Enhance Image
                      </>
                    )}
                  </Button>
                </div>

                <div className="border-t" />

                <div className="space-y-2">
                  <Label className="text-xs font-medium flex items-center gap-1">
                    <Palette className="w-3 h-3" />
                    Style Transfer
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Apply an artistic style to your image.
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {AI_STYLES.map((style) => (
                      <Button
                        key={style}
                        variant={
                          selectedAiStyle === style ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setSelectedAiStyle(style)}
                        data-testid={`button-ai-style-${style.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        {style}
                      </Button>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      handleAiEdit("style_transfer", selectedAiStyle)
                    }
                    disabled={aiProcessing}
                    data-testid="button-ai-apply-style"
                  >
                    {aiProcessing && aiOperation === "style_transfer" ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />{" "}
                        Styling...
                      </>
                    ) : (
                      <>
                        <Palette className="w-4 h-4 mr-1" /> Apply Style
                      </>
                    )}
                  </Button>
                </div>

                <div className="border-t" />

                <div className="space-y-2">
                  <Label className="text-xs font-medium flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    AI Prompt Edit
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Describe any edit in your own words — add objects, change
                    backgrounds, modify colors, and more.
                  </p>
                  <Textarea
                    value={aiPromptText}
                    onChange={(e) => setAiPromptText(e.target.value)}
                    placeholder="e.g. Add a sunset sky in the background, put sunglasses on the person, make the grass greener..."
                    rows={3}
                    className="resize-none text-sm"
                    data-testid="textarea-ai-prompt"
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      handleAiEdit("prompt_edit", undefined, aiPromptText)
                    }
                    disabled={aiProcessing}
                    data-testid="button-ai-apply-prompt"
                  >
                    {aiProcessing && aiOperation === "prompt_edit" ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />{" "}
                        Applying edit...
                      </>
                    ) : (
                      <>
                        <MessageSquare className="w-4 h-4 mr-1" /> Apply Edit
                      </>
                    )}
                  </Button>
                </div>

                {aiProcessing && (
                  <div className="mt-2 p-3 rounded-md bg-muted/50 text-center">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1 text-primary" />
                    <p className="text-xs text-muted-foreground">
                      AI is working on your image. This may take a moment...
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
//update//
