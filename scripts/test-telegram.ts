import { TelegramClient } from "../src/telegram/client";

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

const botToken = readRequiredEnv("TELEGRAM_BOT_TOKEN");
const chatId = readRequiredEnv("TELEGRAM_CHAT_ID");
const message =
  readOptionalEnv("TELEGRAM_TEST_MESSAGE") ??
  `Telegram Bot 测试消息：${new Date().toISOString()}`;

const telegram = new TelegramClient({
  botToken,
  chatId
});

try {
  const result = await telegram.sendMessage(message);
  console.log(
    JSON.stringify(
      {
        ok: true,
        messageId: result.message_id
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      },
      null,
      2
    )
  );
  process.exitCode = 1;
}

function readRequiredEnv(key: string): string {
  const value = readOptionalEnv(key);

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function readOptionalEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}
