import { InlineKeyboard, Keyboard } from "grammy";

export const FIND_ARTICLE_BUTTON = "Найти статью";

// Главное меню — текстовая кнопка под полем ввода.
export const mainKeyboard = new Keyboard()
  .text(FIND_ARTICLE_BUTTON)
  .resized()
  .persistent();

// Данные inline-кнопок (callback_data). Держим короткими — лимит 64 байта.
export const CB = {
  generate: "act:gen", // открыть выбор модели
  searchNew: "act:new", // искать другую статью
  back: "act:back", // вернуться от выбора модели к карточке
  genGemini: "gen:gemini", // сгенерировать пост через Gemini
  genGrok: "gen:grok", // сгенерировать пост через Grok
} as const;

// Кнопки под карточкой предложенной статьи.
export const articleKeyboard = new InlineKeyboard()
  .text("✍️ Сгенерировать пост", CB.generate)
  .row()
  .text("🔄 Искать новую статью", CB.searchNew);

// Кнопки выбора модели для генерации.
export const modelKeyboard = new InlineKeyboard()
  .text("🤖 Grok", CB.genGrok)
  .text("✨ Gemini", CB.genGemini)
  .row()
  .text("← Назад", CB.back);
