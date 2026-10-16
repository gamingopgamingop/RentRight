/**
 * Shared classification of AI-provider failures (Gemini / NVIDIA Nemotron).
 *
 * Goal: distinguish QUOTA exhaustion from transient rate limits, auth,
 * invalid requests, and network problems — so callers can decide whether to
 * retry, fall back, or back off, instead of treating every error the same.
 * Never includes secrets or raw upstream payloads in the user-facing message.
 */

export type ProviderName = "Gemini" | "Nemotron";

export type ProviderErrorKind =
  | "ok"
  | "quota_exhausted" // daily/hard quota hit — do NOT retry, wait for reset
  | "rate_limited" // transient throttling — bounded backoff OK
  | "auth" // bad/missing key or forbidden
  | "invalid_request" // malformed / rejected input
  | "not_configured" // server env key missing
  | "network" // transport failure / CORS / DNS
  | "timeout" // aborted / deadline
  | "server" // 5xx upstream
  | "unknown";

export interface ClassifiedError {
  kind: ProviderErrorKind;
  status?: number;
  retryAfterMs?: number;
  retryable: boolean;
  /** Safe, human-readable, secret-free. */
  message: string;
}

/** Structured result of a provider connection probe. */
export interface ProviderTestResult {
  provider: ProviderName;
  /** Transport reached the provider (via proxy for Nemotron). */
  reachable: boolean;
  /** A usable model answer came back (distinct from mere reachability). */
  modelResponded: boolean;
  status: "online" | "degraded" | "offline";
  kind: ProviderErrorKind;
  message: string;
  retryAfterMs?: number;
}

/** Error carrying a classification so callers don't have to re-parse. */
export class ProviderError extends Error {
  classification: ClassifiedError;
  constructor(c: ClassifiedError) {
    super(c.message);
    this.name = "ProviderError";
    this.classification = c;
  }
}

const QUOTA_HINTS = [
  "exceeded your current quota",
  "quota exceeded",
  "resource_exhausted",
  "check your plan and billing",
  "free_tier_requests",
  "per-day",
  "daily quota",
  "quota",
];
const RATE_HINTS = ["rate limit", "too many requests", "backoff", "resource has been exhausted (temporarily)"];
const NOT_CONFIGURED_HINTS = ["api key is not set", "not configured", "set nvidia_api_key", "missing nvidia api key", "no api key"];
const AUTH_HINTS = ["api key", "unauthorized", "forbidden", "invalid authentication", "permission denied", "invalid api key"];

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** "6h41m34.6s", "24094s", "30", 30000 → milliseconds. */
export function parseRetryDelayMs(input: unknown): number | undefined {
  if (typeof input === "number" && isFinite(input)) {
    // Heuristic: values < 100000 are treated as seconds, else ms.
    return Math.round(input < 100000 ? input * 1000 : input);
  }
  if (typeof input === "string") {
    const s = input.trim();
    // "24094s" / "500ms" / "30m" / "2h"
    const single = s.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)$/i);
    if (single) {
      const v = parseFloat(single[1]);
      const unit = single[2].toLowerCase();
      const mult = unit === "ms" ? 1 : unit === "s" ? 1000 : unit === "m" ? 60000 : 3600000;
      return Math.round(v * mult);
    }
    // "6h41m34.62400263s"
    const hms = s.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*([\d.]+)\s*s/i);
    if (hms) {
      const h = parseInt(hms[1] || "0", 10);
      const m = parseInt(hms[2] || "0", 10);
      const sec = parseFloat(hms[3] || "0");
      return Math.round((h * 3600 + m * 60 + sec) * 1000);
    }
    const num = Number(s);
    if (!isNaN(num)) return parseRetryDelayMs(num);
  }
  return undefined;
}

function extractStatus(text: string): number | undefined {
  const bracket = text.match(/\[(\d{3})[\s\]]/);
  if (bracket) return parseInt(bracket[1], 10);
  const statusOf = text.match(/status(?:es)?\s+of\s+(\d{3})/i);
  if (statusOf) return parseInt(statusOf[1], 10);
  const http = text.match(/HTTP\s+(\d{3})/i);
  if (http) return parseInt(http[1], 10);
  return undefined;
}

function extractRetryFromText(text: string): number | undefined {
  const retryInfo = text.match(/"retryDelay"\s*:\s*"([^"]+)"/i);
  if (retryInfo) return parseRetryDelayMs(retryInfo[1]);
  const retryIn = text.match(/retry in ([\dhms.\s]+)/i);
  if (retryIn) return parseRetryDelayMs(retryIn[1].trim());
  return undefined;
}

