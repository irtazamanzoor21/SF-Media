import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Clock, Trash2, Pencil, Send, CalendarIcon, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { SiFacebook } from "react-icons/si";
import { format, isPast } from "date-fns";

type ScheduledPost = {
  id: number;
  pageId: string;
  pageName: string;
  message: string;
  scheduledAt: string;
  status: "pending" | "sent" | "failed";
  sentAt?: string;
  errorMessage?: string;
  campaignPostId?: number;
  createdAt: string;
};

type FbStatus = { connected: boolean; pageId?: string; pageName?: string };

function StatusBadge({ status }: { status: string }) {
  if (status === "sent") {
    return (
      <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 dark:bg-green-950/20 gap-1">
        <CheckCircle2 className="w-3 h-3" /> Sent
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 dark:bg-red-950/20 gap-1">
        <XCircle className="w-3 h-3" /> Failed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950/20 gap-1">
      <Clock className="w-3 h-3" /> Scheduled
    </Badge>
  );
}

export default function ScheduledPostsPage() {
  const { toast } = useToast();
  const [editPost, setEditPost] = useState<ScheduledPost | null>(null);
  const [deletePost, setDeletePost] = useState<ScheduledPost | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [editTime, setEditTime] = useState("");

  const { data: fbStatus } = useQuery<FbStatus>({
    queryKey: ["/api/facebook/status"],
  });

  const { data: posts, isLoading } = useQuery<ScheduledPost[]>({
    queryKey: ["/api/facebook/scheduled-posts"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/facebook/scheduled-posts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/facebook/scheduled-posts"] });
      toast({ title: "Post cancelled" });
      setDeletePost(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, message, scheduledAt }: { id: number; message: string; scheduledAt: string }) =>
      apiRequest("PATCH", `/api/facebook/scheduled-posts/${id}`, { message, scheduledAt }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/facebook/scheduled-posts"] });
      toast({ title: "Post updated" });
      setEditPost(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const postNowMutation = useMutation({
    mutationFn: async (post: ScheduledPost) => {
      const res = await apiRequest("POST", `/api/facebook/scheduled-posts/${post.id}/post-now`, {});
      const data = await res.json();
      if (!res.ok) {
        if (data.expired) {
          queryClient.invalidateQueries({ queryKey: ["/api/facebook/status"] });
        }
        throw new Error(data.message || "Failed to post");
      }
      return data;
    },
    onSuccess: (_, post) => {
      queryClient.invalidateQueries({ queryKey: ["/api/facebook/scheduled-posts"] });
      toast({ title: "Posted to Facebook!", description: `Published to ${post.pageName}` });
    },
    onError: (err: Error) => {
      toast({ title: "Post failed", description: err.message, variant: "destructive" });
    },
  });

  const openEdit = (post: ScheduledPost) => {
    setEditPost(post);
    setEditMessage(post.message);
    setEditTime(format(new Date(post.scheduledAt), "yyyy-MM-dd'T'HH:mm"));
  };

  const pending = posts?.filter((p) => p.status === "pending") ?? [];
  const history = posts?.filter((p) => p.status !== "pending") ?? [];

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Scheduled Posts</h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          Manage posts queued to be published to your Facebook Pages.
        </p>
      </div>

      {!fbStatus?.connected && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/10">
          <CardContent className="flex items-center gap-3 pt-4 pb-4">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              No Facebook account connected. <a href="/dashboard/social-accounts" className="underline font-medium">Connect now</a> to enable publishing.
            </p>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-base font-semibold mb-3">Upcoming</h2>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : pending.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground text-sm">
              No posts scheduled yet. Go to a campaign and click "Schedule for Facebook" to add one.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pending.map((post) => (
              <Card key={post.id} data-testid={`scheduled-post-${post.id}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <div className="flex items-center gap-1.5 text-[#1877f2]">
                          <SiFacebook className="w-4 h-4" />
                          <span className="text-sm font-medium">{post.pageName}</span>
                        </div>
                        <StatusBadge status={post.status} />
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <CalendarIcon className="w-3 h-3" />
                          {format(new Date(post.scheduledAt), "MMM d, yyyy 'at' h:mm a")}
                        </span>
                      </div>
                      <p className="text-sm line-clamp-2">{post.message}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap sm:flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => postNowMutation.mutate(post)}
                        disabled={postNowMutation.isPending}
                        className="gap-1.5 text-xs"
                        data-testid={`btn-post-now-${post.id}`}
                      >
                        {postNowMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        Post Now
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(post)}
                        className="gap-1.5 text-xs"
                        data-testid={`btn-edit-${post.id}`}
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeletePost(post)}
                        className="gap-1.5 text-xs text-destructive hover:text-destructive"
                        data-testid={`btn-delete-${post.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">History</h2>
          <div className="space-y-3">
            {history.map((post) => (
              <Card key={post.id} className="opacity-75" data-testid={`history-post-${post.id}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <div className="flex items-center gap-1.5 text-[#1877f2]">
                          <SiFacebook className="w-4 h-4" />
                          <span className="text-sm font-medium">{post.pageName}</span>
                        </div>
                        <StatusBadge status={post.status} />
                        {post.sentAt && (
                          <span className="text-xs text-muted-foreground">
                            Sent {format(new Date(post.sentAt), "MMM d, yyyy 'at' h:mm a")}
                          </span>
                        )}
                        {post.status === "failed" && !post.sentAt && (
                          <span className="text-xs text-muted-foreground">
                            Scheduled for {format(new Date(post.scheduledAt), "MMM d, yyyy 'at' h:mm a")}
                          </span>
                        )}
                      </div>
                      <p className="text-sm line-clamp-2">{post.message}</p>
                      {post.errorMessage && (
                        <p className="text-xs text-red-500 mt-1">{post.errorMessage}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {editPost && (
        <Dialog open onOpenChange={() => setEditPost(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Scheduled Post</DialogTitle>
              <DialogDescription>Update the message or scheduled time for this post.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-message">Message</Label>
                <Textarea
                  id="edit-message"
                  value={editMessage}
                  onChange={(e) => setEditMessage(e.target.value)}
                  rows={4}
                  data-testid="textarea-edit-message"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-time">Scheduled Time</Label>
                <input
                  id="edit-time"
                  type="datetime-local"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="input-edit-time"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditPost(null)}>Cancel</Button>
              <Button
                onClick={() => editMutation.mutate({ id: editPost.id, message: editMessage, scheduledAt: new Date(editTime).toISOString() })}
                disabled={editMutation.isPending || !editMessage.trim() || !editTime}
                data-testid="button-save-edit"
              >
                {editMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {deletePost && (
        <AlertDialog open onOpenChange={() => setDeletePost(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel Scheduled Post?</AlertDialogTitle>
              <AlertDialogDescription>
                This post will not be published. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep It</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate(deletePost.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                Cancel Post
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
