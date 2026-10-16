import { buildRagPrompt, normalizeHistory, type ChatTurn } from "./siteKnowledge";

/**
 * NVIDIA Nemotron chat client (OpenAI-compatible NIM Endpoint API).
 * Docs: https://docs.nvidia.com/nim/large-language-models/latest/index.html
 * Uses VITE_NVIDIA_API_KEY from .env and a configurable model id.
 */

const NEMOTRON_MODEL =
  (import.meta.env.VITE_NEMOTRON_MODEL as string | undefined) ||
  "nvidia/nemotron-3-super-120b-a12b";
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * NVIDIA sends no CORS headers, so browser calls must go through a proxy:
 * - dev: Vite dev-server proxy (/nemotron-api -> integrate.api.nvidia.com)
 * - prod: same-origin serverless proxy (/api/nemotron -> integrate.api.nvidia.com)
 * Using a same-origin path in prod means the browser never makes a cross-origin
 * request, so there is no CORS failure. Override with VITE_NEMOTRON_BASE_URL if
 * you host the proxy on a different domain.
 */
const NVIDIA_BASE_URL = import.meta.env.DEV
  ? "/nemotron-api/v1"
  : ((import.meta.env.VITE_NEMOTRON_BASE_URL as string | undefined) ||
      "/api/nemotron/v1");

function getNvidiaKey(): string | undefined {
  return import.meta.env.VITE_NVIDIA_API_KEY as string | undefined;
}

export function isNemotronConfigured(): boolean {
  return !!getNvidiaKey();
}

type NemotronRaw = {
  ok: boolean;
  status: number;
  data: any;
  errorText: string;
};

/** Low-level request so callers can decide what counts as success. */
async function requestNemotron(
  messages: { role: string; content: string }[],
  maxTokens = 1500
): Promise<NemotronRaw> {
  const key = getNvidiaKey();
  if (!key) {
    throw new Error("VITE_NVIDIA_API_KEY is not set");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        model: NEMOTRON_MODEL,
        messages,
        temperature: 0.6,
        top_p: 0.95,
        // Nemotron-3 is a reasoning model: hidden reasoning tokens are drawn
        // from this budget too, so it must be generous or content comes back empty.
        max_tokens: maxTokens,
        stream: false
      }),
      signal: controller.signal
    });

    const errorText = await res.text();
    let data: any = null;
    try {
      data = errorText ? JSON.parse(errorText) : null;
    } catch {
      /* non-JSON body; keep data null */
    }
    return { ok: res.ok, status: res.status, data, errorText };
  } finally {
    clearTimeout(timer);
  }
}

async function callNemotron(messages: { role: string; content: string }[]): Promise<string> {
  const r = await requestNemotron(messages, 1500);
  if (!r.ok) {
    throw new Error(`Nemotron API error ${r.status}: ${r.errorText}`);
  }
  const content = r.data?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(
      "Nemotron returned no answer text (reasoning budget may be exhausted)"
    );
  }
  return content;
}

/**
 * Generate a RentRight-grounded answer with Nemotron.
 * `history` (prior turns) is included so the model can handle follow-ups.
 */
export async function generateNemotronResponse(
  userInput: string,
  history: ChatTurn[] = []
): Promise<string> {
  const messages = [
    { role: "system", content: buildRagPrompt(userInput) },
    ...normalizeHistory(history), // alternate turns, newest window
    { role: "user", content: userInput }
  ];
  return callNemotron(messages);
}

/**
 * Lightweight connectivity probe used on ChatBot mount.
 * Treats an HTTP 2xx as "connected" even if this tiny ping returns only
 * reasoning tokens with empty `content` — the reasoning model often does that
 * for trivial prompts, but the API is clearly reachable (real questions use a
 * larger token budget and do return content). This avoids a false "down" that
 * would wrongly trigger the offline banner.
 */
export async function testNemotronConnection(): Promise<boolean> {
  try {
    const r = await requestNemotron(
      [
        { role: "system", content: "Reply with exactly: ok" },
        { role: "user", content: "ping" }
      ],
      300
    );
    return r.ok;
  } catch (error) {
    console.warn("Nemotron connection test failed:", error);
    return false;
  }
}
