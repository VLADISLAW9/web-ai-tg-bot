// Генерация пересказа через Grok (xAI). API совместимо с форматом
// chat/completions от OpenAI, поэтому обходимся обычным fetch без SDK.

const ENDPOINT = "https://api.x.ai/v1/chat/completions";
const MODEL_NAME = "grok-4-fast-reasoning";
const TIMEOUT_MS = 60_000;

/** Генерация пересказа через Grok по готовому промпту. */
export async function generateWithGrok(prompt: string): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error("Grok: XAI_API_KEY is not set");
  }

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        temperature: 0.85,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Grok: network error (${reason})`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Grok: ${response.status} ${response.statusText} ${body.slice(0, 200)}`,
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Grok: invalid JSON (${reason})`);
  }

  return extractText(json);
}

function extractText(json: unknown): string {
  if (typeof json !== "object" || json === null) {
    throw new Error("Grok: invalid response (not an object)");
  }
  const choices = (json as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("Grok: no choices in response");
  }
  const message = (choices[0] as { message?: unknown }).message;
  const content =
    message && typeof message === "object"
      ? (message as { content?: unknown }).content
      : undefined;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("Grok: missing message content");
  }
  return content.trim();
}
