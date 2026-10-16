import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildRagPrompt, normalizeHistory, type ChatTurn } from './siteKnowledge';
import {
  classifyError,
  withBoundedRetry,
  formatDuration,
  ProviderError,
  type ClassifiedError,
  type ProviderTestResult,
} from './providerErrors';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const genAI = new GoogleGenerativeAI(API_KEY || "AIzaSyDummyKey");
// Model id is configurable; gemini-1.5-flash has been retired by Google
// (404 NOT_FOUND), so we default to the current stable flash model.
const GEMINI_MODEL =
  (import.meta.env.VITE_GEMINI_MODEL as string | undefined) || "gemini-2.5-flash";

/**
 * Quota cooldown: when Gemini reports a hard quota exhaustion we stop sending
 * requests until the provider's own retry window elapses, so we never hammer a
 * known-exhausted endpoint. The wait is taken from the provider's retryDelay
 * (never a hardcoded request count), clamped to a sane ceiling.
 */
const COOLDOWN_CAP_MS = 6 * 3600_000; // never pause longer than 6h
let geminiBlockUntil = 0;
let geminiLastClass: ClassifiedError | null = null;

export function getGeminiBlockUntil(): number {
  return geminiBlockUntil;
}
function geminiBlocked(): boolean {
  return Date.now() < geminiBlockUntil;
}
function engageCooldown(c: ClassifiedError): void {
  const wait = Math.min(c.retryAfterMs ?? 3600_000, COOLDOWN_CAP_MS);
  geminiBlockUntil = Date.now() + wait;
  geminiLastClass = { ...c, message: `Gemini quota exhausted — paused for ~${formatDuration(wait)}.` };
}

// Fallback response engine for RentRight if API key is rate-limited or offline
// Exported so the offline rule engine can back-stop any provider failure
export const getOfflineRentRightResponse = (input: string): string => {
  const query = input.toLowerCase();

  if (query.includes("afford") || query.includes("budget") || query.includes("30%")) {
    return "💡 According to RentRight's 30% Rule: You should spend a maximum of 30% of your in-hand monthly salary or student stipend on rent. For example, on a ₹30,000 income, your ideal ceiling is ₹9,000/month. You can test your exact numbers on our /affordability page!";
  }

  if (query.includes("compare") || query.includes("comparison") || query.includes("shortlist")) {
    return "⚖️ RentRight's Comparison Matrix lets you select up to 4 accommodations side-by-side! You can compare monthly rent, refundable deposit, included meals, sub-meter tariffs, and house rules on the /compare page.";
  }

  if (query.includes("deposit") || query.includes("security")) {
    return "🛡️ On RentRight, security deposits are clearly specified upfront (typically 1-2 months rent for PGs and 2-3 months for flats). We recommend checking our Inspection Checklist before paying advance tokens to document existing room conditions.";
  }

  if (query.includes("roommate") || query.includes("flatmate")) {
    return "🤝 Looking for a compatible flatmate? Check out our Roommate Compatibility Matcher at /roommate-matcher! It scores sleep schedules, cleanliness habits, dietary preferences, and social vibes.";
  }

  if (query.includes("inspect") || query.includes("checklist") || query.includes("visit")) {
    return "📋 Use our 15-point Property Inspection Checklist at /inspection-checklist during physical visits. Check water pump pressure, mobile signal strength, and sub-meter unit rates before signing!";
  }

  if (query.includes("owner") || query.includes("list") || query.includes("landlord")) {
    return "🏢 Property owners and PG operators can manage listings, renew expiring properties, and respond to tenant inquiries securely via the Owner Portal at /owner/enquiries.";
  }

  return "Hello! I am your RentRight Assistant. I can help you find student PGs, calculate your 30% affordability limit, guide you through our side-by-side comparison matrix, or explain our non-discrimination fair housing standards. What would you like to explore?";
};

/**
 * Gemini requires history to alternate user/model and to start with a
 * user turn — normalizeHistory guarantees that for us.
 */
function toGeminiHistory(history: ChatTurn[]) {
  return normalizeHistory(history).map((turn) => ({
    role: turn.role === "user" ? ("user" as const) : ("model" as const),
    parts: [{ text: turn.content }]
  }));
}

/** A single Gemini attempt; throws a classified ProviderError on failure. */
async function callGeminiOnce(userInput: string, history: ChatTurn[]): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const prompt = buildRagPrompt(userInput);
    const chat = model.startChat({ history: toGeminiHistory(history) });
    const result = await chat.sendMessage(prompt);
    const text = result.response.text();
    if (!text || !text.trim()) {
      throw new ProviderError({ kind: "server", retryable: true, message: "Gemini returned an empty response." });
    }
    return text;
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError(classifyError(err, { provider: "Gemini" }));
  }
}

/**
 * Generate a RentRight-grounded answer with Gemini.
 * - Skips the network entirely while a quota cooldown is active.
 * - Bounded exponential backoff + jitter for transient errors only.
 * - Quota/auth/invalid errors are not retried; quota engages a cooldown.
 */
export async function generateGeminiResponse(
  userInput: string,
  history: ChatTurn[] = []
): Promise<string> {
  if (!API_KEY) {
    throw new ProviderError({ kind: "not_configured", retryable: false, message: "Gemini is not configured (missing API key)." });
  }
  if (geminiBlocked()) {
    throw new ProviderError(
      geminiLastClass ?? { kind: "quota_exhausted", retryable: false, message: "Gemini is paused due to quota." }
    );
  }

  try {
    const text = await withBoundedRetry(() => callGeminiOnce(userInput, history), {
      provider: "Gemini",
      maxAttempts: 3,
    });
    geminiLastClass = null;
    return text;
  } catch (err) {
    const c = err instanceof ProviderError ? err.classification : classifyError(err, { provider: "Gemini" });
    if (c.kind === "quota_exhausted") engageCooldown(c);
    throw new ProviderError(c);
  }
}

/** Independent connection probe with a structured, secret-free result. */
export async function testGeminiConnection(): Promise<ProviderTestResult> {
  const base = { provider: "Gemini" as const };
  if (!API_KEY) {
    return { ...base, reachable: false, modelResponded: false, status: "offline", kind: "not_configured", message: "Gemini is not configured (missing API key)." };
  }
  if (geminiBlocked()) {
    return {
      ...base,
      reachable: true,
      modelResponded: false,
      status: "offline",
      kind: "quota_exhausted",
      message: geminiLastClass?.message ?? "Gemini quota exhausted (paused).",
      retryAfterMs: geminiBlockUntil - Date.now(),
    };
  }
  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent("ping");
    const text = result.response.text?.() ?? "";
    return {
      ...base,
      reachable: true,
      modelResponded: !!text.trim(),
      status: "online",
      kind: "ok",
      message: text.trim() ? "Gemini reachable and responding." : "Gemini reachable.",
    };
  } catch (err) {
    const c = classifyError(err, { provider: "Gemini" });
    if (c.kind === "quota_exhausted") engageCooldown(c);
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
