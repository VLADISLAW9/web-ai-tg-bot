import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL_NAME = "gemini-2.5-flash";

export async function generateWithGemini(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini: GEMINI_API_KEY is not set");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      temperature: 0.85,
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
