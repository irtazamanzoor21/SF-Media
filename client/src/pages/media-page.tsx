import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuota } from "@/hooks/use-quota";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  FolderOpen,
  FolderPlus,
  Upload,
  Sparkles,
  Trash2,
  Pencil,
  Check,
  X,
  MoreVertical,
  FolderInput,
  Image as ImageIcon,
  Loader2,
  FileImage,
  Layers,
  Lock,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MediaFolder, MediaFile } from "@shared/schema";
import { ImageEditor } from "@/components/image-editor";
import { isBlank } from "@/lib/utils";

import Uppy from "@uppy/core";
import XHRUpload from "@uppy/xhr-upload";
import GoogleDrive from "@uppy/google-drive";
import OneDrive from "@uppy/onedrive";
import Unsplash from "@uppy/unsplash";
import DashboardModal from "@uppy/react/dashboard-modal";
import "@uppy/core/css/style.min.css";
import "@uppy/dashboard/css/style.min.css";

const FOLDER_COLORS = [
  { value: "#6366f1", label: "Indigo" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#ec4899", label: "Pink" },
  { value: "#f43f5e", label: "Rose" },
  { value: "#f97316", label: "Orange" },
  { value: "#eab308", label: "Yellow" },
  { value: "#22c55e", label: "Green" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#06b6d4", label: "Cyan" },
  { value: "#3b82f6", label: "Blue" },
];

export default function MediaPage() {
  const { toast } = useToast();
  const { isAtAiLimit, aiPostsRemaining, aiQuota } = useQuota();
  const [selectedFolderId, setSelectedFolderId] = useState<number | "all" | "uncategorized">("all");
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("#6366f1");
  const [editingFolderId, setEditingFolderId] = useState<number | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [movingFileId, setMovingFileId] = useState<number | null>(null);
  const [moveTargetFolder, setMoveTargetFolder] = useState<string>("");
  const [previewFile, setPreviewFile] = useState<MediaFile | null>(null);
  const [editingMediaFile, setEditingMediaFile] = useState<MediaFile | null>(null);

  const { data: folders = [], isLoading: foldersLoading } = useQuery<MediaFolder[]>({
    queryKey: ["/api/media/folders"],
  });

  const filesQueryKey = useMemo(() => {
    if (selectedFolderId === "all") return ["/api/media/files"];
    if (selectedFolderId === "uncategorized") return ["/api/media/files", { folderId: "uncategorized" }];
    return ["/api/media/files", { folderId: String(selectedFolderId) }];
  }, [selectedFolderId]);

  const filesUrl = useMemo(() => {
    if (selectedFolderId === "all") return "/api/media/files";
    if (selectedFolderId === "uncategorized") return "/api/media/files?folderId=uncategorized";
    return `/api/media/files?folderId=${selectedFolderId}`;
  }, [selectedFolderId]);

  const { data: files = [], isLoading: filesLoading } = useQuery<MediaFile[]>({
    queryKey: filesQueryKey,
    queryFn: async () => {
      const res = await fetch(filesUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch files");
      return res.json();
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: async (data: { name: string; color: string }) => {
      const res = await apiRequest("POST", "/api/media/folders", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/folders"] });
      setShowCreateFolder(false);
      setNewFolderName("");
      setNewFolderColor("#6366f1");
      toast({ title: "Folder created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const renameFolderMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await apiRequest("PATCH", `/api/media/folders/${id}`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/folders"] });
      setEditingFolderId(null);
      toast({ title: "Folder renamed" });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/media/folders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/media/files"] });
      if (typeof selectedFolderId === "number") setSelectedFolderId("all");
      toast({ title: "Folder deleted" });
    },
  });

  const aiGenerateMutation = useMutation({
    mutationFn: async (data: { prompt: string; folderId: number | null }) => {
      const res = await apiRequest("POST", "/api/media/files/generate", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/files"] });
      setShowAiDialog(false);
      setAiPrompt("");
      toast({ title: "Image generated successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const moveFileMutation = useMutation({
    mutationFn: async ({ fileId, folderId }: { fileId: number; folderId: number | null }) => {
      const res = await apiRequest("PATCH", `/api/media/files/${fileId}/move`, { folderId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/files"] });
      setShowMoveDialog(false);
      setMovingFileId(null);
      toast({ title: "File moved" });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/media/files/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/files"] });
      toast({ title: "File deleted" });
    },
  });

  const companionUrl = window.location.origin + "/companion";
  const [uploadToken, setUploadToken] = useState<{ token: string; userId: number } | null>(null);

  useEffect(() => {
    fetch("/api/media/upload-token", { credentials: "include" })
      .then(r => r.json())
      .then(data => setUploadToken(data))
      .catch(() => {});
  }, []);

  const uppy = useMemo(() => {
    const instance = new Uppy({
      restrictions: {
        maxNumberOfFiles: 10,
        maxFileSize: 10 * 1024 * 1024,
        allowedFileTypes: ["image/*"],
      },
      autoProceed: false,
    }).use(XHRUpload, {
      endpoint: window.location.origin + "/api/media/files/companion-upload",
      fieldName: "file",
      formData: true,
      bundle: false,
      headers: {},
    }).use(GoogleDrive, {
      companionUrl,
    }).use(OneDrive, {
      companionUrl,
    }).use(Unsplash, {
      companionUrl,
    });
    return instance;
  }, []);

  useEffect(() => {
    if (uploadToken) {
      uppy.setMeta({ userId: String(uploadToken.userId) });
      const xhrPlugin = uppy.getPlugin("XHRUpload") as any;
      if (xhrPlugin) {
        xhrPlugin.setOptions({
          headers: { "x-upload-token": uploadToken.token },
        });
      }
    }
  }, [uploadToken, uppy]);

  // OAuth token delivery — two complementary paths to guarantee the token reaches
  // Uppy regardless of COOP severance, stale client bundles, or timing races.
  //
  // Path A (fast): BroadcastChannel — popup sends token via same-origin channel.
  //   Works when both this page and the send-token page share the same tab group.
  //
  // Path B (fallback): server-side polling — the send-token handler stores the
  //   token in the shared PostgreSQL session; we poll /api/companion/auth-token
  //   every 800ms for up to 30s and deliver it via the same synthetic MessageEvent.
  //
  // Both paths dispatch the same synthetic MessageEvent whose .source matches the
  // popup window reference that Uppy stored in authWindow, so its internal
  // handleMessage check (e.source !== authWindow) passes and the auth promise
  // resolves cleanly — no error toast, no second click needed.
  useEffect(() => {
    let lastAuthWindow: Window | null = null;
    let tokenDelivered = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let pollTimeout: ReturnType<typeof setTimeout> | null = null;

    function deliverToken(token: string, authWindowRef: Window) {
      if (tokenDelivered) return;
      tokenDelivered = true;
      stopPolling();
      window.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({ token }),
          origin: window.location.origin,
          source: authWindowRef as MessageEventSource,
        }),
      );
    }

    function stopPolling() {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
      if (pollTimeout)  { clearTimeout(pollTimeout);  pollTimeout  = null; }
    }

    function startPolling(authWindowRef: Window, provider: string) {
      stopPolling();
      tokenDelivered = false;
      let popupClosedAt = 0;
      pollInterval = setInterval(async () => {
        // Stop immediately if token already delivered (BroadcastChannel won the race)
        if (tokenDelivered) { stopPolling(); return; }
        // Detect popup close for abandoned-flow cleanup.
        // When OAuth succeeds, the server stores the token BEFORE window.close() fires,
        // so the token is already in the DB when the popup closes. We give a 2-second
        // grace window after close to allow the DB read to complete, then stop.
        if (authWindowRef.closed) {
          if (!popupClosedAt) popupClosedAt = Date.now();
          if (Date.now() - popupClosedAt > 2000) { stopPolling(); return; }
        }
        try {
          const r = await fetch(
            `/api/companion/auth-token?provider=${encodeURIComponent(provider)}`,
            { credentials: "include" },
          );
          if (!r.ok) return;
          const data = (await r.json()) as { token?: string | null; pluginId?: string };
          if (data.token) deliverToken(data.token, authWindowRef);
        } catch {
          // Network error — keep polling
        }
      }, 800);
      // Stop polling after 30s regardless
      pollTimeout = setTimeout(stopPolling, 30_000);
    }

    // Intercept window.open to capture the popup reference Uppy opens.
    // Derive the provider from the URL path so polling uses the right query param.
    const origOpen: typeof window.open = window.open.bind(window);
    window.open = (url, target, features) => {
      const popup = origOpen(url, target, features);
      if (popup) {
        lastAuthWindow = popup;
        tokenDelivered = false;
        // Extract provider from companion URL: /companion/<provider>/connect
        const providerMatch = (typeof url === "string" ? url : "").match(/\/companion\/([^/?]+)\//);
        const provider = providerMatch ? providerMatch[1].toLowerCase() : "onedrive";
        startPolling(popup, provider);
      }
      return popup;
    };

    // Path A: BroadcastChannel (fast path, fires before polling in most cases).
    const channel = new BroadcastChannel("uppy-auth-token");
    channel.onmessage = (evt: MessageEvent) => {
      const { token } = (evt.data || {}) as { token?: string; pluginId?: string };
      if (!token || !lastAuthWindow) return;
      deliverToken(token, lastAuthWindow);
    };

    return () => {
      window.open = origOpen;
      channel.close();
      stopPolling();
    };
  }, []);

  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/files"] });
      setTimeout(() => {
        uppy.cancelAll();
        setShowUploadDialog(false);
      }, 1500);
    };
    uppy.on("complete", handler);
    return () => {
      uppy.off("complete", handler);
    };
  }, [uppy]);

  useEffect(() => {
    const fId = typeof selectedFolderId === "number" ? String(selectedFolderId) : "";
    uppy.setMeta({ folderId: fId });
  }, [selectedFolderId, uppy]);

  const handleCreateFolder = useCallback(() => {
    if (!newFolderName.trim()) return;
    createFolderMutation.mutate({ name: newFolderName.trim(), color: newFolderColor });
  }, [newFolderName, newFolderColor, createFolderMutation]);

  const handleRenameFolder = useCallback((id: number) => {
    if (!editingFolderName.trim()) return;
    renameFolderMutation.mutate({ id, name: editingFolderName.trim() });
  }, [editingFolderName, renameFolderMutation]);

  const handleAiGenerate = useCallback(() => {
    if (!aiPrompt.trim()) return;
    const folderId = typeof selectedFolderId === "number" ? selectedFolderId : null;
    aiGenerateMutation.mutate({ prompt: aiPrompt.trim(), folderId });
  }, [aiPrompt, selectedFolderId, aiGenerateMutation]);

  const handleMoveFile = useCallback(() => {
    if (movingFileId === null) return;
    const folderId = moveTargetFolder === "none" ? null : parseInt(moveTargetFolder);
    moveFileMutation.mutate({ fileId: movingFileId, folderId });
  }, [movingFileId, moveTargetFolder, moveFileMutation]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const selectedFolderName = useMemo(() => {
    if (selectedFolderId === "all") return "All Files";
    if (selectedFolderId === "uncategorized") return "Uncategorized";
    return folders.find(f => f.id === selectedFolderId)?.name || "Folder";
  }, [selectedFolderId, folders]);

  const isNewFolderNameInvalid = isBlank(newFolderName);
  const isEditingFolderNameInvalid = isBlank(editingFolderName);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold mb-1" data-testid="text-media-title">Media Library</h1>
          <p className="text-muted-foreground text-sm">Organize and manage your images</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <Button variant="outline" className="gap-2" onClick={() => setShowUploadDialog(true)} data-testid="button-upload-file">
            <Upload className="w-4 h-4" />
            Upload
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => !isAtAiLimit && setShowAiDialog(true)}
                    disabled={isAtAiLimit}
                    data-testid="button-ai-generate"
                  >
                    {isAtAiLimit ? (
                      <><Lock className="w-4 h-4" /> AI Limit Reached</>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" /> AI Generate
                        {aiPostsRemaining != null && (
                          <Badge variant="secondary" className="ml-1 text-xs hidden sm:inline-flex">
                            {aiPostsRemaining} of {aiQuota?.limit} remaining
                          </Badge>
                        )}
                      </>
                    )}
                  </Button>
                </span>
              </TooltipTrigger>
              {isAtAiLimit && (
                <TooltipContent>
                  You've used all your AI posts. Upgrade to get more.
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 flex-wrap">
        <Button
          variant={selectedFolderId === "all" ? "secondary" : "outline"}
          size="sm"
          className="gap-2 shrink-0"
          onClick={() => setSelectedFolderId("all")}
          data-testid="button-folder-all"
        >
          <Layers className="w-3.5 h-3.5" />
          All Files
        </Button>

        <Button
          variant={selectedFolderId === "uncategorized" ? "secondary" : "outline"}
          size="sm"
          className="gap-2 shrink-0"
          onClick={() => setSelectedFolderId("uncategorized")}
          data-testid="button-folder-uncategorized"
        >
          <FileImage className="w-3.5 h-3.5" />
          Uncategorized
        </Button>

        {foldersLoading && <Loader2 className="w-4 h-4 animate-spin" />}

        {folders.map((folder) => (
          <div key={folder.id} className="group flex items-center shrink-0">
            {editingFolderId === folder.id ? (
              <div className="flex items-center gap-1">
                <Input
                  value={editingFolderName}
                  onChange={(e) => setEditingFolderName(e.target.value)}
                  className="h-8 text-sm w-32"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameFolder(folder.id);
                    if (e.key === "Escape") setEditingFolderId(null);
                  }}
                  aria-invalid={isEditingFolderNameInvalid}
                  data-testid={`input-rename-folder-${folder.id}`}
                />
                <Button size="icon" variant="ghost" onClick={() => handleRenameFolder(folder.id)} disabled={isEditingFolderNameInvalid} data-testid={`button-rename-confirm-${folder.id}`}>
                  <Check className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setEditingFolderId(null)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={selectedFolderId === folder.id ? "secondary" : "outline"}
                    size="sm"
                    className="gap-2 pr-2"
                    onClick={() => setSelectedFolderId(folder.id)}
                    data-testid={`button-folder-${folder.id}`}
                  >
                    <FolderOpen className="w-3.5 h-3.5 shrink-0" style={{ color: folder.color }} />
                    <span className="truncate max-w-[120px]">{folder.name}</span>
                    <MoreVertical className="w-3 h-3 ml-1 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedFolderId(folder.id); }}>
                    <FolderOpen className="w-3.5 h-3.5 mr-2" />
                    Open
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingFolderId(folder.id); setEditingFolderName(folder.name); }}>
                    <Pencil className="w-3.5 h-3.5 mr-2" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(e) => { e.stopPropagation(); deleteFolderMutation.mutate(folder.id); }}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}

        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 shrink-0"
          onClick={() => setShowCreateFolder(true)}
          data-testid="button-create-folder"
        >
          <FolderPlus className="w-3.5 h-3.5" />
          New Folder
        </Button>
      </div>

      {showCreateFolder && (
        <Card className="p-4 mb-4 max-w-md">
          <div className="space-y-3">
            <Input
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
                if (e.key === "Escape") setShowCreateFolder(false);
              }}
              aria-invalid={isNewFolderNameInvalid}
              data-testid="input-new-folder-name"
            />
            {isNewFolderNameInvalid && (
              <p className="text-sm text-destructive" data-testid="error-folder-name">
                Folder name cannot be empty or contain only spaces.
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {FOLDER_COLORS.map((c) => (
                <button
                  key={c.value}
                  className="w-6 h-6 rounded-md border-2 transition-all"
                  style={{
                    backgroundColor: c.value,
                    borderColor: newFolderColor === c.value ? "hsl(var(--foreground))" : "transparent",
                  }}
                  onClick={() => setNewFolderColor(c.value)}
                  title={c.label}
                  data-testid={`button-color-${c.label.toLowerCase()}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleCreateFolder} disabled={isNewFolderNameInvalid || createFolderMutation.isPending} data-testid="button-create-folder-confirm">
                {createFolderMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Create"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCreateFolder(false)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <h2 className="text-lg font-medium" data-testid="text-current-folder">{selectedFolderName}</h2>
        <span className="text-sm text-muted-foreground">{files.length} file{files.length !== 1 ? "s" : ""}</span>
      </div>

      {filesLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : files.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 px-6">
          <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4">
            <ImageIcon className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm text-center mb-4">No images yet. Upload files or generate with AI.</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowUploadDialog(true)} data-testid="button-upload-empty">
              <Upload className="w-3.5 h-3.5" />
              Upload
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => !isAtAiLimit && setShowAiDialog(true)}
                      disabled={isAtAiLimit}
                      data-testid="button-ai-empty"
                    >
                      {isAtAiLimit ? (
                        <><Lock className="w-3.5 h-3.5" /> AI Limit Reached</>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" /> AI Generate
                          {aiPostsRemaining != null && (
                            <Badge variant="secondary" className="ml-1 text-xs hidden sm:inline-flex">
                              {aiPostsRemaining} of {aiQuota?.limit} remaining
                            </Badge>
                          )}
                        </>
                      )}
                    </Button>
                  </span>
                </TooltipTrigger>
                {isAtAiLimit && (
                  <TooltipContent>
                    You've used all your AI posts. Upgrade to get more.
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {files.map((file) => (
            <Card key={file.id} className="group overflow-visible relative" data-testid={`card-file-${file.id}`}>
              <div
                className="aspect-square overflow-hidden rounded-t-md cursor-pointer"
                onClick={() => setPreviewFile(file)}
              >
                <img
                  src={file.url}
                  alt={file.name}
                  className="w-full h-full object-cover transition-transform duration-200"
                  loading="lazy"
                />
              </div>
              <div className="p-2 flex items-center justify-between gap-1">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate" title={file.name}>{file.name}</p>
                  <p className="text-[10px] text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="shrink-0 h-7 w-7" data-testid={`button-file-menu-${file.id}`}>
                      <MoreVertical className="w-3.5 h-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setPreviewFile(file)}>
                      <ImageIcon className="w-3.5 h-3.5 mr-2" />
                      Preview
                    </DropdownMenuItem>
                    {file.mimeType?.startsWith("image/") && (
                      <DropdownMenuItem onClick={() => setEditingMediaFile(file)}>
                        <Pencil className="w-3.5 h-3.5 mr-2" />
                        Edit Image
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => { setMovingFileId(file.id); setMoveTargetFolder(""); setShowMoveDialog(true); }}>
                      <FolderInput className="w-3.5 h-3.5 mr-2" />
                      Move to folder
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => deleteFileMutation.mutate(file.id)}>
                      <Trash2 className="w-3.5 h-3.5 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </Card>
          ))}
        </div>
      )}

      <DashboardModal
        uppy={uppy}
        open={showUploadDialog}
        onRequestClose={() => setShowUploadDialog(false)}
        proudlyDisplayPoweredByUppy={false}
        theme="auto"
      />

      <Dialog open={showAiDialog} onOpenChange={setShowAiDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              Generate Image with AI
            </DialogTitle>
            <DialogDescription>
              Describe the image you want to generate
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="A professional marketing image showing..."
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            rows={4}
            data-testid="input-ai-prompt"
          />
          {typeof selectedFolderId === "number" && (
            <p className="text-xs text-muted-foreground">
              Image will be saved to: <strong>{folders.find(f => f.id === selectedFolderId)?.name}</strong>
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAiDialog(false)}>Cancel</Button>
            <Button
              onClick={handleAiGenerate}
              disabled={!aiPrompt.trim() || aiGenerateMutation.isPending}
              className="gap-2"
              data-testid="button-ai-generate-confirm"
            >
              {aiGenerateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Move to Folder</DialogTitle>
            <DialogDescription>
              Select a destination folder
            </DialogDescription>
          </DialogHeader>
          <Select value={moveTargetFolder} onValueChange={setMoveTargetFolder}>
            <SelectTrigger data-testid="select-move-folder">
              <SelectValue placeholder="Choose folder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Uncategorized</SelectItem>
              {folders.map((f) => (
                <SelectItem key={f.id} value={String(f.id)}>
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-3.5 h-3.5" style={{ color: f.color }} />
                    {f.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowMoveDialog(false)}>Cancel</Button>
            <Button
              onClick={handleMoveFile}
              disabled={!moveTargetFolder || moveFileMutation.isPending}
              data-testid="button-move-confirm"
            >
              {moveFileMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{previewFile?.name}</DialogTitle>
            <DialogDescription>
              {previewFile && formatFileSize(previewFile.size)}
            </DialogDescription>
          </DialogHeader>
          {previewFile && (
            <div className="flex flex-col items-center gap-3">
              <img
                src={previewFile.url}
                alt={previewFile.name}
                className="max-h-[65vh] rounded-md object-contain"
              />
              {previewFile.mimeType?.startsWith("image/") && (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setEditingMediaFile(previewFile);
                    setPreviewFile(null);
                  }}
                  data-testid={`button-edit-media-${previewFile.id}`}
                >
                  <Pencil className="w-4 h-4" />
                  Edit Image
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {editingMediaFile && (
        <ImageEditor
          imageUrl={editingMediaFile.url}
          open={!!editingMediaFile}
          onClose={() => setEditingMediaFile(null)}
          onSave={(_newUrl: string) => {
            queryClient.invalidateQueries({ queryKey: ["/api/media/files"] });
            setEditingMediaFile(null);
          }}
          context="media"
          mediaFileId={editingMediaFile.id}
        />
      )}
    </div>
  );
}