function safeMessage(input: string, fallback: string): string {
  const cleaned = (input || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  // Strip anything that looks like a bearer/api key before surfacing.
  const redacted = cleaned
    .replace(/(nvapi-|sk-|AIza)[A-Za-z0-9_-]+/g, "[redacted-key]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
  return redacted.length > 200 ? redacted.slice(0, 197) + "..." : redacted;
}

/**
 * Classify an unknown thrown error (SDK errors, fetch rejections, etc.).
 * `explicitStatus` lets callers pass an HTTP status they already know.
 */
export function classifyError(err: unknown, opts?: { explicitStatus?: number; provider?: ProviderName }): ClassifiedError {
  const provider = opts?.provider ?? "Gemini";
  const e = err as { message?: unknown; status?: unknown; code?: unknown; name?: unknown };
  const status =
    opts?.explicitStatus ??
    (typeof e?.status === "number" ? e.status : undefined) ??
    (typeof e?.code === "number" ? e.code : undefined);
  const rawMsg = String(typeof e?.message === "string" ? e.message : (err ?? ""));
  const lower = rawMsg.toLowerCase();
  const name = String(e?.name ?? "");

  // Transport / abort first (fetch rejects with TypeError "Failed to fetch").
  if (name === "AbortError" || /abort|timeout|deadline|timed?\s?out/i.test(lower)) {
    return { kind: "timeout", retryable: true, message: `${provider} timed out. Please try again.` };
  }
  if (/failed to fetch|networkerror|network request failed|econn|enotfound|fetch failed/i.test(lower)) {
    return { kind: "network", retryable: true, message: `Could not reach ${provider} (network or CORS).` };
  }

  const retryAfterMs = extractRetryFromText(rawMsg);
  const resolvedStatus = status ?? extractStatus(rawMsg);

  // Not-configured (our own server signals this) — never retryable.
  if (NOT_CONFIGURED_HINTS.some((h) => lower.includes(h))) {
    return { kind: "not_configured", status: resolvedStatus, retryable: false, message: `${provider} is not configured on the server.` };
  }

  // Quota exhaustion vs transient rate limit.
  const isQuota = QUOTA_HINTS.some((h) => lower.includes(h)) || /resource_exhausted/i.test(rawMsg);
  if (isQuota || resolvedStatus === 429) {
    const longWait = retryAfterMs != null && retryAfterMs > 60_000;
    if (isQuota || longWait) {
      return {
        kind: "quota_exhausted",
        status: resolvedStatus,
        retryAfterMs,
        retryable: false,
        message: `${provider} quota exhausted${retryAfterMs ? ` — retry in ~${formatDuration(retryAfterMs)}` : ""}.`,
      };
    }
    return {
      kind: "rate_limited",
      status: resolvedStatus,
      retryAfterMs,
      retryable: true,
      message: `${provider} is rate-limiting requests. Backing off briefly.`,
    };
  }

  if (resolvedStatus === 401 || resolvedStatus === 403 || AUTH_HINTS.some((h) => lower.includes(h))) {
    return { kind: "auth", status: resolvedStatus, retryable: false, message: `${provider} authentication failed.` };
  }
  if (resolvedStatus && resolvedStatus >= 500) {
    return { kind: "server", status: resolvedStatus, retryable: true, message: `${provider} is temporarily unavailable (server error).` };
  }
  if (resolvedStatus === 400 || resolvedStatus === 404 || /invalid|bad request|not found|unsupported/i.test(lower)) {
    return { kind: "invalid_request", status: resolvedStatus, retryable: false, message: safeMessage(rawMsg, `${provider} rejected the request.`) };
  }

  return { kind: "unknown", status: resolvedStatus, retryable: false, message: safeMessage(rawMsg, `${provider} request failed.`) };
}

/** Classify an HTTP response from the Nemotron proxy (status + body text). */
export function classifyHttp(status: number, bodyText: string, provider: ProviderName = "Nemotron"): ClassifiedError {
  if (status >= 200 && status < 300) {
    return { kind: "ok", status, retryable: false, message: "ok" };
  }
  return classifyError(new Error(safeMessage(bodyText, `HTTP ${status}`)), { explicitStatus: status, provider });
}

export function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Bounded exponential backoff with jitter. Retries ONLY when the classifier
 * marks the error retryable (transient rate limit / 5xx / network / timeout).
 * Quota, auth, invalid-request and not-configured errors are never retried.
 */
export async function withBoundedRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseMs?: number; maxMs?: number; provider?: ProviderName } = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseMs = opts.baseMs ?? 400;
  const maxMs = opts.maxMs ?? 4000;
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const c: ClassifiedError =
        err instanceof ProviderError ? err.classification : classifyError(err, { provider: opts.provider });
      const canRetry = c.retryable && attempt < maxAttempts - 1;
      if (!canRetry) {
        throw err instanceof ProviderError ? err : new ProviderError(c);
      }
      const backoff = Math.min(maxMs, baseMs * 2 ** attempt);
      const jitter = backoff * (0.5 + Math.random() * 0.5);
      await sleep(jitter);
      attempt++;
    }
  }
}
