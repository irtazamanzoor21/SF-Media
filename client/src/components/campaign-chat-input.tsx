import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Loader2, Send, RefreshCcw, Wand2, Bot, User as UserIcon,
  AlertTriangle, Briefcase, Coffee, Zap, Heart, Smile, Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuota } from "@/hooks/use-quota";
import { isBlank } from "@/lib/utils";
import type { BrandProfile, CampaignChatResponse } from "@shared/schema";
import fbIcon from "@assets/fb_1771492183119.png";
import instIcon from "@assets/inst_1771492183120.png";
import linkedinIcon from "@assets/linkedin_1771492183122.png";
import xIcon from "@assets/x_1771492183122.png";

const GREETING = "Hi! Tell me about the campaign you'd like to create. What's it about, and where do you want to post?";
const MAX_MESSAGES = 30;
const TEXTAREA_MAX_PX = 112; // ~4 lines at 24px line-height + padding

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  extracted?: CampaignChatResponse;
  ready?: boolean;
  streaming?: boolean;
  error?: string;
};

interface Props {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onReady: (extracted: CampaignChatResponse) => void;
  onSwitchToManual: () => void;
}

const PLATFORM_QUICK_REPLIES: Array<{ value: string; label: string; icon: string }> = [
  { value: "LinkedIn", label: "LinkedIn", icon: linkedinIcon },
  { value: "X", label: "X", icon: xIcon },
  { value: "Instagram", label: "Instagram", icon: instIcon },
  { value: "Facebook", label: "Facebook", icon: fbIcon },
];

const TONE_QUICK_REPLIES = [
  { value: "Professional", icon: Briefcase },
  { value: "Casual", icon: Coffee },
  { value: "Energetic", icon: Zap },
  { value: "Friendly", icon: Heart },
  { value: "Witty", icon: Smile },
] as const;

const POSTS_COUNT_QUICK_REPLIES = [1, 2, 3, 4, 5] as const;

const DEFAULT_CTA_QUICK_REPLIES = ["Learn More", "Sign Up", "Shop Now", "Get Started", "Try Free"];

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`} data-testid={`chat-msg-${message.role}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm"
        }`}
      >
        {message.error ? (
          <span className="flex items-center gap-1.5 text-destructive">
            <AlertTriangle className="w-3.5 h-3.5" />
            {message.error}
          </span>
        ) : message.content || (message.streaming ? <TypingDots /> : "")}
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
          <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 items-center" aria-label="Assistant is typing">
      <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
    </span>
  );
}

function QuickReplyButton({ onClick, children, testId }: { onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-background text-sm hover:bg-accent hover:border-primary/40 transition-colors"
      data-testid={testId}
    >
      {children}
    </button>
  );
}

// Platforms are multi-select: the user toggles any number, then confirms once.
// Mounted only while nextField === "platforms", so its selection state resets
// automatically each time the assistant asks about platforms again.
function PlatformMultiSelect({ onConfirm }: { onConfirm: (csv: string) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (v: string) =>
    setSelected((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  return (
    <div className="flex flex-col gap-2 px-5 py-3 border-t bg-muted/30">
      <div className="flex flex-wrap gap-2">
        {PLATFORM_QUICK_REPLIES.map((p) => {
          const isOn = selected.includes(p.value);
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => toggle(p.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors ${
                isOn
                  ? "border-primary bg-primary/10 text-primary"
                  : "bg-background hover:bg-accent hover:border-primary/40"
              }`}
              data-testid={`quick-platform-${p.value.toLowerCase()}`}
            >
              <img src={p.icon} alt={p.label} className="w-4 h-4 rounded object-contain" />
              {p.label}
              {isOn && <Check className="w-3.5 h-3.5 ml-0.5" />}
            </button>
          );
        })}
      </div>
      <Button
        size="sm"
        className="self-start"
        disabled={selected.length === 0}
        onClick={() => onConfirm(selected.join(", "))}
        data-testid="quick-platform-continue"
      >
        Continue{selected.length > 0 ? ` with ${selected.length}` : ""}
      </Button>
    </div>
  );
}

