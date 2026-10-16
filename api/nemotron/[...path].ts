/**
 * Production serverless proxy for NVIDIA Nemotron.
 * Route: POST /api/nemotron/v1/chat/completions  (catch-all [...path])
 *
 * The browser calls this SAME-ORIGIN endpoint (no CORS), and this function
 * forwards to NVIDIA with a server-side key. Guards:
 *   - POST only (OPTIONS handled for completeness); other methods -> 405
 *   - only the chat/completions path is served -> anything else 404
 *   - cross-origin requests are rejected (prevents public API relay)
 *   - request body size capped
 *   - key read only from process.env.NVIDIA_API_KEY (never from the client)
 * No wildcard CORS is emitted on purpose: the app is same-origin.
 */
import { forwardNemotronChat, MAX_BODY_BYTES } from "../_nemotron";

interface MinimalRequest {
  method?: string;
  body?: any;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
}
interface MinimalResponse {
  status(code: number): MinimalResponse;
  json(body: unknown): void;
  setHeader?(key: string, value: string): void;
}

function firstHeader(
  headers: MinimalRequest["headers"],
  key: string
): string | undefined {
  const v = headers?.[key];
  return Array.isArray(v) ? v[0] : typeof v === "string" ? v : undefined;
}

export default async function handler(req: MinimalRequest, res: MinimalResponse) {
  try {
    if (req.method === "OPTIONS") {
      res.status(204).json({});
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: { message: "Only POST is supported." } });
      return;
    }

    // Same-origin guard: if an Origin header is present it must match Host.
    const origin = firstHeader(req.headers, "origin");
    const host = firstHeader(req.headers, "host");
    if (origin && host) {
      try {
        if (new URL(origin).host !== host) {
          res.status(403).json({ error: { message: "Cross-origin requests are not allowed." } });
          return;
        }
      } catch {
        res.status(400).json({ error: { message: "Invalid Origin header." } });
        return;
      }
    }

    // Path allowlist: only v1/chat/completions is served by this relay.
    const seg = req.query?.path;
    const segments = Array.isArray(seg) ? seg : typeof seg === "string" ? [seg] : [];
    if (segments.join("/") !== "v1/chat/completions") {
      res.status(404).json({ error: { message: "Unsupported endpoint." } });
      return;
    }

    // Body size cap (defence in depth; Vercel also caps overall payload).
    const len = Number(firstHeader(req.headers, "content-length") || 0);
    if (len > MAX_BODY_BYTES) {
      res.status(413).json({ error: { message: "Request body too large." } });
      return;
    }

    const { status, json } = await forwardNemotronChat(req.body ?? {}, process.env.NVIDIA_API_KEY);
    res.status(status).json(json);
  } catch (err: any) {
    // Never log prompts/keys; a generic tag is enough for ops.
    console.error("[nemotron-proxy] unhandled error:", err?.name || err?.message || "unknown");
    try {
      res.status(500).json({ error: { message: "Internal proxy error." } });
    } catch {
      /* response already sent */
    }
  }
}
