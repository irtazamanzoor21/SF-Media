import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { isBlank } from "@/lib/utils";

export default function ChangePasswordPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [mustChange] = useState(() => !!user?.mustChangePassword);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const isCurrentPasswordInvalid = isBlank(currentPassword);
  const isNewPasswordInvalid = isBlank(newPassword);
  const isConfirmPasswordInvalid = isBlank(confirmPassword);

  const changeMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = { newPassword };
      if (!mustChange) body.currentPassword = currentPassword;
      const res = await apiRequest("POST", "/api/user/change-password", body);
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message ?? "Password change failed");
      }
      return res.json() as Promise<{ success: boolean; user: any }>;
    },
    onSuccess: () => {
      setIsRedirecting(true);
      toast({ title: "Password updated", description: "Your new password is now active." });
      // Full page reload so the protected-route guard re-reads a fresh user from the server.
      // This is the most reliable way to avoid any cache-staleness race where
      // mustChangePassword=true lingers in the client cache and bounces the user back here.
      const destination = mustChange ? "/onboarding" : "/dashboard";
      window.location.assign(destination);
    },
    onError: (e: Error) => {
      toast({ title: "Could not update password", description: e.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    changeMutation.mutate();
  };

  if (isRedirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex justify-center mb-2">
            <div className="rounded-full bg-blue-100 p-3">
              <Lock className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-center">
            {mustChange ? "Set your password" : "Change your password"}
          </CardTitle>
          <CardDescription className="text-center">
            {mustChange
              ? "Your workspace was created for you. Choose a new password to continue."
              : "Enter your current password and a new one."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!mustChange && (
              <div className="space-y-1">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  required
                  aria-invalid={isCurrentPasswordInvalid}
                  data-testid="input-current-password"
                />
                {isCurrentPasswordInvalid && (
                  <p className="text-sm text-destructive" data-testid="error-current-password">
                    Current password cannot be empty or contain only spaces.
                  </p>
                )}
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                required
                aria-invalid={isNewPasswordInvalid}
                data-testid="input-new-password"
              />
              {isNewPasswordInvalid && (
                <p className="text-sm text-destructive" data-testid="error-new-password">
                  New password cannot be empty or contain only spaces.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
                aria-invalid={isConfirmPasswordInvalid}
                data-testid="input-confirm-password"
              />
              {isConfirmPasswordInvalid && (
                <p className="text-sm text-destructive" data-testid="error-confirm-password">
                  Confirm password cannot be empty or contain only spaces.
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={changeMutation.isPending || isNewPasswordInvalid || isConfirmPasswordInvalid || (!mustChange && isCurrentPasswordInvalid)}
              data-testid="button-change-password"
            >
              {changeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {mustChange ? "Set Password & Continue" : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
