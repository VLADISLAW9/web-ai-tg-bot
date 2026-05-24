import { InlineKeyboard, Keyboard } from "grammy";

export const FIND_ARTICLE_BUTTON = "Найти статью";
export const LINK_POST_BUTTON = "Пост по ссылке";

export const mainKeyboard = new Keyboard()
  .text(FIND_ARTICLE_BUTTON)
  .text(LINK_POST_BUTTON)
  .resized()
  .persistent();

export const CB = {
  generate: "act:gen",
  searchNew: "act:new",
  back: "act:back",
  genGemini: "gen:gemini",
  genGrok: "gen:grok",
} as const;

export const articleKeyboard = new InlineKeyboard()
  .text("✍️ Сгенерировать пост", CB.generate)
  .row()
  .text("🔄 Искать новую статью", CB.searchNew);

export const modelKeyboard = new InlineKeyboard()
  .text("🤖 Grok", CB.genGrok)
  .text("✨ Gemini", CB.genGemini)
  .row()
  .text("← Назад", CB.back);

export const linkModelKeyboard = new InlineKeyboard()
  .text("🤖 Grok", CB.genGrok)
  .text("✨ Gemini", CB.genGemini);
