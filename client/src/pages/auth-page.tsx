import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  CheckCircle,
  Target,
  Zap,
  BarChart3,
} from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Target,
    title: "Brand Voice Analysis",
    desc: "Upload your content and let AI understand your unique brand identity.",
  },
  {
    icon: Zap,
    title: "Instant Content",
    desc: "Generate platform-optimized posts in seconds.",
  },
  {
    icon: BarChart3,
    title: "Campaign Management",
    desc: "Plan, schedule, and track your campaigns from one dashboard.",
  },
];

const SPARKLE =
  "M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z";

/** Flat, on-brand vector illustration for each feature — swaps with the carousel. */
function FeatureArt({ index }: { index: number }) {
  const cls = "h-auto w-full max-w-[360px]";

  // Brand Voice Analysis — profile card + waveform + mic badge
  if (index === 0) {
    const bars = [18, 30, 46, 26, 40, 58, 36, 22, 48, 32, 54, 24, 38, 20, 44, 28];
    return (
      <svg viewBox="0 0 320 240" fill="none" className={cls} role="img" aria-label="Brand voice analysis">
        <rect x="36" y="44" width="248" height="152" rx="18" fill="#ffffff" fillOpacity="0.10" stroke="#ffffff" strokeOpacity="0.18" />
        <circle cx="70" cy="82" r="15" fill="#8AE464" />
        <rect x="96" y="74" width="86" height="9" rx="4.5" fill="#ffffff" fillOpacity="0.75" />
        <rect x="96" y="90" width="54" height="7" rx="3.5" fill="#ffffff" fillOpacity="0.35" />
        <circle cx="246" cy="80" r="20" fill="#8AE464" />
        <rect x="241" y="69" width="10" height="17" rx="5" fill="#063228" />
        <path d="M235 81a11 11 0 0 0 22 0" stroke="#063228" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <line x1="246" y1="92" x2="246" y2="98" stroke="#063228" strokeWidth="2.5" strokeLinecap="round" />
        {bars.map((h, i) => (
          <rect key={i} x={56 + i * 14} y={158 - h / 2} width="7" height={h} rx="3.5" fill={i % 3 === 0 ? "#8AE464" : "#ffffff"} fillOpacity={i % 3 === 0 ? 1 : 0.55} />
        ))}
      </svg>
    );
  }

  // Instant Content — post composer card + AI sparkle
  if (index === 1) {
    return (
      <svg viewBox="0 0 320 240" fill="none" className={cls} role="img" aria-label="Instant content generation">
        <rect x="66" y="34" width="170" height="176" rx="18" fill="#ffffff" fillOpacity="0.10" stroke="#ffffff" strokeOpacity="0.18" />
        <rect x="84" y="52" width="134" height="80" rx="10" fill="#ffffff" fillOpacity="0.14" />
        <circle cx="108" cy="76" r="8" fill="#8AE464" />
        <path d="M88 124 L114 94 L136 116 L166 86 L208 124 Z" fill="#ffffff" fillOpacity="0.22" />
        <rect x="84" y="146" width="120" height="9" rx="4.5" fill="#ffffff" fillOpacity="0.6" />
        <rect x="84" y="162" width="92" height="7" rx="3.5" fill="#ffffff" fillOpacity="0.3" />
        <rect x="84" y="184" width="40" height="8" rx="4" fill="#ffffff" fillOpacity="0.25" />
        <rect x="132" y="184" width="40" height="8" rx="4" fill="#ffffff" fillOpacity="0.25" />
        <g transform="translate(202,18) scale(2.4)">
          <path d={SPARKLE} fill="#8AE464" />
        </g>
        <g transform="translate(196,90) scale(1.1)">
          <path d={SPARKLE} fill="#ffffff" fillOpacity="0.85" />
        </g>
      </svg>
    );
  }

  // Campaign Management — analytics card (bars + trend) + calendar chip
  const bars = [44, 66, 52, 84, 62];
  return (
    <svg viewBox="0 0 320 240" fill="none" className={cls} role="img" aria-label="Campaign management analytics">
      <rect x="56" y="38" width="212" height="152" rx="18" fill="#ffffff" fillOpacity="0.10" stroke="#ffffff" strokeOpacity="0.18" />
      <rect x="74" y="56" width="72" height="9" rx="4.5" fill="#ffffff" fillOpacity="0.5" />
      <line x1="76" y1="166" x2="248" y2="166" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="1.5" />
      {bars.map((h, i) => (
        <rect key={i} x={84 + i * 34} y={166 - h} width="22" height={h} rx="6" fill={i === 3 ? "#8AE464" : "#ffffff"} fillOpacity={i === 3 ? 1 : 0.5} />
      ))}
      <path d="M95 122 L129 106 L163 114 L197 80 L231 94" stroke="#8AE464" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="197" cy="80" r="4.5" fill="#ffffff" />
      <circle cx="231" cy="94" r="4.5" fill="#ffffff" />
      {/* calendar chip */}
      <rect x="38" y="150" width="64" height="60" rx="12" fill="#ffffff" />
      <rect x="52" y="144" width="6" height="14" rx="3" fill="#8AE464" />
      <rect x="82" y="144" width="6" height="14" rx="3" fill="#8AE464" />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        return (
          <circle key={i} cx={54 + col * 16} cy={176 + row * 15} r="3.5" fill={i === 4 ? "#8AE464" : "#0a5f4d"} fillOpacity={i === 4 ? 1 : 0.25} />
        );
      })}
    </svg>
  );
}

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [, setLocation] = useLocation();
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordResetSuccess, setPasswordResetSuccess] = useState(false);
  const [slide, setSlide] = useState(0);
  const { toast } = useToast();

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    fullName: "",
    email: "",
    password: "",
  });

  const isLoginPasswordInvalid =
    loginForm.password.length > 0 && loginForm.password.trim().length === 0;
  const isRegisterPasswordInvalid =
    registerForm.password.length > 0 && registerForm.password.trim().length === 0;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "success") {
      setPasswordResetSuccess(true);
      window.history.replaceState({}, "", "/auth");
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % features.length), 5500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (user) {
      if (user.mustChangePassword) {
        setLocation("/change-password");
      } else if (!user.onboardingCompleted) {
        setLocation("/onboarding");
      } else {
        setLocation("/dashboard");
      }
    }
  }, [user, setLocation]);

  if (user) {
    return null;
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.email || !loginForm.password) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    if (!loginForm.password.trim()) {
      toast({
        title: "Password cannot be empty or contain only spaces.",
        variant: "destructive",
      });
      return;
    }
    loginMutation.mutate(loginForm);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerForm.fullName || !registerForm.email || !registerForm.password) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    if (!registerForm.password.trim()) {
      toast({
        title: "Password cannot be empty or contain only spaces.",
        variant: "destructive",
      });
      return;
    }
    if (registerForm.password.length < 6) {
      toast({
        title: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }
    registerMutation.mutate(registerForm);
  };

  const handleGoogleLogin = () => {
    window.location.href = "/api/auth/google";
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-muted/50 p-4 sm:p-5">
      <div className="grid min-h-[calc(100vh-2rem)] w-full max-w-none grid-cols-1 overflow-hidden rounded-[28px] border border-border/60 bg-card p-2 shadow-2xl sm:min-h-[calc(100vh-2.5rem)] sm:p-2.5 lg:grid-cols-2">
      {/* ─────────────── LEFT: form ─────────────── */}
      <div className="flex flex-col px-6 py-8 sm:px-10 lg:px-12">
        {/* brand */}
        <div className="flex items-center gap-2">
          <img src="/logo-icon.svg" alt="SF Media" className="h-7 w-7" />
          <span className="text-lg font-semibold tracking-tight">SF Media</span>
        </div>

        <div className="flex flex-1 flex-col justify-center py-8">
          <div className="mx-auto w-full max-w-md">
            {passwordResetSuccess && (
              <div
                className="mb-6 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                data-testid="banner-reset-success"
              >
                <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
                <p className="text-sm font-medium">
                  Password updated successfully! You can now sign in.
                </p>
              </div>
            )}

            {/* heading */}
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
                {isLogin ? "Welcome to SF Media" : "Create your account"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {isLogin
                  ? "Start your experience with SF Media by signing in or signing up."
                  : "Get started with AI-powered social media campaigns."}
              </p>
            </div>

            {/* segmented toggle */}
            <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/60 p-1">
              <button
                type="button"
                onClick={() => setIsLogin(true)}
                className={cn(
                  "rounded-lg py-2.5 text-sm font-medium transition-all",
                  isLogin ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
                data-testid="tab-sign-in"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setIsLogin(false)}
                className={cn(
                  "rounded-lg py-2.5 text-sm font-medium transition-all",
                  !isLogin ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
                data-testid="tab-sign-up"
              >
                Sign Up
              </button>
            </div>

            {/* forms */}
            {isLogin ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email">
                    Email Address <span className="text-primary">*</span>
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="Enter your email address"
                      value={loginForm.email}
                      onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                      data-testid="input-login-email"
                      className="h-11 pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="login-password">
                    Password <span className="text-primary">*</span>
                  </Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      aria-invalid={isLoginPasswordInvalid}
                      data-testid="input-login-password"
                      className="h-11 pl-10 pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                      data-testid="button-toggle-password"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {isLoginPasswordInvalid && (
                    <p className="text-sm text-destructive" data-testid="error-login-password">
                      Password cannot be empty or contain only spaces.
                    </p>
                  )}
                  <div className="flex justify-end pt-0.5">
                    <Link
                      href="/forgot-password"
                      className="text-sm font-medium text-muted-foreground hover:text-primary hover:underline"
                      data-testid="link-forgot-password"
                    >
                      Forgot password?
                    </Link>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="h-11 w-full text-[15px]"
                  disabled={loginMutation.isPending || isLoginPasswordInvalid}
                  data-testid="button-login-submit"
                >
                  {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="register-name">
                    Full Name <span className="text-primary">*</span>
                  </Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="register-name"
                      type="text"
                      placeholder="Enter your full name"
                      value={registerForm.fullName}
                      onChange={(e) => setRegisterForm({ ...registerForm, fullName: e.target.value })}
                      data-testid="input-register-name"
                      className="h-11 pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="register-email">
                    Email Address <span className="text-primary">*</span>
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="register-email"
                      type="email"
                      placeholder="Enter your email address"
                      value={registerForm.email}
                      onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                      data-testid="input-register-email"
                      className="h-11 pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="register-password">
                    Password <span className="text-primary">*</span>
                  </Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="register-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Min. 6 characters"
                      value={registerForm.password}
                      onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                      aria-invalid={isRegisterPasswordInvalid}
                      data-testid="input-register-password"
                      className="h-11 pl-10 pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {isRegisterPasswordInvalid && (
                    <p className="text-sm text-destructive" data-testid="error-register-password">
                      Password cannot be empty or contain only spaces.
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="h-11 w-full text-[15px]"
                  disabled={registerMutation.isPending || isRegisterPasswordInvalid}
                  data-testid="button-register-submit"
                >
                  {registerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Account
                </Button>
              </form>
            )}

            {/* divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-3 text-xs text-muted-foreground">Or continue with</span>
              </div>
            </div>

            {/* Google (only social that existed before) */}
            <Button
              variant="outline"
              className="h-11 w-full gap-2"
              onClick={handleGoogleLogin}
              data-testid="button-google-login"
            >
              <FcGoogle className="h-5 w-5" />
              Continue with Google
            </Button>
          </div>
        </div>

        {/* footer */}
        <div className="flex flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
          <span>Copyright : SF Media, All Rights Reserved</span>
          <span className="flex items-center gap-2">
            <Link href="/terms-of-service" className="hover:text-primary hover:underline" data-testid="link-terms-of-service">
              Term &amp; Condition
            </Link>
            <span className="text-border">|</span>
            <Link href="/privacy-policy" className="hover:text-primary hover:underline" data-testid="link-privacy-policy">
              Privacy &amp; Policy
            </Link>
          </span>
        </div>
      </div>

      {/* ─────────────── RIGHT: showcase ─────────────── */}
      <div className="relative hidden overflow-hidden rounded-[22px] bg-gradient-to-br from-[#0e7c64] via-[#0a5f4d] to-[#063228] text-white lg:flex">
        {/* faint grid + glow */}
        <div
          className="absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.5) 1px,transparent 1px)",
            backgroundSize: "46px 46px",
          }}
        />
        <div className="absolute -right-16 -top-16 h-72 w-72 rounded-full bg-[#8AE464]/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-white/5 blur-3xl" />

        <div className="relative z-10 flex w-full flex-col p-10 lg:p-12">
          {/* heading */}
          <div>
            <h2 className="max-w-md text-2xl font-bold leading-tight tracking-tight xl:text-[28px]">
              AI-Powered Social Media Campaigns
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/70">
              Create compelling, on-brand content across all platforms with the power of AI.
            </p>
          </div>

          {/* illustration (synced to slider) */}
          <div className="flex flex-1 items-center justify-center py-6">
            <FeatureArt index={slide} />
          </div>

          {/* caption + pagination */}
          <div>
            <div className="min-h-[76px] max-w-md">
              <h3 className="text-xl font-semibold tracking-tight">{features[slide].title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/75">{features[slide].desc}</p>
            </div>
            <div className="mt-5 flex items-center gap-2">
              {features.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSlide(i)}
                  aria-label={`Show feature ${i + 1}`}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === slide ? "w-10 bg-white" : "w-6 bg-white/30 hover:bg-white/50"
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
