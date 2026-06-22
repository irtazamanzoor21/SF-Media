import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { emitQuotaExceeded } from "./quota-events";

export class ApiError extends Error {
  status: number;
  statusText: string;
  body?: unknown;

  constructor(message: string, status: number, statusText: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

const DEFAULT_MESSAGES: Record<number, string> = {
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

function extractMessage(rawText: string, status: number): { message: string; body?: unknown } {
  const trimmed = rawText.trim();
  if (trimmed) {
    try {
      const json = JSON.parse(trimmed);
      const fromJson =
        (typeof json?.message === "string" && json.message) ||
        (typeof json?.error === "string" && json.error) ||
        (typeof json?.detail === "string" && json.detail);
      if (fromJson) {
        return { message: fromJson, body: json };
      }
      return { message: DEFAULT_MESSAGES[status] ?? "Something went wrong. Please try again.", body: json };
    } catch {
      // Not JSON. If it looks like a short, user-readable string, keep it. Otherwise fall back.
      if (trimmed.length <= 240 && !/<\/?[a-z][\s\S]*>/i.test(trimmed)) {
        return { message: trimmed };
      }
    }
  }
  return { message: DEFAULT_MESSAGES[status] ?? "Something went wrong. Please try again." };
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const rawText = (await res.text()) || res.statusText;

    if (res.status === 403) {
      try {
        const json = JSON.parse(rawText);
        if (json.quotaExceeded) {
          emitQuotaExceeded({
            action: json.action,
            limit: json.limit,
            current: json.current,
            label: json.label,
            tier: json.tier,
          });
          throw new ApiError(
            "You've reached your plan's limit for this action.",
            res.status,
            res.statusText,
            json,
          );
        }
      } catch (parseErr) {
        if (parseErr instanceof ApiError) {
          throw parseErr;
        }
      }
    }

    const { message, body } = extractMessage(rawText, res.status);
    throw new ApiError(message, res.status, res.statusText, body);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      "ngrok-skip-browser-warning": "true",
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: { "ngrok-skip-browser-warning": "true" },
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
