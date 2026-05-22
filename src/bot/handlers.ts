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
  mainKeyboard,
  articleKeyboard,
  modelKeyboard,
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

// Состояние диалога на чат. Хранится в памяти: для личного бота этого
// достаточно — при перезапуске процесса состояние просто сбрасывается,
// и пользователь начинает поиск заново.
interface ChatState {
  // Сейчас предложенная, но ещё не обработанная статья.
  current: SearchResult | null;
  // URL'ы, уже предложенные в этой сессии, — чтобы не показывать повторно.
  seen: Set<string>;
}

const chatStates = new Map<number, ChatState>();

function stateFor(chatId: number): ChatState {
  let state = chatStates.get(chatId);
  if (!state) {
    state = { current: null, seen: new Set() };
    chatStates.set(chatId, state);
  }
  return state;
}

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
      "Привет! Нажми «Найти статью» — поищу свежую статью по фронтенду, " +
        "а ты выберешь, какой моделью сделать пост.",
      { reply_markup: mainKeyboard },
    );
  });

  // Поиск статьи: команда, текстовая кнопка и inline-кнопка «искать новую».
  bot.command("find", proposeArticle);
  bot.hears(FIND_ARTICLE_BUTTON, proposeArticle);
  bot.callbackQuery(CB.searchNew, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup().catch(() => {});
    await proposeArticle(ctx);
  });

  // Открыть выбор модели / вернуться к карточке статьи.
  bot.callbackQuery(CB.generate, showModelMenu);
  bot.callbackQuery(CB.back, backToArticle);

  // Генерация поста выбранной моделью.
  bot.callbackQuery(CB.genGrok, (ctx) => generatePost(ctx, "grok"));
  bot.callbackQuery(CB.genGemini, (ctx) => generatePost(ctx, "gemini"));
}

// Шаг 1: ищем статью по случайной теме и предлагаем её карточкой с кнопками.
async function proposeArticle(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return;
  const state = stateFor(chatId);

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

  // Берём первую статью, которой нет ни в истории, ни среди уже показанных.
  let chosen: SearchResult | null = null;
  for (const r of results) {
    if (state.seen.has(r.url)) continue;
    if (await hasUrl(r.url)) continue;
    chosen = r;
    break;
  }
  if (!chosen) {
    await ctx.reply(
      "Новых статей по этой теме не нашлось — попробуй ещё раз.",
    );
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

// Шаг 2: пользователь нажал «Сгенерировать пост» — показываем выбор модели.
async function showModelMenu(ctx: Context): Promise<void> {
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
    // Если карточку нельзя отредактировать — присылаем выбор отдельным сообщением.
    await ctx.reply("Чем сгенерировать пост?", { reply_markup: modelKeyboard });
  }
}

// Возврат от выбора модели к кнопкам карточки статьи.
async function backToArticle(ctx: Context): Promise<void> {
  await ctx.answerCallbackQuery();
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: articleKeyboard });
  } catch {
    /* карточку уже не отредактировать — не критично */
  }
}

// Шаг 3: парсим выбранную статью, делаем выжимку моделью и отправляем результат.
async function generatePost(ctx: Context, provider: AiProvider): Promise<void> {
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
  // Убираем кнопки с карточки, чтобы по ней не нажали повторно.
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
  state.current = null;

  await ctx.reply(
    `Готово — пост собран через ${label}. Нажми «Найти статью» для следующей.`,
    { reply_markup: mainKeyboard },
  );
}

// Карточка предложенной статьи: заголовок, описание и ссылка.
function buildArticleCard(article: SearchResult): string {
  const parts = [`<b>${escapeHtml(article.title)}</b>`];
  if (article.description) {
    parts.push(escapeHtml(article.description));
  }
  parts.push(
    `<a href="${escapeHtml(article.url)}">${escapeHtml(article.url)}</a>`,
  );
  return parts.join("\n\n");
}

function buildPhotoCaption(title: string, url: string): string {
  const caption = `<b>${escapeHtml(title)}</b>\n\n<a href="${escapeHtml(url)}">Читать оригинал →</a>`;
  return caption.length > TG_CAPTION_LIMIT
    ? caption.slice(0, TG_CAPTION_LIMIT - 1) + "…"
    : caption;
}
