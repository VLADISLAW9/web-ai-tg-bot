import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL_NAME = "gemini-2.5-flash";

/** Генерация пересказа через Google Gemini по готовому промпту. */
export async function generateWithGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini: GEMINI_API_KEY is not set");
  }

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

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Gemini: generation failed (${reason})`);
  }
}
