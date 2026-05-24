import { buildPrompt, clampSummary } from "./prompt.js";
import { generateWithGemini } from "./gemini.js";
import { generateWithGrok } from "./grok.js";

export type AiProvider = "gemini" | "grok";

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  gemini: "Gemini",
  grok: "Grok",
};

export async function summarizeArticle(
  provider: AiProvider,
  title: string,
  content: string,
): Promise<string> {
  const prompt = buildPrompt(title, content);

  const text =
    provider === "grok"
      ? await generateWithGrok(prompt)
      : await generateWithGemini(prompt);

  if (text.length === 0) {
    throw new Error(`${PROVIDER_LABELS[provider]}: empty response`);
  }

  return clampSummary(text);
}
