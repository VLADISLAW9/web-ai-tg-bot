import "dotenv/config";
import process from "process";

function required(name: string): string {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env variable: ${name}`);
  }

  return value;
}

function requiredInt(name: string): number {
  const raw = required(name);
  const n = Number(raw);

  if (!Number.isInteger(n)) {
    throw new Error(`Env variable ${name} must be an integer, got "${raw}"`);
  }

  return n;
}

export const config = {
  botToken: required("BOT_TOKEN"),
  adminTelegramId: requiredInt("ADMIN_TELEGRAM_ID"),
  jinaApiKey: required("JINA_API_KEY"),
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  xaiApiKey: process.env.XAI_API_KEY ?? "",
} as const;
