/**
 * Production server proxy for NVIDIA Nemotron: /api/nemotron/* ->
 * https://integrate.api.nvidia.com/*
 *
 * WHY: NVIDIA's endpoint sends no CORS headers, so the browser cannot call it
 * cross-origin in production. In dev the Vite proxy handles it; in prod this
 * same-origin function does. The browser talks to OUR origin (no CORS), and
 * this server forwards to NVIDIA (server-to-server has no CORS).
 *
 * Auth: prefers a server-side NVIDIA_API_KEY (set in Vercel env). If absent,
 * it passes through the Authorization header the client already sends, so it
 * keeps working with the existing VITE_NVIDIA_API_KEY setup.
 */
import { withCors, readJsonBody, sendUpstream } from "../_http";

const NVIDIA_HOST = "https://integrate.api.nvidia.com";

interface MinimalRequest {
  method?: string;
  body?: any;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
}
interface MinimalResponse {
  status(code: number): MinimalResponse;
  json(body: unknown): void;
  send?(body: unknown): void;
  setHeader?(key: string, value: string): void;
}

export default async function handler(req: MinimalRequest, res: MinimalResponse) {
  try {
    withCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).json({});
      return;
    }

    // Rebuild the target path from the catch-all segments (e.g. v1/chat/completions).
    const seg = req.query?.path;
    const segments = Array.isArray(seg) ? seg : typeof seg === "string" ? [seg] : [];
    const target = `${NVIDIA_HOST}/${segments.join("/")}`;

    // Server-side key wins; otherwise pass through what the client sent.
    const passthrough = req.headers?.authorization;
    const authHeader =
      process.env.NVIDIA_API_KEY != null && process.env.NVIDIA_API_KEY !== ""
        ? `Bearer ${process.env.NVIDIA_API_KEY}`
        : typeof passthrough === "string"
        ? passthrough
        : "";

    if (!authHeader) {
      res.status(401).json({ error: { message: "Missing NVIDIA API key (set NVIDIA_API_KEY on the server)." } });
      return;
    }

    if (typeof fetch !== "function") {
      res.status(500).json({ error: { message: "Server runtime has no global fetch. Use Node 18+ (see vercel.json)." } });
      return;
    }

    const isGet = req.method === "GET" || req.method === "HEAD";
    const body = isGet ? undefined : JSON.stringify(readJsonBody(req.body));

    const upstream = await fetch(target, {
      method: req.method || "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
    });

    const text = await upstream.text();
    sendUpstream(res, upstream.status, text, upstream.headers.get("content-type"));
  } catch (err: any) {
    console.error("[nemotron-proxy] unhandled error:", err);
    try {
      res.status(502).json({ error: { message: `Nemotron proxy error: ${err?.message || "unknown"}` } });
    } catch {
      /* response already sent */
    }
  }
}
