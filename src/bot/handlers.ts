import type { Bot, Context } from "grammy";
import { config } from "../config.js";
import { searchArticles, type SearchResult } from "../services/search.js";
import { parseArticle } from "../services/parser.js";
import { summarizeArticle } from "../services/ai.js";
import { addUrl, hasUrl } from "../database/jsonStore.js";
import { FIND_ARTICLE_BUTTON, mainKeyboard } from "./keyboards.js";
import { escapeHtml, htmlToPlain, renderSummary } from "./format.js";

const TOPICS = [
  "Vite performance",
  "React Server Components",
  "CSS container queries",
  "TypeScript advanced types",
  "Web performance optimization",
  "Web Vitals",
  "React 19 features",
  "Vue 3 composition API",
  "Modern CSS layout techniques",
  "Frontend testing best practices",
] as const;

const TG_CAPTION_LIMIT = 1024;

function pickRandomTopic(): string {
  const idx = Math.floor(Math.random() * TOPICS.length);
  return TOPICS[idx] ?? TOPICS[0];
}

function isAdmin(ctx: Context): boolean {
  return ctx.from?.id === config.adminTelegramId;
}

export function registerHandlers(bot: Bot): void {
  bot.use(async (ctx, next) => {
    if (isAdmin(ctx)) await next();
  });

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Привет! Нажми «Найти статью» или отправь /find — поищу свежую статью по фронтенду и сделаю выжимку.",
      { reply_markup: mainKeyboard },
    );
  });

  bot.command("find", findHandler);
  bot.hears(FIND_ARTICLE_BUTTON, findHandler);
}

async function findHandler(ctx: Context): Promise<void> {
  const topic = pickRandomTopic();
  await ctx.reply(`🔎 Ищу статьи: ${topic}…`);

  let results: SearchResult[];
  try {
    results = await searchArticles(topic, 5);
  } catch (err) {
    await ctx.reply(`Не удалось выполнить поиск.\n${(err as Error).message}`);
    return;
  }

  if (results.length === 0) {
    await ctx.reply(`По теме «${topic}» ничего не нашлось.`);
    return;
  }

  let chosen: SearchResult | null = null;
  for (const r of results) {
    if (!(await hasUrl(r.url))) {
      chosen = r;
      break;
    }
  }
  if (!chosen) {
    await ctx.reply(
      "Все 5 найденных статей уже были показаны. Попробуй ещё раз.",
    );
    return;
  }

  await ctx.reply(`📖 Читаю: ${chosen.title}`);

  let article;
  try {
    article = await parseArticle(chosen.url);
  } catch (err) {
    await ctx.reply(`Не удалось разобрать статью.\n${(err as Error).message}`);
    return;
  }

  await ctx.reply("✍️ Делаю выжимку…");

  let summary: string;
  try {
    summary = await summarizeArticle(article.title, article.content);
  } catch (err) {
    await ctx.reply(`Не удалось сделать выжимку.\n${(err as Error).message}`);
    return;
  }

  // Подробная выжимка не помещается в подпись к фото (лимит 1024),
  // поэтому фото идёт с короткой подписью, а сам пересказ — отдельными
  // сообщениями (лимит 4096 на сообщение).
  const photoCaption = buildPhotoCaption(article.title, article.url);

  try {
    if (article.imageUrl) {
      await ctx.replyWithPhoto(article.imageUrl, {
        caption: photoCaption,
        parse_mode: "HTML",
      });
    } else {
      await ctx.reply(photoCaption, { parse_mode: "HTML" });
    }
  } catch {
    // Картинка может оказаться битой/слишком большой — отправим текстом
    await ctx.reply(photoCaption, { parse_mode: "HTML" });
  }

  const messages = renderSummary(summary);
  for (const message of messages) {
    try {
      await ctx.reply(message, { parse_mode: "HTML" });
    } catch {
      // Если Telegram отверг разметку — отправляем без неё
      await ctx.reply(htmlToPlain(message));
    }
  }

  await addUrl(article.url);
}

function buildPhotoCaption(title: string, url: string): string {
  const caption = `<b>${escapeHtml(title)}</b>\n\n<a href="${escapeHtml(url)}">Читать оригинал →</a>`;
  return caption.length > TG_CAPTION_LIMIT
    ? caption.slice(0, TG_CAPTION_LIMIT - 1) + "…"
    : caption;
}
