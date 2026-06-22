import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, CheckCircle, Lock, Eye, EyeOff } from "lucide-react";
import { isBlank } from "@/lib/utils";

const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 72; // bcrypt ignores bytes beyond 72

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [done, setDone] = useState(false);

  const isNewPasswordBlank = isBlank(newPassword);
  const isTooShort = newPassword.length > 0 && newPassword.length < MIN_PASSWORD_LENGTH;
  const isTooLong = newPassword.length > MAX_PASSWORD_LENGTH;
  const isConfirmPasswordBlank = isBlank(confirmPassword);
  const isMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const canSubmit =
    !isNewPasswordBlank &&
    newPassword.length >= MIN_PASSWORD_LENGTH &&
    newPassword.length <= MAX_PASSWORD_LENGTH &&
    confirmPassword.length > 0 &&
    newPassword === confirmPassword;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (t) setToken(t);
  }, []);

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/reset-password", { token, newPassword });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message ?? "Reset failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setDone(true);
      toast({ title: "Password reset successfully", description: "You can now log in with your new password." });
    },
    onError: (e: Error) => {
      toast({ title: "Reset failed", description: e.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      toast({ title: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`, variant: "destructive" });
      return;
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      toast({ title: `Password must be no more than ${MAX_PASSWORD_LENGTH} characters`, variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    resetMutation.mutate();
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center text-muted-foreground">
            Invalid or missing reset token. Please request a new password reset link.
          </CardContent>
        </Card>
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
          <CardTitle className="text-center">Reset Your Password</CardTitle>
          <CardDescription className="text-center">
            Enter a new password for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-green-700 font-medium">Password reset successfully!</p>
              <Button className="w-full" onClick={() => setLocation("/auth")} data-testid="button-go-to-login">
                Go to Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    required
                    maxLength={MAX_PASSWORD_LENGTH}
                    aria-invalid={isNewPasswordBlank || isTooShort || isTooLong}
                    className="pr-10"
                    data-testid="input-new-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowNewPassword(v => !v)}
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                    data-testid="button-toggle-new-password"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                </div>
                {isNewPasswordBlank ? (
                  <p className="text-sm text-destructive" data-testid="error-new-password">
                    New password cannot be empty or contain only spaces.
                  </p>
                ) : isTooShort ? (
                  <p className="text-sm text-destructive" data-testid="error-new-password">
                    Password must be at least {MIN_PASSWORD_LENGTH} characters.
                  </p>
                ) : isTooLong ? (
                  <p className="text-sm text-destructive" data-testid="error-new-password">
                    Password must be no more than {MAX_PASSWORD_LENGTH} characters.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    required
                    maxLength={MAX_PASSWORD_LENGTH}
                    aria-invalid={isConfirmPasswordBlank || isMismatch}
                    className="pr-10"
                    data-testid="input-confirm-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(v => !v)}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    data-testid="button-toggle-confirm-password"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                </div>
                {isConfirmPasswordBlank ? (
                  <p className="text-sm text-destructive" data-testid="error-confirm-password">
                    Confirm password cannot be empty or contain only spaces.
                  </p>
                ) : isMismatch ? (
                  <p className="text-sm text-destructive" data-testid="error-confirm-password">
                    Passwords do not match.
                  </p>
                ) : null}
              </div>
              <Button type="submit" className="w-full" disabled={resetMutation.isPending || !canSubmit} data-testid="button-reset-password">
                {resetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Reset Password
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
