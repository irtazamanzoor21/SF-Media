import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, X, FileText, Image as ImageIcon, Link as LinkIcon, Sparkles, Check, Plus, ArrowRight, Building2, Palette, FileSearch, ScanSearch, FileType, BrainCircuit, MessageSquareText, Target, Hash, Megaphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { INDUSTRIES, isValidWebsiteUrl, type BrandProfile } from "@shared/schema";

// Industries shown A–Z for predictable selection, with the catch-all "Other" pinned last.
const SORTED_INDUSTRIES = [...INDUSTRIES].sort((a, b) => {
  if (a === "Other") return 1;
  if (b === "Other") return -1;
  return a.localeCompare(b);
});

const EXTRACTION_MESSAGES = [
  { text: "Reading your documents...", icon: FileType },
  { text: "Scanning for key information...", icon: ScanSearch },
  { text: "Extracting brand details...", icon: FileSearch },
  { text: "Processing content structure...", icon: BrainCircuit },
  { text: "Identifying brand language...", icon: Sparkles },
  { text: "Almost there...", icon: Check },
];

const ANALYSIS_MESSAGES = [
  { text: "Analyzing your brand voice...", icon: Sparkles },
  { text: "Identifying tone and style...", icon: MessageSquareText },
  { text: "Mapping target audience...", icon: Target },
  { text: "Crafting messaging pillars...", icon: Megaphone },
  { text: "Generating hashtag themes...", icon: Hash },
  { text: "Building your brand profile...", icon: BrainCircuit },
  { text: "Finalizing analysis...", icon: Check },
];

