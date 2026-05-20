import { config } from "./config.js";
import { Bot } from "grammy";
import { initHistory } from "./database/jsonStore.js";
import { registerHandlers } from "./bot/handlers.js";

async function main(): Promise<void> {
  await initHistory();

  const bot = new Bot(config.botToken);
  registerHandlers(bot);

  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  console.log("Bot is starting…");

  await bot.start({
    onStart: (info) => {
      console.log(`Bot started as @${info.username}`);
    },
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
