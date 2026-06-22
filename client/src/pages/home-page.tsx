import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Target,
  Zap,
  BarChart3,
  Calendar,
  ImageIcon,
  ArrowRight,
  Mail,
  MousePointerClick,
  Layers,
  Globe,
} from "lucide-react";
import { SiInstagram, SiFacebook } from "react-icons/si";
import { FaLinkedin } from "react-icons/fa6";
import { FaXTwitter } from "react-icons/fa6";

const features = [
  {
    icon: Target,
    title: "Brand Voice Analysis",
    desc: "Upload your website or documents and let AI extract your unique brand identity, tone, and messaging style.",
    span: "md:col-span-2",
  },
  {
    icon: Sparkles,
    title: "AI Content Generation",
    desc: "Generate platform-optimized posts for LinkedIn, Instagram, X, and Facebook in seconds.",
    span: "",
  },
  {
    icon: ImageIcon,
    title: "Media Library",
    desc: "Store, organize, and generate AI-powered images for your campaigns with a built-in media manager.",
    span: "",
  },
  {
    icon: Calendar,
    title: "Calendar Scheduling",
    desc: "Visualize and schedule your posts on a drag-and-drop calendar for seamless publishing.",
    span: "",
  },
  {
    icon: Zap,
    title: "Instant Editing",
    desc: "Edit generated posts with a rich text editor and regenerate content until it's perfect.",
    span: "",
  },
];

const steps = [
  {
    icon: Globe,
    title: "Analyze Your Brand",
    desc: "Share your website URL or brand documents. Our AI studies your voice, tone, and messaging.",
  },
  {
    icon: Layers,
    title: "Generate Content",
    desc: "Create campaigns with platform-specific posts tailored to your brand across every channel.",
  },
  {
    icon: MousePointerClick,
    title: "Schedule & Publish",
    desc: "Organize posts on your calendar, fine-tune, and publish across all your social channels.",
  },
];

const stats = [
  { value: "4", label: "Platforms Supported" },
  { value: "< 60s", label: "To Generate a Campaign" },
  { value: "100%", label: "On-Brand Content" },
];

