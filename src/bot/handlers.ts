import type { Bot, Context } from "grammy";
import { config } from "../config.js";
import { searchArticles, type SearchResult } from "../services/search.js";
import { parseArticle } from "../services/parser.js";
import {
  summarizeArticle,
  PROVIDER_LABELS,
  type AiProvider,
} from "../services/ai/index.js";
import { addUrl, hasUrl } from "../database/jsonStore.js";
import {
  FIND_ARTICLE_BUTTON,
  LINK_POST_BUTTON,
  mainKeyboard,
  articleKeyboard,
  modelKeyboard,
  linkModelKeyboard,
  CB,
} from "./keyboards.js";
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

interface ChatState {
  current: SearchResult | null;
  seen: Set<string>;
  awaitingLink: boolean;
}

const chatStates = new Map<number, ChatState>();

function stateFor(chatId: number) {
  let state = chatStates.get(chatId);
  if (!state) {
    state = { current: null, seen: new Set(), awaitingLink: false };
    chatStates.set(chatId, state);
  }
  return state;
}

function pickRandomTopic() {
  const idx = Math.floor(Math.random() * TOPICS.length);
  return TOPICS[idx] ?? TOPICS[0];
}

function isAdmin(ctx: Context) {
  return ctx.from?.id === config.adminTelegramId;
}

export function registerHandlers(bot: Bot) {
  bot.use(async (ctx, next) => {
    if (isAdmin(ctx)) await next();
  });

  bot.command("start", async (ctx) => {
    if (ctx.chat) stateFor(ctx.chat.id).awaitingLink = false;
    await ctx.reply(
      "Привет! «Найти статью» — поищу свежую статью по фронтенду. " +
        "«Пост по ссылке» — пришли свой URL, и я сделаю пост по нему. " +
        "Модель для генерации ты выбираешь сам.",
      { reply_markup: mainKeyboard },
    );
  });

  bot.command("find", proposeArticle);
  bot.hears(FIND_ARTICLE_BUTTON, proposeArticle);
  bot.callbackQuery(CB.searchNew, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup().catch(() => {});
    await proposeArticle(ctx);
  });

  bot.hears(LINK_POST_BUTTON, askForLink);

  bot.callbackQuery(CB.generate, showModelMenu);
  bot.callbackQuery(CB.back, backToArticle);

  bot.callbackQuery(CB.genGrok, (ctx) => generatePost(ctx, "grok"));
  bot.callbackQuery(CB.genGemini, (ctx) => generatePost(ctx, "gemini"));

  bot.on("message:text", handleText);
}

const URL_RE = /https?:\/\/[^\s]+/i;

async function askForLink(ctx: Context) {
  if (!ctx.chat) return;
  stateFor(ctx.chat.id).awaitingLink = true;
  await ctx.reply("Пришли ссылку на статью — сделаю по ней пост.");
}

async function handleText(ctx: Context) {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return;
  const state = stateFor(chatId);
  if (!state.awaitingLink) return;

  const match = ctx.message?.text?.match(URL_RE);
  if (!match) {
    await ctx.reply(
      "Это не похоже на ссылку. Пришли URL вида https://… — или нажми «Найти статью».",
    );
    return;
  }

  const url = match[0].replace(/[.,;:!?)\]]+$/, "");
  state.awaitingLink = false;
  state.current = { url, title: url };

  await ctx.reply(`🔗 Ссылка принята:\n${url}\n\nЧем сгенерировать пост?`, {
    link_preview_options: { is_disabled: true },
    reply_markup: linkModelKeyboard,
  });
}

async function proposeArticle(ctx: Context) {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return;

  const state = stateFor(chatId);
  state.awaitingLink = false;

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
    if (state.seen.has(r.url)) continue;
    if (await hasUrl(r.url)) continue;
    chosen = r;
    break;
  }
  if (!chosen) {
    await ctx.reply("Новых статей по этой теме не нашлось — попробуй ещё раз.");
    return;
  }

  state.current = chosen;
  state.seen.add(chosen.url);

  await ctx.reply(buildArticleCard(chosen), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: articleKeyboard,
  });
}

async function showModelMenu(ctx: Context) {
  const state = ctx.chat ? stateFor(ctx.chat.id) : null;
  if (!state?.current) {
    await ctx.answerCallbackQuery({
      text: "Статья не найдена — нажми «Найти статью» заново.",
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery();
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: modelKeyboard });
  } catch {
    await ctx.reply("Чем сгенерировать пост?", { reply_markup: modelKeyboard });
  }
}

async function backToArticle(ctx: Context) {
  await ctx.answerCallbackQuery();
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: articleKeyboard });
  } catch {}
}

async function generatePost(ctx: Context, provider: AiProvider) {
  const state = ctx.chat ? stateFor(ctx.chat.id) : null;
  const chosen = state?.current ?? null;
  if (!state || !chosen) {
    await ctx.answerCallbackQuery({
      text: "Статья не найдена — нажми «Найти статью» заново.",
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup().catch(() => {});

  const label = PROVIDER_LABELS[provider];

  await ctx.reply(`📖 Читаю: ${chosen.title}`);

  let article;
  try {
    article = await parseArticle(chosen.url);
  } catch (err) {
    await ctx.reply(`Не удалось разобрать статью.\n${(err as Error).message}`);
    return;
  }

  await ctx.reply(`✍️ Делаю выжимку через ${label}…`);

  let summary: string;
  try {
    summary = await summarizeArticle(provider, article.title, article.content);
  } catch (err) {
    await ctx.reply(`Не удалось сделать выжимку.\n${(err as Error).message}`);
    return;
  }

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
    await ctx.reply(photoCaption, { parse_mode: "HTML" });
  }

  const messages = renderSummary(summary);
  for (const message of messages) {
    try {
      await ctx.reply(message, { parse_mode: "HTML" });
    } catch {
      await ctx.reply(htmlToPlain(message));
    }
  }

  await addUrl(article.url);
  state.current = null;

  await ctx.reply(
    `Готово — пост собран через ${label}. Нажми «Найти статью» для следующей.`,
    { reply_markup: mainKeyboard },
  );
}

function buildArticleCard(article: SearchResult) {
  const parts = [`<b>${escapeHtml(article.title)}</b>`];
  if (article.description) {
    parts.push(escapeHtml(article.description));
  }
  parts.push(
    `<a href="${escapeHtml(article.url)}">${escapeHtml(article.url)}</a>`,
  );
  return parts.join("\n\n");
}

function buildPhotoCaption(title: string, url: string) {
  const caption = `<b>${escapeHtml(title)}</b>\n\n<a href="${escapeHtml(url)}">Читать оригинал →</a>`;
  return caption.length > TG_CAPTION_LIMIT
    ? caption.slice(0, TG_CAPTION_LIMIT - 1) + "…"
    : caption;
}
