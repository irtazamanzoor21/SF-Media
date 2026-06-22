import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, Loader2, X, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { BrandVoiceDiff, defaultActions, type BrandVoiceField, type FieldAction } from "./brand-voice-diff";
import type { BrandProfile } from "@shared/schema";

type Phase = "input" | "processing" | "review";

interface SourceMeta {
  filenames: string[];
  fileCount: number;
  blockCount: number;
  totalChars: number;
  inputType: "paste" | "files";
}

interface PreviewResult {
  importId: string;
  extracted: Record<string, any>;
  sourceMeta: SourceMeta;
  blocksKept: number;
  blocksTotal: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandProfile: BrandProfile;
}

const MAX_FILES = 20;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PASTE_CHARS = 5 * 1024 * 1024;

export function ImportBrandModal({ open, onOpenChange, brandProfile }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"paste" | "files">("paste");
  const [phase, setPhase] = useState<Phase>("input");
  const [pasteText, setPasteText] = useState("");
  const [pasteTag, setPasteTag] = useState<"transcript" | "brand_notes" | "past_posts">("transcript");
  const [files, setFiles] = useState<File[]>([]);
  const [includeAssistant, setIncludeAssistant] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [actions, setActions] = useState<Partial<Record<BrandVoiceField, FieldAction>>>({});
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTab("paste");
    setPhase("input");
    setPasteText("");
    setPasteTag("transcript");
    setFiles([]);
    setIncludeAssistant(false);
    setShowHelp(false);
    setProgressMessage("");
    setProgressPercent(0);
    setPreview(null);
    setActions({});
    abortRef.current?.abort();
    abortRef.current = null;
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const handleFilesPicked = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const accepted: File[] = [];
    for (const f of arr) {
      if (!/\.(md|markdown|txt)$/i.test(f.name)) {
        toast({ title: "Unsupported file", description: `${f.name} — only .md, .markdown, and .txt are supported.`, variant: "destructive" });
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        toast({ title: "File too large", description: `${f.name} is over 5MB.`, variant: "destructive" });
        continue;
      }
      accepted.push(f);
    }
    setFiles((prev) => {
      const combined = [...prev, ...accepted];
      if (combined.length > MAX_FILES) {
        toast({ title: "Too many files", description: `Up to ${MAX_FILES} files per import.`, variant: "destructive" });
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) handleFilesPicked(e.dataTransfer.files);
  };

  const startImport = async () => {
    if (tab === "paste") {
      if (!pasteText.trim()) {
        toast({ title: "Nothing to import", description: "Paste some text first.", variant: "destructive" });
        return;
      }
      if (pasteText.length > MAX_PASTE_CHARS) {
        toast({ title: "Pasted text too long", description: "Please trim to under 5MB of text.", variant: "destructive" });
        return;
      }
    } else {
      if (files.length === 0) {
        toast({ title: "No files selected", description: "Add at least one file first.", variant: "destructive" });
        return;
      }
    }

    setPhase("processing");
    setProgressMessage("Starting…");
    setProgressPercent(5);

    const controller = new AbortController();
    abortRef.current = controller;

    const formData = new FormData();
    if (tab === "paste") {
      formData.append("text", pasteText);
      formData.append("tag", pasteTag);
    } else {
      for (const f of files) formData.append("files", f);
    }
    formData.append("includeAssistant", String(includeAssistant));

    try {
      const res = await fetch("/api/brand-profile/import/preview", {
        method: "POST",
        body: formData,
        credentials: "include",
        signal: controller.signal,
      });

      if (!res.ok && res.headers.get("content-type")?.includes("json")) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Request failed (${res.status})`);
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: PreviewResult | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const block of events) {
          const line = block.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const payload = line.slice(6);
          let data: any;
          try { data = JSON.parse(payload); } catch { continue; }

          if (data.type === "status") {
            setProgressMessage(data.message || "Processing…");
            if (data.stage === "parsing") setProgressPercent(15);
            else if (data.stage === "filtering") setProgressPercent(30);
            else if (data.stage === "summarizing" && data.total) {
              const base = 35;
              const span = 50;
              setProgressPercent(base + Math.round((data.current / data.total) * span));
            } else if (data.stage === "extracting") setProgressPercent(90);
          } else if (data.type === "done") {
            finalResult = {
              importId: data.importId,
              extracted: data.extracted,
              sourceMeta: data.sourceMeta,
              blocksKept: data.blocksKept,
              blocksTotal: data.blocksTotal,
            };
            setProgressPercent(100);
          } else if (data.type === "error") {
            throw new Error(data.message || "Import failed");
          }
        }
      }

      if (!finalResult) throw new Error("Import did not complete.");

      setPreview(finalResult);
      setActions(defaultActions(brandProfile, finalResult.extracted));
      setPhase("review");
    } catch (e: any) {
      if (e.name === "AbortError") {
        setPhase("input");
        return;
      }
      toast({ title: "Import failed", description: e.message || "Please try again.", variant: "destructive" });
      setPhase("input");
    }
  };

  const cancelProcessing = () => {
    abortRef.current?.abort();
    setPhase("input");
  };

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("No preview to apply");
      const res = await apiRequest("POST", "/api/brand-profile/import/apply", {
        importId: preview.importId,
        fieldsToApply: actions,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brand-profile"] });
      toast({ title: "Brand voice updated" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to apply changes", description: error.message, variant: "destructive" });
    },
  });

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Import from past chats
          </DialogTitle>
          <DialogDescription>
            Paste a ChatGPT (or other LLM) conversation, or upload your past notes — SF Media will pull out your brand voice. We process the text in memory and don't store the original.
          </DialogDescription>
        </DialogHeader>

        {phase === "input" && (
          <div className="space-y-4">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "paste" | "files")}>
              <TabsList>
                <TabsTrigger value="paste" data-testid="tab-paste">Paste your chats</TabsTrigger>
                <TabsTrigger value="files" data-testid="tab-files">Upload files</TabsTrigger>
              </TabsList>

              <TabsContent value="paste" className="space-y-3 mt-4">
                <Textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={"Paste your ChatGPT conversation here. You can paste several one after another — SF Media will figure it out.\n\nTip: In ChatGPT, click into a conversation, press Cmd/Ctrl+A, Cmd/Ctrl+C, then paste here."}
                  className="min-h-[280px] font-mono text-sm"
                  data-testid="paste-textarea"
                />
                <div className="flex flex-wrap gap-3 items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground">What is this?</Label>
                    <Select value={pasteTag} onValueChange={(v) => setPasteTag(v as any)}>
                      <SelectTrigger className="w-[180px]" data-testid="paste-tag">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="transcript">Chat transcript</SelectItem>
                        <SelectItem value="brand_notes">Brand notes</SelectItem>
                        <SelectItem value="past_posts">Past posts</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {pasteText.length.toLocaleString()} / {MAX_PASTE_CHARS.toLocaleString()} characters
                  </span>
                </div>
              </TabsContent>

              <TabsContent value="files" className="space-y-3 mt-4">
                <div>
                  <button
                    type="button"
                    onClick={() => setShowHelp((s) => !s)}
                    className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                    data-testid="toggle-help"
                  >
                    {showHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    How do I get these files?
                  </button>
                  {showHelp && (
                    <div className="mt-2 p-3 bg-muted rounded-md text-sm text-muted-foreground space-y-2">
                      <p>The easiest way is to <strong>paste</strong> instead — switch to the Paste tab.</p>
                      <p>For many conversations at once: install a "ChatGPT Exporter" browser extension, then save each conversation as a markdown (.md) file and drop the files here.</p>
                    </div>
                  )}
                </div>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed rounded-md p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                  data-testid="dropzone"
                >
                  <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium">Drop .md, .markdown, or .txt files here, or click to choose</p>
                  <p className="text-xs text-muted-foreground mt-1">Up to {MAX_FILES} files, 5MB each</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".md,.markdown,.txt,text/markdown,text/plain"
                    className="hidden"
                    onChange={(e) => e.target.files && handleFilesPicked(e.target.files)}
                    data-testid="file-input"
                  />
                </div>
                {files.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {files.map((f, i) => (
                      <Badge key={i} variant="secondary" className="gap-1.5 pr-1">
                        <FileText className="w-3 h-3" />
                        <span className="max-w-[200px] truncate">{f.name}</span>
                        <span className="text-muted-foreground">({Math.round(f.size / 1024)}KB)</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                          className="ml-1 rounded-sm hover:bg-muted"
                          data-testid={`remove-file-${i}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <div className="flex items-center gap-3 pt-2 border-t">
              <Switch
                id="include-assistant"
                checked={includeAssistant}
                onCheckedChange={setIncludeAssistant}
                data-testid="toggle-include-assistant"
              />
              <Label htmlFor="include-assistant" className="text-sm cursor-pointer">
                Include AI replies too (when assistant output represents your final brand copy)
              </Label>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="py-8 space-y-4">
            <div className="flex items-center justify-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
            <div className="text-center">
              <p className="text-base font-medium">{progressMessage || "Working on it…"}</p>
              <p className="text-xs text-muted-foreground mt-1">This usually takes 20–60 seconds.</p>
            </div>
            <Progress value={progressPercent} className="w-full" />
          </div>
        )}

        {phase === "review" && preview && (
          <div className="space-y-3">
            <div className="bg-muted/50 rounded-md p-3 text-sm">
              <p>
                <strong>From your import:</strong>{" "}
                {preview.sourceMeta.inputType === "paste"
                  ? `pasted text (${preview.sourceMeta.totalChars.toLocaleString()} chars)`
                  : `${preview.sourceMeta.fileCount} file${preview.sourceMeta.fileCount === 1 ? "" : "s"}`}
                {" — "}
                <span className="text-muted-foreground">
                  kept {preview.blocksKept} of {preview.blocksTotal} text {preview.blocksTotal === 1 ? "block" : "blocks"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Pick what to use for each field. Default: keep what you have when something's already there, use new when nothing's there.
              </p>
            </div>
            <BrandVoiceDiff
              current={brandProfile}
              extracted={preview.extracted}
              actions={actions}
              onChange={setActions}
            />
          </div>
        )}

        <DialogFooter>
          {phase === "input" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-import">
                Cancel
              </Button>
              <Button onClick={startImport} className="gap-2" data-testid="button-start-import">
                <Sparkles className="w-4 h-4" />
                Process
              </Button>
            </>
          )}
          {phase === "processing" && (
            <Button variant="outline" onClick={cancelProcessing} data-testid="button-cancel-processing">
              Cancel
            </Button>
          )}
          {phase === "review" && (
            <>
              <Button variant="outline" onClick={() => setPhase("input")} data-testid="button-back-to-input">
                Back
              </Button>
              <Button
                onClick={() => applyMutation.mutate()}
                disabled={applyMutation.isPending}
                className="gap-2"
                data-testid="button-apply-import"
              >
                {applyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Apply changes
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
