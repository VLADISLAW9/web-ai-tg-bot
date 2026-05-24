const SEARCH_ENDPOINT = "https://s.jina.ai/";
const TIMEOUT_MS = 15_000;

export interface SearchResult {
  title: string;
  url: string;
  description?: string;
}

export async function searchArticles(query: string, limit = 5) {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    throw new Error("Jina Search: JINA_API_KEY is not set");
  }

  let response: Response;
  try {
    response = await fetch(
      `${SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          "X-Respond-With": "no-content",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Jina Search: network error (${reason})`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Jina Search: ${response.status} ${response.statusText} ${body.slice(0, 200)}`,
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Jina Search: invalid JSON (${reason})`);
  }

  return extractResults(json).slice(0, limit);
}

function extractResults(json: unknown) {
  if (typeof json !== "object" || json === null) return [];
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];

  const out: SearchResult[] = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;
    const { url, title, description } = item as {
      url?: unknown;
      title?: unknown;
      description?: unknown;
    };
    if (typeof url !== "string" || typeof title !== "string") continue;
    out.push({
      url,
      title,
      ...(typeof description === "string" ? { description } : {}),
    });
  }
  return out;
}
