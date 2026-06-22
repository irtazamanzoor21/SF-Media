import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { createElement, Fragment } from "react"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// True when the user has typed something but it is only whitespace. Used to
// show inline "cannot be empty or contain only spaces" errors and to keep a
// submit button disabled. An untouched (length 0) field returns false so we
// don't show an error before the user types anything.
export function isBlank(value: string | undefined | null): boolean {
  return !!value && value.trim().length === 0;
}

export function blankFieldMessage(label = "This field"): string {
  return `${label} cannot be empty or contain only spaces.`;
}

const STATUS_CODE_PREFIX = /^\s*(\d{3})\s*:\s*/;

const STATUS_FALLBACK: Record<number, string> = {
  400: "The request couldn't be processed. Please check your input and try again.",
  401: "You need to sign in to continue.",
  403: "You don't have permission to do that.",
  404: "We couldn't find what you were looking for.",
  408: "The request took too long. Please try again.",
  409: "That action conflicts with something that already exists.",
  413: "The file or data is too large.",
  422: "Some of the information provided isn't valid.",
  429: "You're doing that too often. Please wait a moment and try again.",
  500: "Something went wrong on our end. Please try again shortly.",
  502: "We're having trouble reaching the service. Please try again.",
  503: "The service is temporarily unavailable. Please try again.",
  504: "The service took too long to respond. Please try again.",
};

// Returns a clean, user-facing message from any error-like value, stripping
// "<status>: " prefixes left over by older code paths and unwrapping JSON payloads.
export function formatErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!raw) return fallback;

  let message = raw;
  let status: number | undefined;

  const match = message.match(STATUS_CODE_PREFIX);
  if (match) {
    status = Number(match[1]);
    message = message.slice(match[0].length);
  }

  const trimmed = message.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      const fromJson =
        (typeof parsed?.message === "string" && parsed.message) ||
        (typeof parsed?.error === "string" && parsed.error) ||
        (typeof parsed?.detail === "string" && parsed.detail);
      if (fromJson) message = fromJson;
    } catch {
      // leave as-is
    }
  }

  message = message.trim();
  if (!message && status && STATUS_FALLBACK[status]) return STATUS_FALLBACK[status];
  if (!message) return fallback;
  return message;
}

const HASHTAG_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#10b981",
  "#06b6d4",
  "#f43f5e",
  "#a855f7",
  "#14b8a6",
  "#6366f1",
];

export function renderHashtags(text: string, hashtagClassName?: string) {
  const parts = text.split(/(#\S+)/g);
  if (parts.length === 1) return text;
  let colorIdx = 0;
  return createElement(
    Fragment,
    null,
    ...parts.map((part, i) => {
      if (/^#\S+/.test(part)) {
        const color = HASHTAG_COLORS[colorIdx % HASHTAG_COLORS.length];
        colorIdx++;
        return createElement(
          "span",
          {
            key: i,
            className: hashtagClassName || "font-medium",
            style: hashtagClassName ? undefined : { color },
          },
          part
        );
      }
      return part;
    })
  );
}
