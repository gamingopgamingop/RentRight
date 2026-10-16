import { buildRagPrompt, normalizeHistory, type ChatTurn } from "./siteKnowledge";
import {
  classifyError,
  classifyHttp,
  withBoundedRetry,
  ProviderError,
  type ProviderTestResult,
} from "./providerErrors";

/**
 * NVIDIA Nemotron chat client (OpenAI-compatible NIM Endpoint API).
 *
 * The browser NEVER calls NVIDIA directly (it sends no CORS headers) and NEVER
 * holds the API key. Every request goes to our same-origin server proxy at
 * /api/nemotron/v1/chat/completions — a Vite dev middleware in development and
 * a Vercel serverless function in production — which injects the server-side
 * NVIDIA_API_KEY and forwards upstream. Only the (non-secret) model id is
 * configurable from the client.
 */

const NEMOTRON_MODEL =
  (import.meta.env.VITE_NEMOTRON_MODEL as string | undefined) ||
  "nvidia/nemotron-3-super-120b-a12b";
const REQUEST_TIMEOUT_MS = 60_000;

const NEMOTRON_BASE_URL =
  (import.meta.env.VITE_NEMOTRON_BASE_URL as string | undefined) || "/api/nemotron/v1";

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

interface RawResult {
  ok: boolean;
  status: number;
  data: ChatCompletion | null;
  errorText: string;
}

/** Low-level request so callers decide what counts as success. */
async function requestNemotron(
  messages: { role: string; content: string }[],
  maxTokens = 1500
): Promise<RawResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${NEMOTRON_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: NEMOTRON_MODEL,
        messages,
        temperature: 0.6,
        top_p: 0.95,
        // Nemotron-3 is a reasoning model: hidden reasoning tokens are drawn
        // from this budget too, so it must be generous or content comes back empty.
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });

    const errorText = await res.text();
    let data: ChatCompletion | null = null;
    try {
      data = errorText ? JSON.parse(errorText) : null;
    } catch {
      /* non-JSON body */
    }
    return { ok: res.ok, status: res.status, data, errorText };
  } catch (err) {
    // Transport-level failure (network / CORS / abort) — no HTTP status seen.
    throw new ProviderError(classifyError(err, { provider: "Nemotron" }));
  } finally {
    clearTimeout(timer);
  }
}

async function callNemotron(messages: { role: string; content: string }[]): Promise<string> {
  const r = await requestNemotron(messages, 1500);
  if (!r.ok) {
    throw new ProviderError(classifyHttp(r.status, r.errorText, "Nemotron"));
  }
  const content = r.data?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new ProviderError({
      kind: "server",
      retryable: true,
      message: "Nemotron returned no answer text (reasoning budget may be exhausted).",
    });
  }
  return content;
}

/**
 * Generate a RentRight-grounded answer with Nemotron via the server proxy.
 * Transient failures (rate limit / 5xx / network / timeout) get bounded
 * exponential backoff with jitter; quota/auth/invalid errors are not retried.
 */
export async function generateNemotronResponse(
  userInput: string,
  history: ChatTurn[] = []
): Promise<string> {
  const messages = [
    { role: "system", content: buildRagPrompt(userInput) },
    ...normalizeHistory(history),
    { role: "user", content: userInput },
  ];
  return withBoundedRetry(() => callNemotron(messages), {
    provider: "Nemotron",
    maxAttempts: 3,
  });
}

/**
 * Connection probe — tests Nemotron THROUGH the deployed backend proxy (never
 * directly from the browser). Distinguishes "proxy reachable" from "model
 * answered", and surfaces a safe, secret-free diagnostic.
 */
export async function testNemotronConnection(): Promise<ProviderTestResult> {
  const base = { provider: "Nemotron" as const };
  try {
    const r = await requestNemotron(
      [
        { role: "system", content: "Reply with exactly: ok" },
        { role: "user", content: "ping" },
      ],
      300
    );
    if (r.ok) {
      const content = r.data?.choices?.[0]?.message?.content?.trim();
      return {
        ...base,
        reachable: true,
        modelResponded: !!content,
        status: content ? "online" : "degraded",
        kind: "ok",
        message: content
          ? "Proxy reachable; model responded."
          : "Proxy reachable (reasoning model returned no short answer — normal for a tiny probe).",
      };
    }
    const c = classifyHttp(r.status, r.errorText, "Nemotron");
    return {
      ...base,
      reachable: true, // the proxy itself answered
      modelResponded: false,
      status: c.kind === "not_configured" || c.kind === "auth" ? "offline" : "degraded",
      kind: c.kind,
      message: c.message,
      retryAfterMs: c.retryAfterMs,
    };
  } catch (err) {
    const c = err instanceof ProviderError ? err.classification : classifyError(err, { provider: "Nemotron" });
    return {
      ...base,
      reachable: c.kind !== "network",
      modelResponded: false,
      status: "offline",
      kind: c.kind,
      message: c.message,
      retryAfterMs: c.retryAfterMs,
    };
  }
}
