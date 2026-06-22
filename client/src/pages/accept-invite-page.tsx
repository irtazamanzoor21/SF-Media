import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Eye, EyeOff, Building2, Shield, Mail, User, CheckCircle2, AlertTriangle, Lock } from "lucide-react";
import { isBlank } from "@/lib/utils";

type InviteData = {
  email: string;
  fullName: string;
  organizationName: string;
  roleName: string;
  hasPassword: boolean;
};

export default function AcceptInvitePage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token");
  const { toast } = useToast();

  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const isFullNameInvalid = isBlank(fullName);
  const isPasswordInvalid = isBlank(password);
  const isConfirmPasswordInvalid = isBlank(confirmPassword);

  useEffect(() => {
    if (!token) {
      setError("No invitation token provided");
      setLoading(false);
      return;
    }
    fetch(`/api/invite/verify?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Invalid invitation");
        }
        return res.json();
      })
      .then((data: InviteData) => {
        setInviteData(data);
        setFullName(data.fullName || "");
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/invite/accept", {
        token,
        password,
        fullName,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to set up account");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/user/permissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      setSuccess(true);
      toast({ title: "Account set up successfully!" });
      setTimeout(() => setLocation("/dashboard"), 2000);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verifying invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950 p-4">
        <Card className="w-full max-w-md shadow-lg border-0">
          <CardContent className="pt-10 pb-8 px-8 text-center space-y-5">
            <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold" data-testid="text-invite-error">Invitation Error</h2>
              <p className="text-muted-foreground text-sm">{error}</p>
            </div>
            <Button onClick={() => setLocation("/auth")} className="mt-2" data-testid="button-go-login">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950 p-4">
        <Card className="w-full max-w-md shadow-lg border-0">
          <CardContent className="pt-10 pb-8 px-8 text-center space-y-5">
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7 text-green-600 dark:text-green-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold" data-testid="text-invite-success">Welcome Aboard!</h2>
              <p className="text-muted-foreground text-sm">Your account is ready. Redirecting to dashboard...</p>
            </div>
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950 p-4">
      <div className="w-full max-w-[460px] space-y-6">

        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <img src="/logo-icon.svg" alt="SF Media" className="h-14" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-invite-title">Set Up Your Account</h1>
            <p className="text-muted-foreground text-sm">
              Complete your profile to join <span className="font-medium text-foreground">{inviteData?.organizationName}</span>
            </p>
          </div>
        </div>

        <Card className="shadow-lg border-0 overflow-hidden">
          <div className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--primary)/0.85)] px-6 py-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-white/60 font-medium">Organization</p>
                  <p className="text-sm font-semibold text-white" data-testid="text-org-name">{inviteData?.organizationName}</p>
                </div>
              </div>
              <div className="h-8 w-px bg-white/20 mx-1" />
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-white/60 font-medium">Your Role</p>
                  <Badge variant="secondary" className="text-xs px-2 py-0 h-5 bg-white/20 text-white border-0 hover:bg-white/20" data-testid="text-role-name">
                    {inviteData?.roleName}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          <CardContent className="p-6">
            <div className="flex items-center gap-2.5 bg-muted/50 rounded-lg px-4 py-3 mb-6">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Email</p>
                <p className="text-sm font-medium truncate" data-testid="text-invite-email">{inviteData?.email}</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-medium">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="pl-10 h-10"
                    required
                    aria-invalid={isFullNameInvalid}
                    data-testid="input-fullname"
                  />
                </div>
                {isFullNameInvalid && (
                  <p className="text-sm text-destructive" data-testid="error-full-name">
                    Full name cannot be empty or contain only spaces.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a password"
                    className="pl-10 pr-10 h-10"
                    required
                    minLength={8}
                    aria-invalid={isPasswordInvalid}
                    data-testid="input-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {isPasswordInvalid && (
                  <p className="text-sm text-destructive" data-testid="error-invite-password">
                    Password cannot be empty or contain only spaces.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    className="pl-10 pr-10 h-10"
                    required
                    minLength={8}
                    aria-invalid={isConfirmPasswordInvalid}
                    data-testid="input-confirm-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                    data-testid="button-toggle-confirm-password"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {isConfirmPasswordInvalid && (
                  <p className="text-sm text-destructive" data-testid="error-confirm-password">
                    Confirm password cannot be empty or contain only spaces.
                  </p>
                )}
                {password && confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-destructive">Passwords don't match</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-10 font-semibold text-sm"
                disabled={submitting || !fullName.trim() || !password || !confirmPassword || password !== confirmPassword || isFullNameInvalid || isPasswordInvalid || isConfirmPasswordInvalid}
                data-testid="button-setup-account"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Setting up your account...
                  </>
                ) : (
                  "Create Account & Join Team"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <a href="/auth" className="text-primary hover:underline font-medium" data-testid="link-go-login">
            Sign in instead
          </a>
        </p>
      </div>
    </div>
  );
}