const platforms = [
  { icon: FaLinkedin, name: "LinkedIn", color: "text-[#0A66C2]" },
  { icon: SiInstagram, name: "Instagram", color: "text-[#E4405F]" },
  { icon: FaXTwitter, name: "X", color: "text-foreground" },
  { icon: SiFacebook, name: "Facebook", color: "text-[#1877F2]" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <nav className="border-b border-border/50 bg-background/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/home">
            <img src="/logo-icon.svg" alt="SF Media" className="h-14 cursor-pointer" data-testid="link-home-logo" />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/auth">
              <Button variant="ghost" data-testid="button-sign-in">
                Sign In
              </Button>
            </Link>
            <Link href="/auth">
              <Button data-testid="button-get-started-nav">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        <section className="relative overflow-hidden pt-16 pb-24 sm:pt-24 sm:pb-32 lg:pt-32 lg:pb-40">
          <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-primary/8 blur-[120px] pointer-events-none" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] rounded-full bg-primary/5 blur-[100px] pointer-events-none" />

          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div>
                <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-3.5 py-1 text-xs font-semibold tracking-wide uppercase mb-6 border border-primary/20" data-testid="badge-hero">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI-Powered Social Media
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight leading-[1.1] mb-6" data-testid="text-hero-title">
                  Social content that
                  <br />
                  <span className="bg-gradient-to-r from-primary to-[#8AE464] bg-clip-text text-transparent">sounds like you.</span>
                </h1>
                <p className="text-lg text-muted-foreground max-w-lg mb-8 leading-relaxed" data-testid="text-hero-subtitle">
                  SF Media learns your brand voice and generates ready-to-publish campaigns across LinkedIn, Instagram, X, and Facebook.
                </p>
                <div className="flex flex-col sm:flex-row items-start gap-4 mb-10">
                  <Link href="/auth">
                    <Button size="lg" className="gap-2 text-base px-8 shadow-lg shadow-primary/25" data-testid="button-get-started-hero">
                      Start for Free
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
                <div className="flex items-center gap-5">
                  {platforms.map((p) => (
                    <div key={p.name} className="flex items-center gap-1.5 text-muted-foreground" data-testid={`badge-platform-${p.name.toLowerCase()}`}>
                      <p.icon className={`w-4 h-4 ${p.color}`} />
                      <span className="text-xs font-medium hidden sm:inline">{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative hidden lg:block">
                <div className="relative rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-6 shadow-2xl shadow-primary/5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-3 h-3 rounded-full bg-red-400/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
                    <div className="w-3 h-3 rounded-full bg-green-400/80" />
                    <span className="text-xs text-muted-foreground ml-2 font-medium">SF Media</span>
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-lg bg-muted/60 p-4 border border-border/40">
                      <div className="flex items-center gap-2 mb-2">
                        <BarChart3 className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold">Campaign: Spring Launch</span>
                      </div>
                      <div className="h-2 rounded-full bg-primary/20 mb-1.5"><div className="h-2 rounded-full bg-primary w-3/4" /></div>
                      <span className="text-xs text-muted-foreground">12 posts generated</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-muted/60 p-3 border border-border/40">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <FaLinkedin className="w-3.5 h-3.5 text-[#0A66C2]" />
                          <span className="text-xs font-medium">LinkedIn</span>
                        </div>
                        <div className="space-y-1">
                          <div className="h-1.5 rounded bg-foreground/10 w-full" />
                          <div className="h-1.5 rounded bg-foreground/10 w-4/5" />
                          <div className="h-1.5 rounded bg-foreground/10 w-3/5" />
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/60 p-3 border border-border/40">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <SiInstagram className="w-3.5 h-3.5 text-[#E4405F]" />
                          <span className="text-xs font-medium">Instagram</span>
                        </div>
                        <div className="space-y-1">
                          <div className="h-1.5 rounded bg-foreground/10 w-full" />
                          <div className="h-1.5 rounded bg-foreground/10 w-3/4" />
                          <div className="h-1.5 rounded bg-foreground/10 w-2/3" />
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-center gap-3">
                      <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
                      <div>
                        <span className="text-xs font-semibold text-primary">Brand Voice Match</span>
                        <div className="text-[11px] text-muted-foreground">Tone: Professional & Approachable</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute -bottom-4 -right-4 w-24 h-24 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 blur-xl pointer-events-none" />
              </div>
            </div>
          </div>
        </section>

        <section className="py-4 border-y border-border/50 bg-muted/30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-3 divide-x divide-border/50">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center py-4 px-2" data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  <div className="text-2xl sm:text-3xl font-bold text-foreground">{stat.value}</div>
                  <div className="text-xs sm:text-sm text-muted-foreground mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 sm:py-28">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-xl mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4 tracking-tight" data-testid="text-features-title">
                Built for teams who
                <br className="hidden sm:block" />
                take social seriously.
              </h2>
              <p className="text-muted-foreground text-lg" data-testid="text-features-subtitle">
                Every tool you need from brand analysis to publishing, in one place.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className={`group relative rounded-2xl border border-border/60 bg-card p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 ${feature.span}`}
                  data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110">
                    <feature.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-base font-semibold mb-1.5">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 sm:py-28 bg-muted/30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4 tracking-tight" data-testid="text-how-it-works-title">
                Up and running in minutes.
              </h2>
              <p className="text-muted-foreground text-lg max-w-lg mx-auto" data-testid="text-how-it-works-subtitle">
                Three steps to on-brand content across every platform.
              </p>
            </div>
            <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
              <div className="hidden md:block absolute top-10 left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-border to-transparent" />
              {steps.map((step, i) => (
                <div key={i} className="relative text-center" data-testid={`card-step-${i + 1}`}>
                  <div className="relative z-10 w-20 h-20 rounded-2xl bg-card border border-border/60 flex items-center justify-center mx-auto mb-5 shadow-sm">
                    <step.icon className="w-8 h-8 text-primary" />
                  </div>
                  <span className="inline-block text-xs font-semibold text-primary/60 uppercase tracking-widest mb-2">Step {i + 1}</span>
                  <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 sm:py-28">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-[#0e8f6f] p-10 sm:p-16 text-center" data-testid="section-cta">
              <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-white/5 blur-3xl pointer-events-none translate-x-1/3 -translate-y-1/3" />
              <div className="absolute bottom-0 left-0 w-60 h-60 rounded-full bg-white/5 blur-3xl pointer-events-none -translate-x-1/3 translate-y-1/3" />
              <div className="relative z-10">
                <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-white tracking-tight" data-testid="text-cta-title">
                  Ready to sound like yourself on social?
                </h2>
                <p className="text-emerald-100 text-lg max-w-xl mx-auto mb-8" data-testid="text-cta-subtitle">
                  Join SF Media and start creating campaigns that match your brand's voice — in seconds, not hours.
                </p>
                <Link href="/auth">
                  <Button size="lg" variant="secondary" className="gap-2 text-base px-8 shadow-lg" data-testid="button-get-started-cta">
                    Get Started Free
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50 bg-card/50 py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-6">
            <Link href="/home">
              <img src="/logo-icon.svg" alt="SF Media" className="h-14 cursor-pointer" data-testid="link-footer-logo" />
            </Link>

            <div className="text-center max-w-lg">
              <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-footer-about">
                SF Media is an AI-powered social media campaign platform that helps businesses create on-brand content, manage campaigns, and schedule posts across all major social platforms.
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-footer-contact">
              <Mail className="w-4 h-4" />
              <a href="mailto:hello@springpost.co" className="hover:text-foreground transition-colors">
                hello@springpost.co
              </a>
            </div>

            <div className="flex items-center gap-6">
              <Link href="/privacy-policy" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-privacy">
                Privacy Policy
              </Link>
              <Link href="/terms-of-service" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-terms">
                Terms of Service
              </Link>
            </div>
            <span className="text-xs text-muted-foreground" data-testid="text-footer-copyright">
              &copy; {new Date().getFullYear()} SF Media. All rights reserved.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
