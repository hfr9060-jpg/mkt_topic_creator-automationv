import type { AppConfig } from "../config/env";
import { logger, type Logger } from "../utils/logger";

export interface TelegramClientOptions {
  botToken: string;
  chatId: string;
  logger?: Logger;
}

export interface SendTelegramMessageOptions {
  chatId?: string;
  parseMode?: "MarkdownV2" | "HTML";
  disableWebPagePreview?: boolean;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

interface TelegramMessageResult {
  message_id: number;
  date: number;
  text?: string;
}

export class TelegramClient {
  private readonly botToken: string;
  private readonly chatId: string;
  private readonly logger: Logger;

  constructor(options: TelegramClientOptions) {
    this.botToken = options.botToken;
    this.chatId = options.chatId;
    this.logger = options.logger ?? logger;
  }

  async sendMessage(
    text: string,
    options: SendTelegramMessageOptions = {}
  ): Promise<TelegramMessageResult> {
    if (text.trim().length === 0) {
      throw new Error("Telegram message text cannot be empty");
    }

    const response = await fetch(this.endpoint("sendMessage"), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        chat_id: options.chatId ?? this.chatId,
        text,
        parse_mode: options.parseMode,
        disable_web_page_preview: options.disableWebPagePreview ?? true
      })
    });

    const payload =
      (await response.json()) as TelegramApiResponse<TelegramMessageResult>;

    if (!response.ok || !payload.ok || !payload.result) {
      this.logger.error("Telegram message delivery failed", {
        status: response.status,
        errorCode: payload.error_code,
        description: payload.description
      });

      throw new Error(
        payload.description ?? `Telegram API request failed: ${response.status}`
      );
    }

    this.logger.info("Telegram message delivered", {
      messageId: payload.result.message_id
    });

    return payload.result;
  }

  private endpoint(method: string): string {
    return `https://api.telegram.org/bot${this.botToken}/${method}`;
  }
}

export function createTelegramClient(config: AppConfig): TelegramClient {
  return new TelegramClient({
    botToken: config.telegram.botToken,
    chatId: config.telegram.chatId
  });
}
