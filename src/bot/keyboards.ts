import { Keyboard } from "grammy";

export const FIND_ARTICLE_BUTTON = "Найти статью";

export const mainKeyboard = new Keyboard()
  .text(FIND_ARTICLE_BUTTON)
  .resized()
  .persistent();
