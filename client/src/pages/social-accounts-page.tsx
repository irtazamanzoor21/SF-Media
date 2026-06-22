import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { emitQuotaExceeded } from "@/lib/quota-events";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Unlink } from "lucide-react";
import { SiFacebook, SiInstagram, SiLinkedin, SiX } from "react-icons/si";

type FbStatus = { connected: boolean; pageId?: string; pageName?: string };
type FbPage = { id: string; name: string; category?: string };
type FbPagesData = { pages: FbPage[]; hasNoPages?: boolean };
type IgStatus = { connected: boolean; igUserId?: string; igUsername?: string };
type LiStatus = { connected: boolean; authorUrn?: string; displayName?: string; organizationId?: string; organizationName?: string };
type XStatus = { connected: boolean; xId?: string; xUsername?: string; oauth1Connected?: boolean };

export default function SocialAccountsPage() {
  const { toast } = useToast();
  const [location] = useLocation();
  const [pageIdInput, setPageIdInput] = useState("");
  const [liPostAs, setLiPostAs] = useState<"person" | "organization">(() => {
    try { return (localStorage.getItem("linkedin_post_as") as "person" | "organization") || "person"; } catch { return "person"; }
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fbConnected = params.get("facebook_connected");
    const igConnected = params.get("instagram_connected");
    const liConnected = params.get("linkedin_connected");
    const liError = params.get("linkedin_error");
    const fbError = params.get("facebook_error");
    const igError = params.get("instagram_error");

    if (fbConnected) {
      queryClient.invalidateQueries({ queryKey: ["/api/facebook/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/facebook/pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/instagram/status"] });
      toast({ title: "Facebook connected!", description: "Your account is now connected." });
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (igConnected) {
      queryClient.invalidateQueries({ queryKey: ["/api/instagram/status"] });
      const tokenRefreshNeeded = params.get("token_refresh_needed");
      if (tokenRefreshNeeded) {
        toast({
          title: "Instagram connected",
          description: "Your Instagram Business Account is linked. For best results, reconnect Facebook to refresh your page permissions.",
        });
      } else {
        toast({ title: "Instagram connected!", description: "Your Instagram Business Account is now linked." });
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (fbError) {
      let msg = fbError;
      if (fbError === "not_configured") msg = "Facebook app credentials are not configured on the server.";
      else if (fbError === "missing_params") msg = "Authorization was cancelled or failed.";
      else if (fbError === "token_exchange_failed") msg = "Could not exchange token. Please try again.";
      toast({ title: "Facebook connection failed", description: msg, variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (igError) {
      let msg = igError;
      if (igError === "connect_facebook_first") msg = "Please connect your Facebook account first.";
      else if (igError === "no_page_connected") msg = "No Facebook Page selected. Select a page and try again.";
      else if (igError === "no_ig_account") {
        const pageName = params.get("page_name");
        const pageLabel = pageName ? `"${pageName}"` : "your selected Facebook Page";
        msg = `No Instagram Professional account was found linked to ${pageLabel}. To fix this: 1) Open Instagram → Settings → Account → Switch to Professional Account (Business or Creator). 2) In Meta Business Suite, confirm your Instagram is linked to ${pageLabel}. 3) Try connecting again.`;
      }
      else if (igError === "missing_params") msg = "Authorization was cancelled or failed.";
      else if (igError === "invalid_state") msg = "Session expired or authorization was tampered with. Please try again.";
      toast({ title: "Instagram connection failed", description: msg, variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (liConnected) {
      queryClient.invalidateQueries({ queryKey: ["/api/linkedin/status"] });
      toast({ title: "LinkedIn connected!", description: "Your LinkedIn account is now connected." });
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (liError) {
      let msg = liError;
      if (liError === "not_configured") msg = "LinkedIn app credentials are not configured on the server.";
      else if (liError === "missing_params") msg = "Authorization was cancelled or failed.";
      else if (liError === "token_exchange_failed") msg = "Could not exchange token. Please try again.";
      else if (liError === "invalid_state") msg = "Session expired. Please try again.";
      else if (liError === "profile_fetch_failed") msg = "Could not retrieve your LinkedIn profile. Please try again.";
      toast({ title: "LinkedIn connection failed", description: msg, variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }

    const xConnected = params.get("x_connected");
    const xError = params.get("x_error");
    if (xConnected) {
      queryClient.invalidateQueries({ queryKey: ["/api/x/status"] });
      toast({ title: "X connected!", description: "Your X account is now connected." });
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (xError) {
      let msg = xError;
      if (xError === "not_configured") msg = "X app credentials are not configured on the server.";
      else if (xError === "missing_params") msg = "Authorization was cancelled or failed.";
      else if (xError === "token_exchange_failed") msg = "Could not exchange token. Please try again.";
      else if (xError === "invalid_state") msg = "Session expired. Please try again.";
      else if (xError === "profile_fetch_failed") msg = "Could not retrieve your X profile. Please try again.";
      toast({ title: "X connection failed", description: msg, variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }

    const xOauth1Connected = params.get("x_oauth1_connected");
    const xOauth1Error = params.get("x_oauth1_error");
    if (xOauth1Connected) {
      queryClient.invalidateQueries({ queryKey: ["/api/x/status"] });
      toast({ title: "Image posting enabled!", description: "You can now attach images to X posts." });
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (xOauth1Error) {
      let msg = xOauth1Error;
      if (xOauth1Error === "not_configured") msg = "X API Key/Secret are not configured on the server. Add X_API_KEY and X_API_SECRET.";
      else if (xOauth1Error === "connect_x_first") msg = "Connect your X account first, then enable image posting.";
      else if (xOauth1Error === "request_token_failed") msg = "Could not start image-posting authorization. Check your X API credentials.";
      else if (xOauth1Error === "access_token_failed") msg = "Could not complete image-posting authorization. Please try again.";
      else if (xOauth1Error === "missing_params") msg = "Authorization was cancelled or failed.";
      toast({ title: "Image posting setup failed", description: msg, variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }

    const quotaExceeded = params.get("quota_exceeded");
    if (quotaExceeded === "1") {
      const action = params.get("action") ?? "social_connection";
      const limit = parseInt(params.get("limit") ?? "0", 10);
      const current = parseInt(params.get("current") ?? "0", 10);
      const label = params.get("label") ?? "social account connections";
      const tier = params.get("tier") ?? "";
      emitQuotaExceeded({ action, limit, current, label, tier });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const { data: status, isLoading: statusLoading } = useQuery<FbStatus>({
    queryKey: ["/api/facebook/status"],
  });

  const { data: igStatus, isLoading: igStatusLoading } = useQuery<IgStatus>({
    queryKey: ["/api/instagram/status"],
  });

  const { data: liStatus, isLoading: liStatusLoading } = useQuery<LiStatus>({
    queryKey: ["/api/linkedin/status"],
  });

  const { data: xStatus, isLoading: xStatusLoading } = useQuery<XStatus>({
    queryKey: ["/api/x/status"],
  });

  const { data: pagesData, isLoading: pagesLoading, refetch: refetchPages, error: pagesError } = useQuery<FbPagesData>({
    queryKey: ["/api/facebook/pages"],
    enabled: !!status?.connected,
    retry: false,
    throwOnError: false,
  });

  const isExpired = !!pagesError;

  useEffect(() => {
    if (isExpired) {
      queryClient.invalidateQueries({ queryKey: ["/api/facebook/status"] });
      toast({
        title: "Facebook session expired",
        description: "Please reconnect your Facebook account.",
        variant: "destructive",
      });
    }
  }, [isExpired]);

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/facebook/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/facebook/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/facebook/pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/instagram/status"] });
      toast({ title: "Facebook disconnected" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const selectPageMutation = useMutation({
    mutationFn: (page: FbPage) =>
      apiRequest("POST", "/api/facebook/select-page", { pageId: page.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/facebook/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/instagram/status"] });
      toast({ title: "Page updated", description: "Your selected Facebook Page has been saved." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const enterPageMutation = useMutation({
    mutationFn: (pageId: string) =>
      apiRequest("POST", "/api/facebook/enter-page-by-id", { pageId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/facebook/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/facebook/pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/instagram/status"] });
      setPageIdInput("");
      toast({ title: "Page linked!", description: "Your Facebook Page has been connected successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Could not link page", description: err.message, variant: "destructive" });
    },
  });

  const liDisconnectMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/linkedin/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/linkedin/status"] });
      toast({ title: "LinkedIn disconnected" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const xDisconnectMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/x/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/x/status"] });
      toast({ title: "X disconnected" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleConnect = () => {
    window.location.href = "/api/facebook/connect";
  };

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Social Accounts</h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">Connect your social media accounts to publish posts directly from SF Media.</p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 shrink-0 rounded-lg bg-[#1877f2] flex items-center justify-center">
                <SiFacebook className="w-5 h-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">Facebook</CardTitle>
                <CardDescription className="text-xs">Publish posts to your Facebook Pages</CardDescription>
              </div>
            </div>
            {statusLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : status?.connected ? (
              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 dark:bg-green-950/20">
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Not connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-9 w-36" />
            </div>
          ) : !status?.connected ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Connect your Facebook account to publish campaign posts directly to your Facebook Pages or schedule them for later.
              </p>
              <Button onClick={handleConnect} className="gap-2" data-testid="button-connect-facebook">
                <SiFacebook className="w-4 h-4" />
                Connect Facebook
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {isExpired ? (
                <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                  Your Facebook session has expired. Please reconnect to continue publishing.
                </div>
              ) : null}

              <div>
                <p className="text-sm font-medium mb-1">Connected Page</p>
                {pagesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : pagesData?.pages && pagesData.pages.length > 0 ? (
                  <Select
                    defaultValue={status.pageId || ""}
                    onValueChange={(pageId) => {
                      const page = pagesData.pages.find((p) => p.id === pageId);
                      if (page) selectPageMutation.mutate(page);
                    }}
                  >
                    <SelectTrigger data-testid="select-facebook-page">
                      <SelectValue placeholder="Select a page…" />
                    </SelectTrigger>
                    <SelectContent>
                      {pagesData.pages.map((page) => (
                        <SelectItem key={page.id} value={page.id} data-testid={`option-page-${page.id}`}>
                          {page.name} {page.category ? `(${page.category})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : pagesData?.hasNoPages ? (
                  <div className="space-y-3">
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 px-4 py-3 space-y-2">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">No Facebook Pages found automatically</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Facebook is not returning your Pages — this most commonly happens after Instagram is connected, because Meta then only shows Pages with a linked Instagram Business Account. You can link your Page directly using its Page ID instead.
                      </p>
                      <a
                        href="https://www.facebook.com/pages/manage"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-block"
                        data-testid="link-facebook-pages-manager"
                      >
                        Open Facebook Pages Manager →
                      </a>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Enter your Page ID manually</p>
                      <p className="text-xs text-muted-foreground">
                        Find your Page ID: go to your Facebook Page → <strong>About</strong> → scroll down to <strong>Page ID</strong>. It's a long number like <code className="bg-muted px-1 rounded text-xs">1075052495690506</code>.
                      </p>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter Page ID…"
                          value={pageIdInput}
                          onChange={(e) => setPageIdInput(e.target.value)}
                          className="flex-1 min-w-0 sm:max-w-xs"
                          data-testid="input-page-id"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && pageIdInput.trim()) {
                              enterPageMutation.mutate(pageIdInput.trim());
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => enterPageMutation.mutate(pageIdInput.trim())}
                          disabled={!pageIdInput.trim() || enterPageMutation.isPending}
                          data-testid="button-link-page-by-id"
                        >
                          {enterPageMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Link Page"
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
                {status.pageName && (
                  <p className="text-xs text-muted-foreground mt-1">Currently posting to: <strong>{status.pageName}</strong></p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleConnect}
                  className="gap-2"
                  data-testid="button-reconnect-facebook"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reconnect
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  className="gap-2 text-destructive hover:text-destructive"
                  data-testid="button-disconnect-facebook"
                >
                  {disconnectMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Unlink className="w-3.5 h-3.5" />
                  )}
                  Disconnect
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045] flex items-center justify-center">
                <SiInstagram className="w-5 h-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">Instagram</CardTitle>
                <CardDescription className="text-xs">Publish photo posts to your Instagram Business Account</CardDescription>
              </div>
            </div>
            {igStatusLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : igStatus?.connected ? (
              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 dark:bg-green-950/20">
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Not connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {igStatusLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-9 w-36" />
            </div>
          ) : igStatus?.connected ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Connected as <strong>@{igStatus.igUsername}</strong>. Posts to your Instagram Business Account use your connected Facebook Page's access.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => { window.location.href = "/api/instagram/connect"; }}
                data-testid="button-reconnect-instagram"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reconnect Instagram
              </Button>
            </div>
          ) : status?.connected && status?.pageId ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Your Facebook Page is connected. Click below to grant Instagram publishing permission for the page's linked Instagram Business Account.
              </p>
              <Button
                className="gap-2 bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] hover:opacity-90 text-white"
                onClick={() => { window.location.href = "/api/instagram/connect"; }}
                data-testid="button-connect-instagram"
              >
                <SiInstagram className="w-4 h-4" />
                Connect Instagram
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Connect your Facebook account and select a Page first. Instagram publishing is then enabled with a separate one-click authorization.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 shrink-0 rounded-lg bg-[#0077b5] flex items-center justify-center">
                <SiLinkedin className="w-5 h-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">LinkedIn</CardTitle>
                <CardDescription className="text-xs">Publish posts to your LinkedIn profile or company page</CardDescription>
              </div>
            </div>
            {liStatusLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : liStatus?.connected ? (
              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 dark:bg-green-950/20">
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Not connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {liStatusLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-9 w-36" />
            </div>
          ) : liStatus?.connected ? (
            <div className="space-y-3">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Connected as <strong>{liStatus.displayName}</strong>.
                  {liStatus.organizationName && (
                    <> Company page <strong>{liStatus.organizationName}</strong> is also available for posting.</>
                  )}
                </p>
                {liStatus.organizationId && liStatus.organizationName && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Post as</p>
                    <Select
                      value={liPostAs}
                      onValueChange={(val: "person" | "organization") => {
                        setLiPostAs(val);
                        try { localStorage.setItem("linkedin_post_as", val); } catch {}
                      }}
                    >
                      <SelectTrigger className="w-full" data-testid="select-linkedin-post-as">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="person" data-testid="option-linkedin-person">
                          Personal Profile ({liStatus.displayName})
                        </SelectItem>
                        <SelectItem value="organization" data-testid="option-linkedin-organization">
                          Company Page ({liStatus.organizationName})
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      This preference is used when you click "Post Now" on campaign posts.
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { window.location.href = "/api/linkedin/connect"; }}
                  className="gap-2"
                  data-testid="button-reconnect-linkedin"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reconnect
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => liDisconnectMutation.mutate()}
                  disabled={liDisconnectMutation.isPending}
                  className="gap-2 text-destructive hover:text-destructive"
                  data-testid="button-disconnect-linkedin"
                >
                  {liDisconnectMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Unlink className="w-3.5 h-3.5" />
                  )}
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Connect your LinkedIn account to publish campaign posts directly to your profile or company page.
              </p>
              <Button
                className="gap-2 bg-[#0077b5] hover:bg-[#006097] text-white"
                onClick={() => { window.location.href = "/api/linkedin/connect"; }}
                data-testid="button-connect-linkedin"
              >
                <SiLinkedin className="w-4 h-4" />
                Connect LinkedIn
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 shrink-0 rounded-lg bg-black flex items-center justify-center">
                <SiX className="w-5 h-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">X (Twitter)</CardTitle>
                <CardDescription className="text-xs">Publish posts to your X account</CardDescription>
              </div>
            </div>
            {xStatusLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : xStatus?.connected ? (
              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 dark:bg-green-950/20">
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Not connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {xStatusLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-9 w-36" />
            </div>
          ) : xStatus?.connected ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Connected as <strong>@{xStatus.xUsername}</strong>.
              </p>
              {xStatus.oauth1Connected && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                  Image posting enabled
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { window.location.href = "/api/x/connect"; }}
                  className="gap-2"
                  data-testid="button-reconnect-x"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reconnect
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => xDisconnectMutation.mutate()}
                  disabled={xDisconnectMutation.isPending}
                  className="gap-2 text-destructive hover:text-destructive"
                  data-testid="button-disconnect-x"
                >
                  {xDisconnectMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Unlink className="w-3.5 h-3.5" />
                  )}
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Connect your X account to publish campaign posts directly to your timeline or schedule them for later.
              </p>
              <Button
                className="gap-2 bg-black hover:bg-gray-900 text-white"
                onClick={() => { window.location.href = "/api/x/connect"; }}
                data-testid="button-connect-x"
              >
                <SiX className="w-4 h-4" />
                Connect X
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
