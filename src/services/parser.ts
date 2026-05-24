const READER_ENDPOINT = "https://r.jina.ai/";
const TIMEOUT_MS = 30_000;

export interface ParsedArticle {
  url: string;
  title: string;
  content: string;
  imageUrl: string | null;
}

export async function parseArticle(url: string) {
  const apiKey = process.env.JINA_API_KEY;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-With-Images-Summary": "true",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let response: Response;
  try {
    response = await fetch(`${READER_ENDPOINT}${url}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Jina Reader: network error (${reason})`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Jina Reader: ${response.status} ${response.statusText} ${body.slice(0, 200)}`,
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Jina Reader: invalid JSON (${reason})`);
  }

  return extractArticle(url, json);
}

function extractArticle(requestedUrl: string, json: unknown) {
  if (typeof json !== "object" || json === null) {
    throw new Error("Jina Reader: invalid response (not an object)");
  }
  const data = (json as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) {
    throw new Error("Jina Reader: invalid response (missing data)");
  }

  const { title, content, url, images } = data as {
    title?: unknown;
    content?: unknown;
    url?: unknown;
    images?: unknown;
  };

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("Jina Reader: empty article content");
  }

  return {
    url: typeof url === "string" ? url : requestedUrl,
    title:
      typeof title === "string" && title.length > 0 ? title : "Без заголовка",
    content,
    imageUrl: pickMainImage(images, content),
  };
}

function pickMainImage(images: unknown, content: string) {
  if (images && typeof images === "object") {
    for (const value of Object.values(images as Record<string, unknown>)) {
      if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
    }
  }
  const md = content.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/);
  if (md && md[1]) return md[1];
  return null;
}
