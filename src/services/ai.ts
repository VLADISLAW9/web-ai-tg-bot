import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL_NAME = "gemini-2.5-flash";
// Сколько символов статьи отдаём модели — больше контекста, лучше пересказ.
const MAX_INPUT_CHARS = 32_000;
// Верхняя граница пересказа. Сам по себе он разобьётся на несколько сообщений
// в Telegram, поэтому жёсткого «обрезания по шаблону» больше нет.
const MAX_SUMMARY_CHARS = 7_000;

const PROMPT_TEMPLATE = `Ты — опытный фронтенд-разработчик и редактор технического дайджеста. Тебе прислали статью. Сделай по ней ёмкий, но самодостаточный пересказ на русском языке: такой, чтобы, прочитав ТОЛЬКО его, человек понял главную суть статьи и не нуждался в открытии оригинала.

Принципы:
- Пиши по-русски, технически точно, живым и связным языком. Без воды, без рекламных оборотов, без метакомментариев вроде «в этой статье».
- Передай суть: что именно автор предлагает, какую проблему это решает, главные нюансы и выводы. Бери только самое важное — второстепенные детали и перечисления опускай.
- Если в статье есть примеры кода — приведи 1–2 КЛЮЧЕВЫХ, коротких примера в блоках с указанием языка, например \`\`\`tsx … \`\`\`. Длинные листинги сокращай до сути. Не дублируй похожие примеры.
- НЕ используй жёсткий одинаковый шаблон. Структура пересказа должна быть своей у каждой статьи и определяться её содержанием: где-то уместны подзаголовки и списки, где-то связный текст с вставками кода.
- Можно использовать markdown: **жирный** для акцентов, ### подзаголовки, маркированные списки, блоки кода и инлайн-код.
- ВАЖНО ПРО ОБЪЁМ: пересказ должен быть КОМПАКТНЫМ — строго не более 2500 символов, включая код. Это жёсткое ограничение. Лучше короче и по делу, чем длинно и с повторами.
- Не добавляй ссылку на оригинал и не здоровайся — выдай только сам текст пересказа.

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
      // Выше температура — заметнее разнообразие структуры между статьями.
      temperature: 0.85,
      // gemini-2.5-flash тратит токены ещё и на «размышление», поэтому
      // бюджет берётся с большим запасом — иначе ответ оборвётся на полуслове.
      // Реальную компактность пересказа (~2500 символов) задаёт промпт.
      maxOutputTokens: 8192,
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
