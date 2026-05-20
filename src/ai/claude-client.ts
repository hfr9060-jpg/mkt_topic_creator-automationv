import { logger, type Logger } from "../utils/logger";
import { LlmClient } from "./llm-client";
import { CREATOR_ASSISTANT_SYSTEM_PROMPT } from "./prompts/system";

export interface ClaudeClientOptions {
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

interface DeepSeekMessageResponse {
  id?: string;
  model?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  stop_reason?: string;
  error?: {
    message?: string;
  };
}

const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MAX_TOKENS = 1800;
const DEFAULT_TEMPERATURE = 0.4;

export class ClaudeClient extends LlmClient {
  private readonly deepSeekApiKey: string;
  private readonly deepSeekModel: string;
  private readonly deepSeekBaseUrl: string;
  private readonly deepSeekMaxTokens: number;
  private readonly deepSeekTemperature: number;
  private readonly deepSeekLogger: Logger;

  constructor(options: ClaudeClientOptions) {
    super(options);
    this.deepSeekApiKey = options.apiKey;
    this.deepSeekModel = options.model ?? DEFAULT_MODEL;
    this.deepSeekBaseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.deepSeekMaxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.deepSeekTemperature = options.temperature ?? DEFAULT_TEMPERATURE;
    this.deepSeekLogger = options.logger ?? logger;
  }

  async generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
    const prompt = options.prompt.trim();

    if (prompt.length === 0) {
      throw new Error("LLM prompt cannot be empty");
    }

    const model = options.model ?? this.deepSeekModel;
    const maxTokens = options.maxTokens ?? this.deepSeekMaxTokens;
    const temperature = options.temperature ?? this.deepSeekTemperature;

    this.deepSeekLogger.info("DeepSeek text generation started", {
      provider: "deepseek",
      model,
      maxTokens,
      temperature
    });

    const response = await fetch(`${trimTrailingSlash(this.deepSeekBaseUrl)}/v1/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.deepSeekApiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system: options.systemPrompt ?? CREATOR_ASSISTANT_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    const payload = (await response.json()) as DeepSeekMessageResponse;

    if (!response.ok) {
      throw new Error(
        payload.error?.message ?? `DeepSeek API request failed: ${response.status}`
      );
    }

    const text = payload.content
      ?.map((item) => item.text)
      .filter((item): item is string => Boolean(item?.trim()))
      .join("\n")
      .trim();

    if (!text) {
      throw new Error("DeepSeek API returned an empty response");
    }

    const promptTokens = payload.usage?.input_tokens ?? payload.usage?.prompt_tokens;
    const completionTokens =
      payload.usage?.output_tokens ?? payload.usage?.completion_tokens;

    this.deepSeekLogger.info("DeepSeek text generation completed", {
      provider: "deepseek",
      model: payload.model ?? model,
      promptTokens,
      completionTokens,
      totalTokens: payload.usage?.total_tokens,
      finishReason: payload.stop_reason
    });

    return {
      text,
      message: {
        model: payload.model ?? model,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: payload.usage?.total_tokens
        },
        finishReason: payload.stop_reason,
        raw: payload
      }
    };
  }
}

export function createClaudeClient(options: ClaudeClientOptions): ClaudeClient {
  return new ClaudeClient(options);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
