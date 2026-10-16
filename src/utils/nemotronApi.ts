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

async function callNemotron(messages: { role: string; content: string }[]): Promise<string> {
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
        max_tokens: 1500,
        stream: false
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`Nemotron API error ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error(
        "Nemotron returned no answer text (reasoning budget may be exhausted)"
      );
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
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

/** Lightweight connectivity probe used on ChatBot mount. */
export async function testNemotronConnection(): Promise<boolean> {
  try {
    await callNemotron([
      { role: "system", content: "Reply with exactly: ok" },
      { role: "user", content: "ping" }
    ]);
    return true;
  } catch (error) {
    console.warn("Nemotron connection test failed:", error);
    return false;
  }
}