function AnimatedLoadingOverlay({ messages, testIdPrefix }: { messages: Array<{ text: string; icon: React.ComponentType<{ className?: string }> }>; testIdPrefix: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [progressWidth, setProgressWidth] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % messages.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [messages.length]);

  useEffect(() => {
    const timer = setTimeout(() => setProgressWidth(5), 100);
    const interval = setInterval(() => {
      setProgressWidth((prev) => Math.min(prev + Math.random() * 8 + 2, 92));
    }, 2000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" data-testid={`overlay-${testIdPrefix}-loading`}>
      <div className="flex flex-col items-center gap-8 p-8 max-w-sm w-full">
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full border-4 border-muted" />
          <div
            className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"
            style={{ animationDuration: "1.2s" }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            {(() => {
              const Icon = messages[activeIndex].icon;
              return (
                <Icon
                  key={activeIndex}
                  className="w-8 h-8 text-primary animate-in fade-in zoom-in duration-500"
                />
              );
            })()}
          </div>
        </div>

        <div className="w-full h-12 overflow-hidden relative">
          {messages.map((msg, i) => (
            <div
              key={i}
              className="absolute inset-0 flex items-center justify-center text-center transition-all duration-500 ease-in-out"
              style={{
                opacity: i === activeIndex ? 1 : 0,
                transform: i === activeIndex
                  ? "translateY(0)"
                  : i < activeIndex || (activeIndex === 0 && i === messages.length - 1)
                  ? "translateY(-20px)"
                  : "translateY(20px)",
              }}
            >
              <p className="text-lg font-medium" data-testid={`text-${testIdPrefix}-message-${i}`}>{msg.text}</p>
            </div>
          ))}
        </div>

        <div className="w-full space-y-2">
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden" data-testid={`progress-${testIdPrefix}`}>
            <div
              className="h-full rounded-full bg-primary transition-all duration-1000 ease-out"
              style={{ width: `${progressWidth}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            This may take a moment
          </p>
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  const labels = ["Company Info", "Upload Files", "Brand Profile"];
  const displayStep = currentStep >= 2 ? Math.min(currentStep - 1, 2) : currentStep;
  return (
    <div className="w-full max-w-3xl mx-auto mb-8">
      <div className="flex items-center justify-between mb-3">
        {labels.map((label, i) => (
          <div key={label} className="flex flex-col items-center gap-1.5 flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                i < displayStep
                  ? "bg-primary text-primary-foreground"
                  : i === displayStep
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i < displayStep ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-xs hidden sm:block ${i <= displayStep ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              {label}
            </span>
          </div>
        ))}
      </div>
      <Progress value={(displayStep / (labels.length - 1)) * 100} className="h-1" />
    </div>
  );
}

function Step1CompanyInfo({
  companyName,
  setCompanyName,
  industry,
  setIndustry,
  onNext,
}: {
  companyName: string;
  setCompanyName: (v: string) => void;
  industry: string;
  setIndustry: (v: string) => void;
  onNext: () => void;
}) {
  const isCompanyNameInvalid = companyName.length > 0 && companyName.trim().length === 0;
  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Building2 className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold mb-2">Tell us about your company</h2>
        <p className="text-muted-foreground">This helps us tailor AI-generated content to your industry and brand.</p>
      </div>
      <Card className="p-6 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="company-name">Company Name</Label>
          <Input
            id="company-name"
            placeholder="e.g., Acme Inc."
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            aria-invalid={isCompanyNameInvalid}
            data-testid="input-company-name"
          />
          {isCompanyNameInvalid && (
            <p className="text-sm text-destructive" data-testid="error-company-name">
              Company name cannot be empty or contain only spaces.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="industry">Industry</Label>
          <Select value={industry} onValueChange={setIndustry}>
            <SelectTrigger data-testid="select-industry">
              <SelectValue placeholder="Select your industry" />
            </SelectTrigger>
            <SelectContent>
              {SORTED_INDUSTRIES.map((ind) => (
                <SelectItem key={ind} value={ind}>{ind}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          className="w-full gap-2"
          onClick={onNext}
          disabled={!companyName.trim() || !industry}
          data-testid="button-step1-next"
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </Button>
      </Card>
    </div>
  );
}

function Step2BrandVoice({
  files,
  setFiles,
  url,
  setUrl,
  onExtract,
  isExtracting,
}: {
  files: File[];
  setFiles: (f: File[]) => void;
  url: string;
  setUrl: (v: string) => void;
  onExtract: () => void;
  isExtracting: boolean;
}) {
  const { toast } = useToast();
  const isUrlInvalid = url.trim().length > 0 && !isValidWebsiteUrl(url);
  const canExtract = (files.length > 0 || url.trim().length > 0) && !isUrlInvalid;
  const allowedTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "image/png",
    "image/jpeg",
  ];

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    const validFiles: File[] = [];

    for (const file of newFiles) {
      if (!allowedTypes.includes(file.type)) {
        toast({ title: `Unsupported file type: ${file.name}`, variant: "destructive" });
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: `File too large: ${file.name} (max 10MB)`, variant: "destructive" });
        continue;
      }
      if (files.length + validFiles.length >= 3) {
        toast({ title: "Maximum 3 files allowed", variant: "destructive" });
        break;
      }
      validFiles.push(file);
    }

    setFiles([...files, ...validFiles]);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) return <ImageIcon className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  if (isExtracting) {
    return <AnimatedLoadingOverlay messages={EXTRACTION_MESSAGES} testIdPrefix="extraction" />;
  }

  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Palette className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold mb-2">Define your brand voice</h2>
        <p className="text-muted-foreground">Upload documents or provide a URL so AI can understand your brand.</p>
      </div>
      <Card className="p-6 space-y-5">
        <div className="space-y-2">
          <Label>Upload Files</Label>
          <p className="text-xs text-muted-foreground">PDF, DOCX, TXT, PNG, JPG — Max 3 files, 10MB each</p>
          <label
            className="flex flex-col items-center justify-center border-2 border-dashed rounded-md p-6 cursor-pointer hover-elevate transition-colors"
            data-testid="input-file-upload"
          >
            <Upload className="w-8 h-8 text-muted-foreground mb-2" />
            <span className="text-sm text-muted-foreground">Click to upload or drag and drop</span>
            <input
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
              onChange={handleFileAdd}
            />
          </label>
          {files.length > 0 && (
            <div className="space-y-2 mt-3">
              {files.map((file, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-md bg-muted/50">
                  {getFileIcon(file.type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFile(i)}
                    data-testid={`button-remove-file-${i}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">
              Or provide a URL
            </span>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="brand-url">Website URL</Label>
          <div className="relative">
            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="brand-url"
              placeholder="https://yourcompany.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="pl-9"
              aria-invalid={isUrlInvalid}
              data-testid="input-brand-url"
            />
          </div>
          {isUrlInvalid && (
            <p className="text-sm text-destructive" data-testid="error-brand-url">
              Please enter a valid website URL (e.g. https://yourcompany.com).
            </p>
          )}
        </div>
        <Button
          className="w-full gap-2"
          onClick={onExtract}
          disabled={!canExtract}
          data-testid="button-step2-extract"
        >
          <FileSearch className="w-4 h-4" />
          Extract Information
        </Button>
      </Card>
    </div>
  );
}

function Step3ReviewContent({
  extractions,
  onRemoveExtraction,
  onAnalyze,
  isAnalyzing,
}: {
  extractions: Array<{ source: string; text: string }>;
  onRemoveExtraction: (index: number) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
}) {
  if (isAnalyzing) {
    return <AnimatedLoadingOverlay messages={ANALYSIS_MESSAGES} testIdPrefix="analysis" />;
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <FileSearch className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold mb-2">Review extracted content</h2>
        <p className="text-muted-foreground">Here's what we extracted from your files and URL. Remove anything you don't want the AI to use.</p>
      </div>

      <div className="space-y-4">
        {extractions.map((extraction, i) => (
          <Card key={i} className="p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="secondary" className="flex-shrink-0">Source {i + 1}</Badge>
                <span className="text-sm font-medium truncate">{extraction.source}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemoveExtraction(i)}
                data-testid={`button-remove-extraction-${i}`}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            {(extraction as any).unreachable ? (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3">
                <p className="text-sm text-amber-800 dark:text-amber-200" data-testid={`text-extraction-${i}`}>
                  The website couldn't be accessed directly (it may have bot protection), but our AI will use its knowledge of this company to build your brand profile.
                </p>
              </div>
            ) : (
              <div className="bg-muted/50 rounded-md p-3 max-h-48 overflow-auto">
                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed" data-testid={`text-extraction-${i}`}>
                  {extraction.text.length > 2000
                    ? extraction.text.slice(0, 2000) + "..."
                    : extraction.text}
                </p>
              </div>
            )}
            {!(extraction as any).unreachable && (
              <p className="text-xs text-muted-foreground mt-2">
                {extraction.text.length.toLocaleString()} characters extracted
              </p>
            )}
          </Card>
        ))}

        {extractions.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground text-sm">No content extracted. Go back and upload files or provide a URL.</p>
          </Card>
        )}
      </div>

      <Button
        className="w-full mt-6 gap-2"
        onClick={onAnalyze}
        disabled={extractions.length === 0}
        data-testid="button-step3-analyze"
      >
        <Sparkles className="w-4 h-4" />
        Analyze Brand Voice
      </Button>
    </div>
  );
}

function Step4Analyzing() {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col items-center justify-center py-16">
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-10 h-10 text-primary animate-pulse" />
        </div>
        <div className="absolute inset-0 w-24 h-24 rounded-full border-2 border-primary/30 animate-ping" />
        <div
          className="absolute -inset-4 w-32 h-32 rounded-full border border-primary/10"
          style={{ animation: "spin 8s linear infinite" }}
        />
      </div>
      <h2 className="text-2xl font-semibold mb-2">Analyzing your brand voice{dots}</h2>
      <p className="text-muted-foreground text-center max-w-sm mb-8">
        Our AI is reading through your content and extracting your unique brand identity. This usually takes 15-30 seconds.
      </p>
      <div className="flex gap-4 flex-wrap justify-center">
        {["Identifying tone", "Mapping audience", "Building profile"].map((step) => (
          <Badge key={step} variant="secondary" className="text-xs">
            {step}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function stripMd(text: string): string {
  return text.replace(/\*\*|__|\*|_|`/g, "").trim();
}

function EditableList({
  items,
  onChange,
  placeholder,
  testIdPrefix,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  testIdPrefix: string;
}) {
  const [newItem, setNewItem] = useState("");

  const addItem = () => {
    if (newItem.trim()) {
      onChange([...items, newItem.trim()]);
      setNewItem("");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 overflow-hidden">
        {items.map((item, i) => (
          <Badge key={i} variant="secondary" className="gap-1 pr-1 whitespace-normal break-words max-w-full">
            {stripMd(item)}
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="ml-1 rounded-sm hover:bg-muted flex-shrink-0"
              data-testid={`${testIdPrefix}-remove-${i}`}
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem())}
          data-testid={`${testIdPrefix}-input`}
        />
        <Button variant="outline" size="icon" onClick={addItem} data-testid={`${testIdPrefix}-add`}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function Step5ReviewProfileAndPosts({
  brandProfile,
  onUpdate,
  onSave,
  isSaving,
  savedProfile,
}: {
  brandProfile: Partial<BrandProfile>;
  onUpdate: (data: Partial<BrandProfile>) => void;
  onSave: () => void;
  isSaving: boolean;
  savedProfile: BrandProfile | null;
}) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const postOnboardingRoute = "/dashboard";
  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold mb-2">Your brand profile</h2>
        <p className="text-muted-foreground">
          {savedProfile
            ? "Profile saved! Here are your sample posts. Head to the dashboard to get started."
            : "Review and edit your brand profile, then save to generate sample posts."}
        </p>
      </div>

      {!savedProfile && (
        <Card className="p-6 space-y-6 mb-6">
          <div className="space-y-2">
            <Label>Brand Summary</Label>
            <Textarea
              value={brandProfile.brandSummary || ""}
              onChange={(e) => onUpdate({ brandSummary: e.target.value })}
              className="min-h-[80px]"
              data-testid="textarea-brand-summary"
            />
          </div>
          <div className="space-y-2">
            <Label>Target Audience</Label>
            <Textarea
              value={brandProfile.targetAudience || ""}
              onChange={(e) => onUpdate({ targetAudience: e.target.value })}
              data-testid="textarea-target-audience"
            />
          </div>
          <div className="space-y-2">
            <Label>Tone Style</Label>
            <Input
              value={brandProfile.toneStyle || ""}
              onChange={(e) => onUpdate({ toneStyle: e.target.value })}
              data-testid="input-tone-style"
            />
          </div>
          <div className="space-y-2">
            <Label>Messaging Pillars</Label>
            <EditableList
              items={brandProfile.messagingPillars || []}
              onChange={(items) => onUpdate({ messagingPillars: items })}
              placeholder="Add a messaging pillar"
              testIdPrefix="messaging-pillars"
            />
          </div>
          <div className="space-y-2">
            <Label>Do Language Rules</Label>
            <EditableList
              items={brandProfile.doLanguageRules || []}
              onChange={(items) => onUpdate({ doLanguageRules: items })}
              placeholder="Add a do rule"
              testIdPrefix="do-rules"
            />
          </div>
          <div className="space-y-2">
            <Label>Don't Language Rules</Label>
            <EditableList
              items={brandProfile.dontLanguageRules || []}
              onChange={(items) => onUpdate({ dontLanguageRules: items })}
              placeholder="Add a don't rule"
              testIdPrefix="dont-rules"
            />
          </div>
          <div className="space-y-2">
            <Label>CTA Preferences</Label>
            <EditableList
              items={brandProfile.ctaPreferences || []}
              onChange={(items) => onUpdate({ ctaPreferences: items })}
              placeholder="Add a CTA preference"
              testIdPrefix="cta-prefs"
            />
          </div>
          <div className="space-y-2">
            <Label>Custom CTAs</Label>
            <p className="text-xs text-muted-foreground">
              Shown in the Call-to-Action dropdown when creating a campaign.
            </p>
            <EditableList
              items={brandProfile.customCtas || []}
              onChange={(items) => onUpdate({ customCtas: items })}
              placeholder="e.g. Book a Demo"
              testIdPrefix="custom-ctas"
            />
          </div>
          <div className="space-y-2">
            <Label>Hashtag Themes</Label>
            <EditableList
              items={brandProfile.hashtagThemes || []}
              onChange={(items) => onUpdate({ hashtagThemes: items })}
              placeholder="Add a hashtag theme"
              testIdPrefix="hashtag-themes"
            />
          </div>
          <Button
            className="w-full gap-2"
            onClick={onSave}
            disabled={isSaving}
            data-testid="button-save-profile"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {isSaving ? "Saving & generating sample posts..." : "Save Profile & Generate Sample Posts"}
          </Button>
        </Card>
      )}

      {savedProfile && (
        <>
          <div className="space-y-4 mb-8">
            <h3 className="text-lg font-semibold">Sample Posts</h3>
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-md bg-blue-600 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">in</span>
                </div>
                <span className="font-semibold text-sm">LinkedIn Post</span>
                <Badge variant="secondary" className="ml-auto text-xs">150-250 words</Badge>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm" data-testid="text-linkedin-post">
                {savedProfile.sampleLinkedinPost || "No post generated."}
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)" }}>
                  <span className="text-white text-xs font-bold">ig</span>
                </div>
                <span className="font-semibold text-sm">Instagram Post</span>
                <Badge variant="secondary" className="ml-auto text-xs">50-150 words</Badge>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm" data-testid="text-instagram-post">
                {savedProfile.sampleInstagramPost || "No post generated."}
              </div>
            </Card>
          </div>
          <Button
            className="w-full gap-2"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/user"] });
              setLocation(postOnboardingRoute);
            }}
            data-testid="button-finish-onboarding"
          >
            Go to Dashboard
            <ArrowRight className="w-4 h-4" />
          </Button>
        </>
      )}
    </div>
  );
}

export default function OnboardingPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [extractions, setExtractions] = useState<Array<{ source: string; text: string }>>([]);
  const [brandProfile, setBrandProfile] = useState<Partial<BrandProfile>>({});
  const [savedProfile, setSavedProfile] = useState<BrandProfile | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const saveStep = useCallback((newStep: number) => {
    setStep(newStep);
  }, []);

  useEffect(() => {
    if (user?.onboardingCompleted) {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  if (user?.onboardingCompleted) {
    return null;
  }

  const extractContent = async () => {
    setIsExtracting(true);
    try {
      const formData = new FormData();
      if (url) formData.append("url", url);
      files.forEach((file) => formData.append("files", file));

      const res = await fetch("/api/onboarding/extract-content", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Failed to extract content");
      }

      const data = await res.json();
      const newExtractions = data.extractions || [];
      setExtractions(newExtractions);
      await analyzeBrandVoice(newExtractions);
    } catch (error: any) {
      toast({ title: "Extraction failed", description: error.message, variant: "destructive" });
    } finally {
      setIsExtracting(false);
    }
  };

  const analyzeBrandVoice = async (extractionsData?: Array<{ source: string; text: string }>) => {
    saveStep(2);
    setIsAnalyzing(true);
    try {
      const data_ = extractionsData || extractions;
      const combinedText = data_
        .map((e) => `--- Content from ${e.source} ---\n${e.text}`)
        .join("\n\n");

      const res = await apiRequest("POST", "/api/onboarding/analyze-brand", {
        companyName,
        industry,
        extractedText: combinedText,
        url: url || undefined,
      });

      const data = await res.json();
      setBrandProfile(data);
      saveStep(3);
    } catch (error: any) {
      toast({ title: "Analysis failed", description: error.message, variant: "destructive" });
      saveStep(1);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const saveBrandProfile = async () => {
    setIsSaving(true);
    try {
      const res = await apiRequest("POST", "/api/onboarding/save-brand-profile", {
        ...brandProfile,
        companyName,
        industry,
        websiteUrl: url || undefined,
      });
      const data = await res.json();
      setSavedProfile(data);
      // Onboarding auto-creates the organization server-side, so any queries keyed off
      // "does this user have an org" must be refreshed before the dashboard renders.
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/permissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organization/members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
    } catch (error: any) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const removeExtraction = (index: number) => {
    setExtractions(extractions.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center gap-2 p-4 border-b">
        <img src="/logo-icon.svg" alt="SF Media" className="h-7" />
      </div>
      <div className="p-6 max-w-4xl mx-auto">
        <StepIndicator currentStep={step} totalSteps={4} />

        {step === 0 && (
          <Step1CompanyInfo
            companyName={companyName}
            setCompanyName={setCompanyName}
            industry={industry}
            setIndustry={setIndustry}
            onNext={() => saveStep(1)}
          />
        )}
        {step === 1 && (
          <Step2BrandVoice
            files={files}
            setFiles={setFiles}
            url={url}
            setUrl={setUrl}
            onExtract={extractContent}
            isExtracting={isExtracting}
          />
        )}
        {step === 2 && <Step4Analyzing />}
        {step === 3 && (
          <Step5ReviewProfileAndPosts
            brandProfile={brandProfile}
            onUpdate={(data) => setBrandProfile({ ...brandProfile, ...data })}
            onSave={saveBrandProfile}
            isSaving={isSaving}
            savedProfile={savedProfile}
          />
        )}
      </div>
    </div>
  );
}
