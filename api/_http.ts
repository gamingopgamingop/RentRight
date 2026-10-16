/**
 * Shared serverless HTTP helpers (CORS + body/response plumbing) used by the
 * /api/* functions. Files prefixed with "_" are NOT routed by Vercel, so this
 * stays a private module.
 */

export interface MinimalResponse {
  status(code: number): MinimalResponse;
  json(body: unknown): void;
  send?(body: unknown): void;
  setHeader?(key: string, value: string): void;
}

/**
 * Add permissive CORS + preflight support. Same-origin calls don't need this,
 * but it lets the functions work if the frontend is ever served from a
 * different origin (e.g. a Lovable preview domain).
 */
export function withCors(res: MinimalResponse) {
  res.setHeader?.("Access-Control-Allow-Origin", "*");
  res.setHeader?.("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader?.(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept, Idempotency-Key"
  );
}

/** Normalize a (possibly parsed) request body to a JSON-serializable value. */
export function readJsonBody(body: unknown): unknown {
  return body ?? {};
}

/** Relay an upstream text response, preserving status and content type. */
export function sendUpstream(
  res: MinimalResponse,
  status: number,
  text: string,
  contentType?: string | null
) {
  res.status(status);
  res.setHeader?.("Content-Type", contentType || "application/json");
  if (typeof res.send === "function") {
    res.send(text);
  } else {
    // Fallback for runtimes without res.send() — emit the raw text.
    res.json(text);
  }
}
