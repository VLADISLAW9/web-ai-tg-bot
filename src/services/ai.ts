import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL_NAME = "gemini-2.5-flash";
const MAX_INPUT_CHARS = 12_000;
const MAX_SUMMARY_CHARS = 700;

const PROMPT_TEMPLATE = `Ты — редактор русскоязычного фронтенд-дайджеста. По присланной статье напиши структурированную выжимку СТРОГО по шаблону ниже. Никаких вступлений, пояснений и метакомментариев — только сам шаблон.

Требования:
- Пиши по-русски, технически точно, без воды.
- Уложись в 700 символов суммарно, включая разметку.
- Сохраняй именно эту разметку, в этом порядке:

**Главная суть:** {1–2 предложения}

**Ключевые инсайты:**
• {конкретная техническая деталь}
• {конкретная техническая деталь}
• {конкретная техническая деталь}
(всего 3–4 буллита)

**Кому полезно:** {1 предложение, какой роли/уровню фронтендера это пригодится}

---
Заголовок статьи: {{TITLE}}

Текст статьи:
{{CONTENT}}`;

export async function summarizeArticle(
  title: string,
  content: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini: GEMINI_API_KEY is not set");
  }

  const trimmedContent =
    content.length > MAX_INPUT_CHARS
      ? content.slice(0, MAX_INPUT_CHARS) + "\n…(обрезано)"
      : content;

  const prompt = PROMPT_TEMPLATE.replace("{{TITLE}}", title).replace(
    "{{CONTENT}}",
    trimmedContent,
  );

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 500,
    },
  });

  let text: string;
  try {
    const result = await model.generateContent(prompt);
    text = result.response.text().trim();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Gemini: generation failed (${reason})`);
  }

  if (text.length === 0) {
    throw new Error("Gemini: empty response");
  }

  return text.length > MAX_SUMMARY_CHARS
    ? text.slice(0, MAX_SUMMARY_CHARS - 1) + "…"
    : text;
}
