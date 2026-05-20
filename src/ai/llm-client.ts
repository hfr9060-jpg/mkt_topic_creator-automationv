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

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
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

    const payload = (await response.json()) as ChatCompletionResponse;

    if (!response.ok) {
      throw new Error(
        payload.error?.message ?? `LLM API request failed: ${response.status}`
      );
    }

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
