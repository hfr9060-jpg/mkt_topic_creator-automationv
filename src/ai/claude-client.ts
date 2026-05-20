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
  choices?: Array<{
    message?: {
      content?: string;
    };
    finish_reason?: string;
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

interface ParsedResponseBody<T> {
  text: string;
  json?: T;
  parseError?: string;
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

    const endpoint = `${trimTrailingSlash(this.deepSeekBaseUrl)}/chat/completions`;
    const requestBody = {
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
    };

    let response: Response;

    try {
      this.deepSeekLogger.info("DeepSeek API request started", {
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
          authorization: `Bearer ${this.deepSeekApiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });
    } catch (error) {
      this.deepSeekLogger.error("DeepSeek API fetch threw before response", {
        endpoint,
        error
      });
      throw error;
    }

    const contentType = response.headers.get("content-type");
    const body = await readResponseBody<DeepSeekMessageResponse>(
      response,
      "DeepSeek chat completions"
    );

    this.deepSeekLogger.info("DeepSeek API response received", {
      provider: "deepseek",
      endpoint,
      status: response.status,
      ok: response.ok,
      contentType,
      responseBody: body.text,
      jsonParseError: body.parseError
    });

    if (!response.ok) {
      this.deepSeekLogger.error("DeepSeek API response was not ok", {
        provider: "deepseek",
        endpoint,
        status: response.status,
        contentType,
        responseBody: body.text,
        jsonParseError: body.parseError
      });

      throw new Error(
        body.json?.error?.message ??
          `DeepSeek API request failed: ${response.status}. Body: ${body.text}`
      );
    }

    if (!body.json) {
      throw new Error(buildJsonParseFailureMessage("DeepSeek chat completions", body));
    }

    const payload = body.json;

    const text =
      payload.choices?.[0]?.message?.content?.trim() ??
      payload.content
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
      finishReason: payload.choices?.[0]?.finish_reason ?? payload.stop_reason
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
        finishReason: payload.choices?.[0]?.finish_reason ?? payload.stop_reason,
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
