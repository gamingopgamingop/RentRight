import { getOfflineRentRightResponse } from "./geminiApi";
import { generateNemotronResponse } from "./nemotronApi";
import { ProviderError } from "./providerErrors";
import type { ChatTurn } from "./siteKnowledge";

/**
 * Dual-model chat orchestrator: every question is answered by BOTH
 * Google Gemini and NVIDIA Nemotron, each grounded in RentRight's own
 * site data (see siteKnowledge.ts). Results are labelled so users can
 * see which model answered.
 */

export type ChatProvider = "Gemini" | "Nemotron" | "Offline";

export type ChatReply = {
  provider: ChatProvider;
  text: string;
};

/**
 * Chat bubbles render plain text, so trim the markdown decoration models
 * like to emit (**bold**, ### headings, - bullets, [link](url)).
 */
function toPlainText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1 ($2)")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function safeGenerate(
  provider: ChatProvider,
  fn: () => Promise<string>
): Promise<ChatReply | null> {
  try {
    const text = await fn();
    return { provider, text: toPlainText(text) };
  } catch (error) {
    // Log only a safe classification + message — never the user's prompt.
    const kind = error instanceof ProviderError ? error.classification.kind : "unknown";
    console.warn(`[chat] ${provider} unavailable (${kind}).`);
    return null;
  }
}

/**
 * TEMPORARY: Gemini is disabled — Nemotron only. Re-enable by restoring the
 * parallel Gemini call below.
 *
 * Nemotron owns its own retry policy (see nemotronApi), so we do NOT loop or
 * duplicate the user's request. Offline rule-engine answers are used only when
 * Nemotron fails.
 */
export async function generateDualChatReplies(
  userInput: string,
  history: ChatTurn[] = []
): Promise<ChatReply[]> {
  const nemotron = await safeGenerate("Nemotron", () =>
    generateNemotronResponse(userInput, history)
  );

  const replies = [nemotron].filter((r): r is ChatReply => r !== null);

  if (replies.length > 0) {
    return replies;
  }

  // Provider unavailable (bad key, CORS, offline) — rule-engine fallback
  return [{ provider: "Offline", text: getOfflineRentRightResponse(userInput) }];
}