function QuickReplies({
  nextField,
  brandCtas,
  onPick,
}: {
  nextField: NonNullable<CampaignChatResponse["nextField"]>;
  brandCtas: string[];
  onPick: (text: string) => void;
}) {
  if (nextField === "platforms") {
    return <PlatformMultiSelect onConfirm={onPick} />;
  }
  if (nextField === "tone") {
    return (
      <div className="flex flex-wrap gap-2 px-5 py-3 border-t bg-muted/30">
        {TONE_QUICK_REPLIES.map((t) => {
          const Icon = t.icon;
          return (
            <QuickReplyButton key={t.value} onClick={() => onPick(t.value)} testId={`quick-tone-${t.value.toLowerCase()}`}>
              <Icon className="w-3.5 h-3.5" />
              {t.value}
            </QuickReplyButton>
          );
        })}
      </div>
    );
  }
  if (nextField === "postsCount") {
    return (
      <div className="flex flex-wrap gap-2 px-5 py-3 border-t bg-muted/30">
        {POSTS_COUNT_QUICK_REPLIES.map((n) => (
          <QuickReplyButton key={n} onClick={() => onPick(`${n} ${n === 1 ? "post" : "posts"}`)} testId={`quick-count-${n}`}>
            {n}
          </QuickReplyButton>
        ))}
      </div>
    );
  }
  if (nextField === "callToAction") {
    const merged = [...brandCtas.slice(0, 3), ...DEFAULT_CTA_QUICK_REPLIES.filter((c) => !brandCtas.includes(c))].slice(0, 6);
    return (
      <div className="flex flex-wrap gap-2 px-5 py-3 border-t bg-muted/30">
        {merged.map((c) => (
          <QuickReplyButton key={c} onClick={() => onPick(c)} testId={`quick-cta-${c.toLowerCase().replace(/\s+/g, "-")}`}>
            {c}
          </QuickReplyButton>
        ))}
      </div>
    );
  }
  return null;
}

