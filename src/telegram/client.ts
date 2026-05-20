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

interface ParsedResponseBody<T> {
  text: string;
  json?: T;
  parseError?: string;
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

    const endpoint = this.endpoint("sendMessage");
    const targetChatId = options.chatId ?? this.chatId;
    const requestBody = {
      chat_id: targetChatId,
      text,
      parse_mode: options.parseMode,
      disable_web_page_preview: options.disableWebPagePreview ?? true
    };

    let response: Response;

    try {
      this.logger.info("Telegram sendMessage request started", {
        endpoint: "sendMessage",
        chatId: targetChatId,
        textLength: text.length,
        parseMode: options.parseMode,
        disableWebPagePreview: requestBody.disable_web_page_preview
      });

      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });
    } catch (error) {
      this.logger.error("Telegram sendMessage fetch threw before response", {
        endpoint: "sendMessage",
        chatId: targetChatId,
        error
      });
      throw error;
    }

    const contentType = response.headers.get("content-type");
    const body = await readResponseBody<TelegramApiResponse<TelegramMessageResult>>(
      response,
      "Telegram sendMessage"
    );

    this.logger.info("Telegram sendMessage response received", {
      endpoint: "sendMessage",
      status: response.status,
      ok: response.ok,
      contentType,
      responseBody: body.text,
      jsonParseError: body.parseError
    });

    if (!response.ok) {
      this.logger.error("Telegram message delivery failed with HTTP error", {
        status: response.status,
        contentType,
        responseBody: body.text,
        jsonParseError: body.parseError
      });

      throw new Error(
        body.json?.description ??
          `Telegram API request failed: ${response.status}. Body: ${body.text}`
      );
    }

    if (!body.json) {
      throw new Error(buildJsonParseFailureMessage("Telegram sendMessage", body));
    }

    const payload = body.json;

    if (!payload.ok || !payload.result) {
      this.logger.error("Telegram message delivery failed", {
        status: response.status,
        errorCode: payload.error_code,
        description: payload.description,
        responseBody: body.text
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

async function readResponseBody<T>(
  response: Response,
  apiName: string
): Promise<ParsedResponseBody<T>> {
  const text = await response.text();

  console.log(`${apiName} API response:`, text);

  if (text.trim().length === 0) {
    return {
      text,
      parseError: `${apiName} returned an empty response`
    };
  }

  try {
    return {
      text,
      json: JSON.parse(text) as T
    };
  } catch (error) {
    return {
      text,
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}

function buildJsonParseFailureMessage(
  apiName: string,
  body: ParsedResponseBody<unknown>
): string {
  if (body.text.trim().length === 0) {
    return `${apiName} returned an empty response`;
  }

  return `${apiName} returned a non-JSON response. Parse error: ${
    body.parseError ?? "unknown"
  }. Body: ${body.text}`;
}
