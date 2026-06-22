import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Lock, Mail, ShieldCheck, ArrowLeft } from "lucide-react";
import { isBlank } from "@/lib/utils";

type Step = "email" | "otp" | "newPassword";

export default function ForgotPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const isNewPasswordInvalid = isBlank(newPassword);
  const isConfirmPasswordInvalid = isBlank(confirmPassword);

  const requestOtpMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/request-reset-otp", { email: email.trim() });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message ?? "Failed to send code");
      }
      return res.json();
    },
    onSuccess: () => {
      setStep("otp");
      toast({ title: "Request sent", description: "If that address is registered, a code is on its way. Check your inbox and spam folder." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/verify-reset-otp", { email: email.trim(), code: otp.trim() });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message ?? "Invalid code");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResetToken(data.resetToken);
      setStep("newPassword");
    },
    onError: (e: Error) => {
      toast({ title: "Verification failed", description: e.message, variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/reset-password", { token: resetToken, newPassword });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message ?? "Reset failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setLocation("/auth?reset=success");
    },
    onError: (e: Error) => {
      toast({ title: "Reset failed", description: e.message, variant: "destructive" });
    },
  });

  const handleRequestOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({ title: "Please enter your email", variant: "destructive" });
      return;
    }
    requestOtpMutation.mutate();
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.trim().length !== 6) {
      toast({ title: "Please enter the 6-digit code", variant: "destructive" });
      return;
    }
    verifyOtpMutation.mutate();
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    resetPasswordMutation.mutate();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <img src="/logo-icon.svg" alt="SF Media" className="h-12" />
        </div>

        {step === "email" && (
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-3">
                <div className="rounded-full bg-primary/10 p-3">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
              </div>
              <CardTitle>Forgot your password?</CardTitle>
              <CardDescription>
                Enter your email address. If it's registered, we'll send you a 6-digit reset code.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRequestOtp} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="fp-email">Email address</Label>
                  <Input
                    id="fp-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11"
                    data-testid="input-forgot-email"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={requestOtpMutation.isPending}
                  data-testid="button-send-otp"
                >
                  {requestOtpMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send Code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setLocation("/auth")}
                  data-testid="button-back-to-login"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Sign In
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {step === "otp" && (
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-3">
                <div className="rounded-full bg-primary/10 p-3">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                </div>
              </div>
              <CardTitle>Enter verification code</CardTitle>
              <CardDescription>
                If <strong>{email}</strong> is registered, you'll have a code in your inbox. Check your spam folder too. It expires in 10 minutes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="fp-otp">6-digit code</Label>
                  <Input
                    id="fp-otp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    className="h-11 text-center text-xl tracking-widest font-mono"
                    data-testid="input-otp-code"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={verifyOtpMutation.isPending}
                  data-testid="button-verify-otp"
                >
                  {verifyOtpMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify Code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setStep("email")}
                  data-testid="button-back-to-email"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Use a different email
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {step === "newPassword" && (
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-3">
                <div className="rounded-full bg-primary/10 p-3">
                  <Lock className="h-6 w-6 text-primary" />
                </div>
              </div>
              <CardTitle>Set a new password</CardTitle>
              <CardDescription>
                Choose a strong password for your account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="fp-new-password">New password</Label>
                  <Input
                    id="fp-new-password"
                    type="password"
                    placeholder="Min. 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-11"
                    aria-invalid={isNewPasswordInvalid}
                    data-testid="input-new-password"
                    required
                  />
                  {isNewPasswordInvalid && (
                    <p className="text-sm text-destructive" data-testid="error-new-password">
                      New password cannot be empty or contain only spaces.
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fp-confirm-password">Confirm new password</Label>
                  <Input
                    id="fp-confirm-password"
                    type="password"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-11"
                    aria-invalid={isConfirmPasswordInvalid}
                    data-testid="input-confirm-password"
                    required
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
                  disabled={resetPasswordMutation.isPending || isNewPasswordInvalid || isConfirmPasswordInvalid}
                  data-testid="button-reset-password"
                >
                  {resetPasswordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Password
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