export function CampaignChatInput({ messages, setMessages, onReady, onSwitchToManual }: Props) {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: brandProfile } = useQuery<BrandProfile>({
    queryKey: ["/api/brand-profile"],
  });
  const brandCtas = brandProfile?.customCtas ?? [];

  const { isAtAiLimit, tier } = useQuota();

  // Auto-scroll to bottom whenever the message list changes.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Autogrow textarea up to ~4 lines.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(ta.scrollHeight, TEXTAREA_MAX_PX) + "px";
  }, [input]);

  const lastMessage = messages[messages.length - 1];
  const suggestionField =
    lastMessage?.role === "assistant" && !lastMessage.streaming && !lastMessage.error
      ? lastMessage.extracted?.nextField ?? null
      : null;
  const readyMessage = [...messages].reverse().find((m) => m.role === "assistant" && m.ready && m.extracted);

  const handleStartOver = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setInput("");
    setIsSending(false);
  };

  const sendMessage = async (text: string) => {
    const t = text.trim();
    if (!t || isSending) return;
    if (messages.length >= MAX_MESSAGES - 1) {
      toast({
        title: "Long chat",
        description: "Let's start over to keep things clean — click 'Start over' above.",
        variant: "destructive",
      });
      return;
    }

    const userMessage: ChatMessage = { role: "user", content: t };
    const placeholder: ChatMessage = { role: "assistant", content: "", streaming: true };
    const nextMessages = [...messages, userMessage, placeholder];
    setMessages(nextMessages);
    setInput("");
    setIsSending(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const payload = nextMessages
        .filter((_, idx) => idx < nextMessages.length - 1)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/campaigns/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: payload }),
        signal: controller.signal,
      });

      if (!res.ok && res.headers.get("content-type")?.includes("application/json")) {
        const err = await res.json();
        throw new Error(err.message || `Request failed (${res.status})`);
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      const updateLastAssistant = (patch: Partial<ChatMessage>) => {
        setMessages((prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === "assistant") {
              next[i] = { ...next[i], ...patch };
              break;
            }
          }
          return next;
        });
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const block of events) {
          const line = block.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let data: any;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }

          if (data.type === "delta" && typeof data.text === "string") {
            accumulated += data.text;
            updateLastAssistant({ content: accumulated, streaming: true });
          } else if (data.type === "reply_complete") {
            // Conversational reply done — unfreeze the input/button. Structured
            // extraction continues server-side; the `done` event will carry it.
            updateLastAssistant({ content: accumulated, streaming: false });
            setIsSending(false);
          } else if (data.type === "done") {
            updateLastAssistant({
              content: data.fullReply || accumulated,
              streaming: false,
              extracted: data.extracted ?? undefined,
              ready: !!data.ready,
            });
            setIsSending(false);
          } else if (data.type === "error") {
            throw new Error(data.message || "Something went wrong.");
          }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setMessages((prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === "assistant") {
              next[i] = { ...next[i], streaming: false, error: e.message || "Couldn't reach the assistant. Try again." };
              break;
            }
          }
          return next;
        });
      }
      setIsSending(false);
    } finally {
      abortRef.current = null;
    }
  };

  const handleSend = () => { sendMessage(input); };

  const isInputInvalid = isBlank(input);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card
      className="flex flex-col"
      data-testid="campaign-chat"
      style={{ height: "min(720px, max(480px, calc(100vh - 220px)))" }}
    >
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="w-4 h-4 text-primary" />
          Campaign assistant
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleStartOver}
          disabled={messages.length === 0}
          className="gap-1.5 text-xs h-7"
          data-testid="button-chat-start-over"
        >
          <RefreshCcw className="w-3 h-3" />
          Start over
        </Button>
      </div>

      {isAtAiLimit && (
        <div className="flex items-start gap-2 px-5 py-2.5 border-b bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-300" data-testid="chat-banner-ai-limit">
          <span className="shrink-0 mt-0.5">ℹ️</span>
          <span>
            You're out of AI posts on the {tier} plan. You can still plan a campaign here —{" "}
            <a href="/subscribe" className="underline font-medium">upgrade</a> to generate it.
          </span>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 py-4 space-y-3"
        data-testid="chat-message-list"
      >
        <MessageBubble message={{ role: "assistant", content: GREETING }} />
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
      </div>

      {suggestionField && !readyMessage && (
        <QuickReplies nextField={suggestionField} brandCtas={brandCtas} onPick={sendMessage} />
      )}

      {readyMessage && (
        <div className="border-t bg-primary/5 px-5 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            I have everything I need. Review the details before generating.
          </p>
          <Button
            onClick={() => onReady(readyMessage.extracted!)}
            className="gap-2 flex-shrink-0"
            data-testid="button-chat-review-create"
          >
            <Wand2 className="w-4 h-4" />
            Review & Create
          </Button>
        </div>
      )}

      <div className="border-t px-3 py-3">
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={isSending ? "Sending…" : "Type your reply. Shift+Enter for a new line."}
            disabled={isSending}
            aria-invalid={isInputInvalid}
            className="min-h-[44px] max-h-[112px] overflow-y-auto resize-none py-2.5"
            rows={1}
            data-testid="chat-input"
          />
          <Button
            onClick={handleSend}
            disabled={isSending || isInputInvalid || !input.trim()}
            size="icon"
            className="h-11 w-11 flex-shrink-0"
            data-testid="button-chat-send"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        {isInputInvalid && (
          <p className="text-sm text-destructive mt-2" data-testid="error-chat-message">
            Message cannot be empty or contain only spaces.
          </p>
        )}
        <div className="flex items-center justify-end mt-2">
          <button
            type="button"
            onClick={onSwitchToManual}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            data-testid="button-switch-to-manual"
          >
            Prefer the classic form? Switch to manual setup
          </button>
        </div>
      </div>
    </Card>
  );
}
