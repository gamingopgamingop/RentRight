/**
 * Production server endpoint: POST /api/outpero-call
 *
 * The browser calls THIS endpoint (same origin). This server reads the secret
 * from process.env.OUTPERO_API_KEY and forwards to Outpero. The key never
 * appears in the client bundle. Deployed automatically by Vercel (any file in
 * /api becomes a function); the handler is written against minimal, portable
 * request/response shapes so it also works on Netlify/Express with small edits.
 */
import { forwardOutperoCall } from "./_outpero";

interface MinimalRequest {
  method?: string;
  body?: any;
  headers?: Record<string, string | string[] | undefined>;
}

interface MinimalResponse {
  status(code: number): MinimalResponse;
  json(body: unknown): void;
  setHeader?(key: string, value: string): void;
}

export default async function handler(req: MinimalRequest, res: MinimalResponse) {
  // Wrap EVERYTHING so the function never crashes with Vercel's opaque
  // FUNCTION_INVOCATION_FAILED — it always returns a readable JSON error.
  try {
    // CORS for local dev / preview. Lock to your origin in production.
    res.setHeader?.("Access-Control-Allow-Origin", "*");
    res.setHeader?.("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader?.("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key");

    if (req.method === "OPTIONS") {
      res.status(204).json({});
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ message: "Method not allowed" });
      return;
    }

    // Debug aid: shows up in Vercel Dashboard > Functions > Logs.
    const hasKey = !!process.env.OUTPERO_API_KEY;
    console.log(`[outpero-call] OUTPERO_API_KEY ${hasKey ? "present" : "MISSING"}`);

    if (!hasKey) {
      res.status(500).json({
        message:
          "OUTPERO_API_KEY is not set on the server. Add it in Vercel > Project > Settings > Environment Variables, then redeploy.",
      });
      return;
    }

    // Global fetch requires Node 18+. vercel.json pins nodejs20.x; this guards
    // against an older runtime being selected so we fail with a clear message.
    if (typeof fetch !== "function") {
      res.status(500).json({
        message:
          "Server runtime has no global fetch. Set the function Node.js version to 18+ (see vercel.json).",
      });
      return;
    }

    const idemHeader = req.headers?.["idempotency-key"];
    const idempotencyKey = typeof idemHeader === "string" ? idemHeader : undefined;

    const { status, json } = await forwardOutperoCall(
      req.body ?? {},
      process.env.OUTPERO_API_KEY,
      idempotencyKey
    );

    res.status(status).json(json);
  } catch (err: any) {
    console.error("[outpero-call] unhandled error:", err);
    try {
      res.status(500).json({ message: `Function error: ${err?.message || "unknown"}` });
    } catch {
      /* response already sent */
    }
  }
}
