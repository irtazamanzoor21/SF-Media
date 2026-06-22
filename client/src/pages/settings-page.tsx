import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Mail, Loader2, Send, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePermissions } from "@/hooks/use-permissions";

type ReminderFrequency = "daily" | "weekly" | "monthly";

type Preferences = {
  approvalRemindersEnabled: boolean;
  approvalReminderFrequency: ReminderFrequency;
  approvalReminderLastSentAt: string | null;
};

const FREQUENCY_DESCRIPTIONS: Record<ReminderFrequency, string> = {
  daily: "Every 24 hours — posts going out in the next day",
  weekly: "Every 7 days — posts going out in the next week",
  monthly: "Every 30 days — posts going out in the next month",
};

const SAVE_DEBOUNCE_MS = 300;

export default function SettingsPage() {
  const { toast } = useToast();
  const { isAdmin, orgStatus } = usePermissions();
  const [enabled, setEnabled] = useState(true);
  const [frequency, setFrequency] = useState<ReminderFrequency>("weekly");
  const pendingRef = useRef<Partial<Preferences> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: prefs, isLoading } = useQuery<Preferences>({
    queryKey: ["/api/notification-preferences"],
  });

  useEffect(() => {
    if (prefs) {
      setEnabled(prefs.approvalRemindersEnabled);
      setFrequency(prefs.approvalReminderFrequency);
    }
  }, [prefs]);

  const saveMutation = useMutation({
    mutationFn: async (update: Partial<Preferences>) => {
      const res = await apiRequest("PATCH", "/api/notification-preferences", update);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notification-preferences"] });
    },
    onError: (e: any) => {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
      if (prefs) {
        setEnabled(prefs.approvalRemindersEnabled);
        setFrequency(prefs.approvalReminderFrequency);
      }
    },
  });

  const flushSave = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending && Object.keys(pending).length > 0) {
      saveMutation.mutate(pending);
    }
  };

  const scheduleSave = (patch: Partial<Preferences>) => {
    pendingRef.current = { ...(pendingRef.current ?? {}), ...patch };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  };

  useEffect(() => {
    return () => { flushSave(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/notification-preferences/test-reminder", {});
      return res.json();
    },
    onSuccess: (data: { ok: boolean; postCount: number }) => {
      const windowLabel = frequency === "daily" ? "the next 24 hours"
                       : frequency === "weekly" ? "the next 7 days"
                       : "the next 30 days";
      toast({
        title: "Test email sent — check your inbox",
        description: data.postCount > 0
          ? `It includes ${data.postCount} upcoming post${data.postCount === 1 ? "" : "s"} from ${windowLabel}.`
          : `You have no posts scheduled in ${windowLabel}, so the email shows a sample so you can preview the layout.`,
      });
    },
    onError: (e: any) => {
      toast({ title: "Couldn't send test email", description: e.message, variant: "destructive" });
    },
  });

  const handleToggle = (next: boolean) => {
    setEnabled(next);
    scheduleSave({ approvalRemindersEnabled: next });
  };

  const handleFrequency = (next: string) => {
    const f = next as ReminderFrequency;
    setFrequency(f);
    scheduleSave({ approvalReminderFrequency: f });
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-1">Settings</h1>
        <p className="text-muted-foreground text-sm">Manage how SF Media reaches you.</p>
      </div>

      <Card className="p-6 space-y-6">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Bell className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-base">Upcoming-posts reminder</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              An email digest of posts scheduled to publish soon, so you can review them before they go live.
            </p>
          </div>
        </div>

        {orgStatus !== "loading" && !isAdmin() && (
          <div className="flex gap-2 items-start p-3 rounded-md bg-muted/60 border text-sm" data-testid="non-admin-banner">
            <Info className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
            <p className="text-muted-foreground">
              Reminder emails are sent to org admins only. Your preferences are saved and will activate if your role changes.
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 py-2 border-t">
              <div className="space-y-1">
                <Label htmlFor="approval-reminders-toggle" className="text-sm font-medium cursor-pointer">
                  Email me a digest of upcoming posts
                </Label>
                <p className="text-xs text-muted-foreground">
                  We'll only email when you have posts going out in the chosen window — no noise on quiet weeks.
                </p>
              </div>
              <Switch
                id="approval-reminders-toggle"
                checked={enabled}
                onCheckedChange={handleToggle}
                disabled={saveMutation.isPending}
                data-testid="toggle-approval-reminders"
              />
            </div>

            <div className={enabled ? "" : "opacity-50 pointer-events-none"}>
              <Label className="text-sm font-medium block mb-3">How often</Label>
              <RadioGroup
                value={frequency}
                onValueChange={handleFrequency}
                className="grid gap-2"
              >
                {(["daily", "weekly", "monthly"] as ReminderFrequency[]).map((f) => (
                  <Label
                    key={f}
                    htmlFor={`freq-${f}`}
                    className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-muted/40"
                  >
                    <RadioGroupItem value={f} id={`freq-${f}`} className="mt-0.5" data-testid={`freq-${f}`} />
                    <div className="space-y-0.5">
                      <span className="text-sm font-medium capitalize">{f}</span>
                      <span className="block text-xs text-muted-foreground">{FREQUENCY_DESCRIPTIONS[f]}</span>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            <div className="flex items-center justify-between gap-4 pt-4 border-t">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="w-4 h-4" />
                <span>Want to see what it looks like?</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
                className="gap-2"
                data-testid="button-test-reminder"
              >
                {testMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send a test email
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
