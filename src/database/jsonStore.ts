import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const HISTORY_PATH = resolve(process.cwd(), "data", "history.json");

export async function initHistory() {
  try {
    await readFile(HISTORY_PATH, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    await mkdir(dirname(HISTORY_PATH), { recursive: true });
    await writeFile(HISTORY_PATH, "[]", "utf-8");
  }
}

export async function readHistory() {
  const raw = await readFile(HISTORY_PATH, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  if (
    !Array.isArray(parsed) ||
    !parsed.every((u): u is string => typeof u === "string")
  ) {
    throw new Error(`history.json: expected string[], got ${raw.slice(0, 80)}`);
  }
  return parsed;
}

export async function hasUrl(url: string) {
  const history = await readHistory();
  return history.includes(url);
}

export async function addUrl(url: string) {
  const history = await readHistory();
  if (history.includes(url)) return;
  history.push(url);
  await writeFile(HISTORY_PATH, JSON.stringify(history, null, 2), "utf-8");
}
