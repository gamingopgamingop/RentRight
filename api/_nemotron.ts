/**
 * Shared SERVER-SIDE logic for the NVIDIA Nemotron chat proxy.
 *
 * Used by BOTH:
 *   - the Vercel function  api/nemotron/[...path].ts  (production)
 *   - the Vite dev middleware in vite.config.ts       (development)
 *
 * The NVIDIA API key is read ONLY from the server environment (NVIDIA_API_KEY)
 * here; it is never sent to or stored in the browser. The SPA calls our own
 * same-origin "/api/nemotron/v1/chat/completions"; this module validates the
 * request and forwards it to NVIDIA. This is a purpose-built relay for the
 * chat-completions endpoint, not a general open proxy.
 */

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export const MAX_BODY_BYTES = 64 * 1024; // 64 KB is plenty for chat payloads
const MAX_MESSAGES = 40;
const MAX_CONTENT = 8000;
const UPSTREAM_TIMEOUT_MS = 45_000; // < function maxDuration (60s)

export interface ForwardResult {
  status: number;
  json: unknown;
}

/** Strip anything key-like before surfacing an upstream error to the client. */
function sanitize(text: string): string {
  return String(text || "")
    .replace(/(nvapi-|AIza|sk-)[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  if (!isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

type Validation =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; message: string };

/** Whitelist-style validation of the chat-completion request body. */
export function validateNemotronBody(body: unknown): Validation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }
  const b = body as {
    model?: unknown;
    stream?: unknown;
    messages?: unknown;
    temperature?: unknown;
    top_p?: unknown;
    max_tokens?: unknown;
  };

  if (typeof b.model !== "string" || !b.model.trim()) {
    return { ok: false, message: '"model" is required.' };
  }
  if (b.stream) {
    return { ok: false, message: "Streaming is not supported by this proxy." };
  }
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > MAX_MESSAGES) {
    return { ok: false, message: `"messages" must be a non-empty array (max ${MAX_MESSAGES}).` };
  }
  const msgs = b.messages as { role?: unknown; content?: unknown }[];
  for (const m of msgs) {
    if (!m || typeof m !== "object" || typeof m.role !== "string" || typeof m.content !== "string") {
      return { ok: false, message: 'Each message needs string "role" and "content".' };
    }
    if (m.role.length > 32) return { ok: false, message: "Invalid message role." };
    if (m.content.length > MAX_CONTENT) return { ok: false, message: "Message content is too long." };
  }

  return {
    ok: true,
    payload: {
      model: b.model.trim(),
      messages: msgs.map((m) => ({ role: m.role as string, content: m.content as string })),
      temperature: typeof b.temperature === "number" ? Math.max(0, Math.min(2, b.temperature)) : 0.6,
      top_p: typeof b.top_p === "number" ? Math.max(0, Math.min(1, b.top_p)) : 0.95,
      max_tokens: clampInt(b.max_tokens, 1, 4000, 1500),
      stream: false,
    },
  };
}

/** Validate + forward a chat completion to NVIDIA using the server-side key. */
export async function forwardNemotronChat(
  body: unknown,
  apiKey: string | undefined
): Promise<ForwardResult> {
  const v = validateNemotronBody(body);
  if (!v.ok) {
    return { status: 400, json: { error: { message: v.message } } };
  }
  if (!apiKey) {
    return {
      status: 501,
      json: { error: { message: "Nemotron is not configured on the server (NVIDIA_API_KEY is missing)." } },
    };
  }
  if (typeof fetch !== "function") {
    return { status: 500, json: { error: { message: "Server runtime has no global fetch (Node 18+ required)." } } };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(v.payload),
      signal: controller.signal,
    });

    const text = await res.text();
    let parsed: { error?: { message?: unknown }; detail?: unknown; message?: unknown } | null = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON upstream body */
    }

    if (res.ok) {
      return { status: 200, json: parsed ?? {} };
    }

    // Relay a sanitized error, preserving the status so the client can
    // classify quota vs rate-limit vs auth. Never leak the key.
    const upstreamMsg =
      (typeof parsed?.error?.message === "string" && parsed.error.message) ||
      (typeof parsed?.detail === "string" && parsed.detail) ||
      (typeof parsed?.message === "string" && parsed.message) ||
      text ||
      `Upstream error (HTTP ${res.status})`;
    return {
      status: res.status,
      json: { error: { message: sanitize(upstreamMsg), status: res.status } },
    };
  } catch (e) {
    const err = e as { name?: string; message?: string };
    const aborted = err?.name === "AbortError";
    return {
      status: aborted ? 504 : 502,
      json: {
        error: {
          message: aborted
            ? "Upstream request to NVIDIA timed out."
            : `Could not reach NVIDIA: ${sanitize(err?.message || "network error")}`,
        },
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
