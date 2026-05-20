import type { AppConfig } from "../config/env";
import { logger, type Logger } from "../utils/logger";
import { CREATOR_ASSISTANT_SYSTEM_PROMPT } from "./prompts/system";

export interface LlmClientOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  logger?: Logger;
}

export interface GenerateTextOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateTextResult {
  text: string;
  message: {
    model: string;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    finishReason?: string;
    raw: unknown;
  };
}

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
}

interface ParsedResponseBody<T> {
  text: string;
  json?: T;
  parseError?: string;
}

const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MAX_TOKENS = 1800;
const DEFAULT_TEMPERATURE = 0.4;

export class LlmClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly maxTokens: number;
  private readonly temperature: number;
  private readonly logger: Logger;

  constructor(options: LlmClientOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.temperature = options.temperature ?? DEFAULT_TEMPERATURE;
    this.logger = options.logger ?? logger;
  }

  async generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
    const prompt = options.prompt.trim();

    if (prompt.length === 0) {
      throw new Error("LLM prompt cannot be empty");
    }

    const model = options.model ?? this.model;
    const maxTokens = options.maxTokens ?? this.maxTokens;
    const temperature = options.temperature ?? this.temperature;

    this.logger.info("LLM text generation started", {
      provider: "deepseek",
      model,
      maxTokens,
      temperature
    });

    const endpoint = `${trimTrailingSlash(this.baseUrl)}/chat/completions`;
    let response: Response;

    try {
      this.logger.info("DeepSeek chat completions request started", {
        provider: "deepseek",
        endpoint,
        model,
        maxTokens,
        temperature,
        promptLength: prompt.length
      });

      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          messages: [
            {
              role: "system",
              content: options.systemPrompt ?? CREATOR_ASSISTANT_SYSTEM_PROMPT
            },
            {
              role: "user",
              content: prompt
            }
          ]
        })
      });
    } catch (error) {
      this.logger.error("DeepSeek chat completions fetch threw before response", {
        endpoint,
        error
      });
      throw error;
    }

    const contentType = response.headers.get("content-type");
    const body = await readResponseBody<ChatCompletionResponse>(
      response,
      "DeepSeek chat completions"
    );

    this.logger.info("DeepSeek chat completions response received", {
      provider: "deepseek",
      endpoint,
      status: response.status,
      ok: response.ok,
      contentType,
      responseBody: body.text,
      jsonParseError: body.parseError
    });

    if (!response.ok) {
      throw new Error(
        body.json?.error?.message ??
          `DeepSeek chat completions request failed: ${response.status}. Body: ${body.text}`
      );
    }

    if (!body.json) {
      throw new Error(buildJsonParseFailureMessage("DeepSeek chat completions", body));
    }

    const payload = body.json;

    const text = payload.choices?.[0]?.message?.content?.trim();

    if (!text) {
      throw new Error("LLM API returned an empty response");
    }

    this.logger.info("LLM text generation completed", {
      provider: "deepseek",
      model: payload.model ?? model,
      promptTokens: payload.usage?.prompt_tokens,
      completionTokens: payload.usage?.completion_tokens,
      totalTokens: payload.usage?.total_tokens,
      finishReason: payload.choices?.[0]?.finish_reason
    });

    return {
      text,
      message: {
        model: payload.model ?? model,
        usage: {
          promptTokens: payload.usage?.prompt_tokens,
          completionTokens: payload.usage?.completion_tokens,
          totalTokens: payload.usage?.total_tokens
        },
        finishReason: payload.choices?.[0]?.finish_reason,
        raw: payload
      }
    };
  }
}

export function createLlmClient(config: AppConfig): LlmClient {
  return new LlmClient({
    apiKey: config.llm.apiKey,
    model: config.llm.model,
    baseUrl: config.llm.baseUrl
  });
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
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
