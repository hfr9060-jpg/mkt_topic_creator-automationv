#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/config
mkdir -p src/utils
mkdir -p src/telegram
mkdir -p src/ai/prompts
mkdir -p src/ai
mkdir -p src/research
mkdir -p src/storage
mkdir -p src/storage/repositories
mkdir -p src/workflows
mkdir -p src
mkdir -p scripts

cat > package.json <<'EOF_PACKAGE_JSON'
{
  "name": "creator-automation",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:telegram": "tsx --env-file=.env scripts/test-telegram.ts"
  },
  "dependencies": {},
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250514.0",
    "tsx": "^4.20.6",
    "typescript": "^5.8.3",
    "vitest": "^3.1.3",
    "wrangler": "^4.15.2"
  }
}
EOF_PACKAGE_JSON

cat > tsconfig.json <<'EOF_TSCONFIG_JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "scripts/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
EOF_TSCONFIG_JSON

cat > wrangler.toml <<'EOF_WRANGLER_TOML'
name = "creator-automation"
main = "src/index.ts"
compatibility_date = "2026-05-16"

[vars]
APP_ENV = "development"

[[kv_namespaces]]
binding = "CREATOR_AUTOMATION_KV"
id = "replace-with-production-kv-id"
preview_id = "replace-with-preview-kv-id"

[[d1_databases]]
binding = "DB"
database_name = "creator-automation"
database_id = "replace-with-d1-database-id"

[[r2_buckets]]
binding = "REPORTS_BUCKET"
bucket_name = "creator-automation-reports"

[triggers]
crons = [
  "0 1 * * *",
  "0 2 * * 1"
]
EOF_WRANGLER_TOML

cat > .env.example <<'EOF__ENV_EXAMPLE'
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=

LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com

TAVILY_API_KEY=

TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

X_API_KEY=
YOUTUBE_API_KEY=
INSTAGRAM_ACCESS_TOKEN=
TIKTOK_ACCESS_TOKEN=
BILIBILI_COOKIE=
EOF__ENV_EXAMPLE

cat > .gitignore <<'EOF__GITIGNORE'
.env
node_modules/
dist/
.wrangler/
EOF__GITIGNORE

cat > src/config/env.ts <<'EOF_SRC_CONFIG_ENV_TS'
export type AppEnv = "development" | "staging" | "production";

export interface Env {
  APP_ENV?: AppEnv;
  LLM_PROVIDER?: "deepseek";
  DEEPSEEK_API_KEY: string;
  DEEPSEEK_MODEL?: string;
  DEEPSEEK_BASE_URL?: string;
  TAVILY_API_KEY?: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  X_API_KEY?: string;
  YOUTUBE_API_KEY?: string;
  INSTAGRAM_ACCESS_TOKEN?: string;
  TIKTOK_ACCESS_TOKEN?: string;
  BILIBILI_COOKIE?: string;
  CREATOR_AUTOMATION_KV?: KVNamespace;
  DB?: D1Database;
  REPORTS_BUCKET?: R2Bucket;
}

export interface AppConfig {
  appEnv: AppEnv;
  llm: {
    provider: "deepseek";
    apiKey: string;
    model: string;
    baseUrl: string;
  };
  tavily?: {
    apiKey: string;
  };
  telegram: {
    botToken: string;
    chatId: string;
  };
  social: {
    xApiKey?: string;
    youtubeApiKey?: string;
    instagramAccessToken?: string;
    tiktokAccessToken?: string;
    bilibiliCookie?: string;
  };
}

const appEnvs = new Set<AppEnv>(["development", "staging", "production"]);

export function getRequiredEnv(env: Env, key: keyof Env): string {
  const value = env[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }

  return value;
}

export function getOptionalEnv(env: Env, key: keyof Env): string | undefined {
  const value = env[key];

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getAppEnv(env: Env): AppEnv {
  const value = getOptionalEnv(env, "APP_ENV") ?? "development";

  if (!appEnvs.has(value as AppEnv)) {
    throw new Error(`Invalid APP_ENV: ${value}`);
  }

  return value as AppEnv;
}

export function getConfig(env: Env): AppConfig {
  return {
    appEnv: getAppEnv(env),
    llm: {
      provider: "deepseek",
      apiKey: getRequiredEnv(env, "DEEPSEEK_API_KEY"),
      model: getOptionalEnv(env, "DEEPSEEK_MODEL") ?? "deepseek-chat",
      baseUrl: getOptionalEnv(env, "DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com"
    },
    tavily: getOptionalEnv(env, "TAVILY_API_KEY")
      ? {
          apiKey: getRequiredEnv(env, "TAVILY_API_KEY")
        }
      : undefined,
    telegram: {
      botToken: getRequiredEnv(env, "TELEGRAM_BOT_TOKEN"),
      chatId: getRequiredEnv(env, "TELEGRAM_CHAT_ID")
    },
    social: {
      xApiKey: getOptionalEnv(env, "X_API_KEY"),
      youtubeApiKey: getOptionalEnv(env, "YOUTUBE_API_KEY"),
      instagramAccessToken: getOptionalEnv(env, "INSTAGRAM_ACCESS_TOKEN"),
      tiktokAccessToken: getOptionalEnv(env, "TIKTOK_ACCESS_TOKEN"),
      bilibiliCookie: getOptionalEnv(env, "BILIBILI_COOKIE")
    }
  };
}
EOF_SRC_CONFIG_ENV_TS

cat > src/utils/logger.ts <<'EOF_SRC_UTILS_LOGGER_TS'
export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export function createLogger(options: { minLevel?: LogLevel } = {}): Logger {
  const minLevel = options.minLevel ?? "info";

  function write(level: LogLevel, message: string, context?: LogContext): void {
    if (levelOrder[level] < levelOrder[minLevel]) {
      return;
    }

    const payload = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...sanitizeContext(context)
    };

    const line = JSON.stringify(payload);

    if (level === "error") {
      console.error(line);
      return;
    }

    if (level === "warn") {
      console.warn(line);
      return;
    }

    console.log(line);
  }

  return {
    debug: (message, context) => write("debug", message, context),
    info: (message, context) => write("info", message, context),
    warn: (message, context) => write("warn", message, context),
    error: (message, context) => write("error", message, context)
  };
}

function sanitizeContext(context?: LogContext): LogContext {
  if (!context) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      value instanceof Error
        ? {
            name: value.name,
            message: value.message,
            stack: value.stack
          }
        : value
    ])
  );
}

export const logger = createLogger();
EOF_SRC_UTILS_LOGGER_TS

cat > src/telegram/client.ts <<'EOF_SRC_TELEGRAM_CLIENT_TS'
import type { AppConfig } from "../config/env";
import { logger, type Logger } from "../utils/logger";

export interface TelegramClientOptions {
  botToken: string;
  chatId: string;
  logger?: Logger;
}

export interface SendTelegramMessageOptions {
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
        chat_id: this.chatId,
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
EOF_SRC_TELEGRAM_CLIENT_TS

cat > src/ai/prompts/system.ts <<'EOF_SRC_AI_PROMPTS_SYSTEM_TS'
export const CREATOR_ASSISTANT_SYSTEM_PROMPT = [
  "You are an editorial strategist and analytics partner for an independent content creator.",
  "Your job is to turn social media performance data into sharp, practical decisions.",
  "Prioritize audience signal, repeatable formats, creator workload, and clear next actions.",
  "Be specific. Avoid vague growth advice, inflated claims, and generic motivational language.",
  "When data is incomplete, state the assumption and make conservative recommendations.",
  "Write in concise Chinese unless the user explicitly asks for another language."
].join("\n");
EOF_SRC_AI_PROMPTS_SYSTEM_TS

cat > src/ai/prompts/weekly-report.ts <<'EOF_SRC_AI_PROMPTS_WEEKLY_REPORT_TS'
export interface WeeklyReportPromptInput {
  creatorName?: string;
  weekStart: string;
  weekEnd: string;
  metricsSummary: string;
  topPosts?: string;
  notes?: string;
}

export function buildWeeklyReportPrompt(input: WeeklyReportPromptInput): string {
  return [
    "请基于以下内容创作者社媒数据，生成一份中文周报。",
    "",
    "输出结构：",
    "1. 本周一句话结论",
    "2. 关键数据变化",
    "3. 表现最好的内容与原因",
    "4. 值得复盘的问题",
    "5. 下周内容建议",
    "6. 3 个可直接执行的行动项",
    "",
    "要求：",
    "- 不要编造数据。",
    "- 如果数据不足，请明确说明。",
    "- 行动项要具体到内容主题、发布形式或分析动作。",
    "- 语气专业、直接、适合 Telegram 阅读。",
    "",
    `创作者：${input.creatorName ?? "未指定"}`,
    `统计周期：${input.weekStart} 至 ${input.weekEnd}`,
    "",
    "数据摘要：",
    input.metricsSummary,
    "",
    "高表现内容：",
    input.topPosts ?? "未提供",
    "",
    "补充备注：",
    input.notes ?? "无"
  ].join("\n");
}
EOF_SRC_AI_PROMPTS_WEEKLY_REPORT_TS

cat > src/ai/prompts/topic-ideas.ts <<'EOF_SRC_AI_PROMPTS_TOPIC_IDEAS_TS'
export interface TopicIdeasPromptInput {
  creatorName?: string;
  niche: string;
  audience?: string;
  recentPerformanceSummary: string;
  constraints?: string;
  count?: number;
}

export function buildTopicIdeasPrompt(input: TopicIdeasPromptInput): string {
  const count = input.count ?? 10;

  return [
    "请为内容创作者生成下一批选题。",
    "",
    "输出结构：",
    `生成 ${count} 个选题，每个选题包含：`,
    "- title：标题或主题",
    "- angle：切入角度",
    "- format：推荐内容形式",
    "- why：为什么值得做",
    "- hook：开头钩子",
    "- effort：制作难度，使用 low / medium / high",
    "",
    "要求：",
    "- 优先选择能复用已有高表现信号的选题。",
    "- 不要只给抽象方向，要给可直接开拍或开写的题目。",
    "- 避免标题党和无法验证的承诺。",
    "- 用中文输出，适合直接推送到 Telegram。",
    "",
    `创作者：${input.creatorName ?? "未指定"}`,
    `领域：${input.niche}`,
    `目标受众：${input.audience ?? "未指定"}`,
    "",
    "近期表现摘要：",
    input.recentPerformanceSummary,
    "",
    "约束条件：",
    input.constraints ?? "无"
  ].join("\n");
}
EOF_SRC_AI_PROMPTS_TOPIC_IDEAS_TS

cat > src/ai/llm-client.ts <<'EOF_SRC_AI_LLM_CLIENT_TS'
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
EOF_SRC_AI_LLM_CLIENT_TS

cat > src/ai/claude-client.ts <<'EOF_SRC_AI_CLAUDE_CLIENT_TS'
export {
  LlmClient as ClaudeClient,
  createLlmClient as createClaudeClient
} from "./llm-client";

export type {
  GenerateTextOptions,
  GenerateTextResult,
  LlmClientOptions as ClaudeClientOptions
} from "./llm-client";
EOF_SRC_AI_CLAUDE_CLIENT_TS

cat > src/research/search-client.ts <<'EOF_SRC_RESEARCH_SEARCH_CLIENT_TS'
import type { AppConfig } from "../config/env";
import { logger, type Logger } from "../utils/logger";

export interface TavilySearchClientOptions {
  apiKey: string;
  logger?: Logger;
}

export interface SearchInput {
  query: string;
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
}

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

interface TavilySearchResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    score?: number;
  }>;
  error?: string;
}

export class TavilySearchClient {
  private readonly apiKey: string;
  private readonly logger: Logger;

  constructor(options: TavilySearchClientOptions) {
    this.apiKey = options.apiKey;
    this.logger = options.logger ?? logger;
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const query = input.query.trim();

    if (query.length === 0) {
      throw new Error("Search query cannot be empty");
    }

    this.logger.info("Tavily search started", {
      query,
      maxResults: input.maxResults ?? 5
    });

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: input.maxResults ?? 5,
        search_depth: input.searchDepth ?? "basic",
        include_answer: false,
        include_raw_content: false
      })
    });

    const payload = (await response.json()) as TavilySearchResponse;

    if (!response.ok) {
      throw new Error(payload.error ?? `Tavily request failed: ${response.status}`);
    }

    const results =
      payload.results?.flatMap((result) => {
        if (!result.title || !result.url || !result.content) {
          return [];
        }

        return [
          {
            title: result.title,
            url: result.url,
            content: result.content,
            score: result.score
          }
        ];
      }) ?? [];

    this.logger.info("Tavily search completed", {
      query,
      resultCount: results.length
    });

    return results;
  }
}

export function createSearchClient(config: AppConfig): TavilySearchClient {
  if (!config.tavily) {
    throw new Error("TAVILY_API_KEY is required to use search");
  }

  return new TavilySearchClient({
    apiKey: config.tavily.apiKey
  });
}
EOF_SRC_RESEARCH_SEARCH_CLIENT_TS

cat > src/storage/kv.ts <<'EOF_SRC_STORAGE_KV_TS'
import type { Env } from "../config/env";

export class KvStore {
  constructor(private readonly namespace: KVNamespace) {}

  async getText(key: string): Promise<string | null> {
    return this.namespace.get(key);
  }

  async getJson<T>(key: string): Promise<T | null> {
    return this.namespace.get<T>(key, "json");
  }

  async putText(
    key: string,
    value: string,
    options?: KVNamespacePutOptions
  ): Promise<void> {
    await this.namespace.put(key, value, options);
  }

  async putJson<T>(
    key: string,
    value: T,
    options?: KVNamespacePutOptions
  ): Promise<void> {
    await this.namespace.put(key, JSON.stringify(value), options);
  }

  async delete(key: string): Promise<void> {
    await this.namespace.delete(key);
  }
}

export function getKvStore(env: Env): KvStore {
  if (!env.CREATOR_AUTOMATION_KV) {
    throw new Error("Missing KV namespace binding: CREATOR_AUTOMATION_KV");
  }

  return new KvStore(env.CREATOR_AUTOMATION_KV);
}
EOF_SRC_STORAGE_KV_TS

cat > src/storage/d1.ts <<'EOF_SRC_STORAGE_D1_TS'
import type { Env } from "../config/env";

export class D1Store {
  constructor(private readonly db: D1Database) {}

  async first<T extends object>(
    sql: string,
    ...bindings: unknown[]
  ): Promise<T | null> {
    return this.db
      .prepare(sql)
      .bind(...bindings)
      .first<T>();
  }

  async all<T extends object>(
    sql: string,
    ...bindings: unknown[]
  ): Promise<T[]> {
    const result = await this.db
      .prepare(sql)
      .bind(...bindings)
      .all<T>();

    return result.results ?? [];
  }

  async run(sql: string, ...bindings: unknown[]): Promise<D1Result> {
    return this.db
      .prepare(sql)
      .bind(...bindings)
      .run();
  }

  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    return this.db.batch<T>(statements);
  }

  prepare(sql: string): D1PreparedStatement {
    return this.db.prepare(sql);
  }
}

export function getD1Store(env: Env): D1Store {
  if (!env.DB) {
    throw new Error("Missing D1 database binding: DB");
  }

  return new D1Store(env.DB);
}
EOF_SRC_STORAGE_D1_TS

cat > src/storage/repositories/metrics-repo.ts <<'EOF_SRC_STORAGE_REPOSITORIES_METRICS_REPO_TS'
import { D1Store } from "../d1";

export interface SocialMetric {
  id: string;
  platform: string;
  accountId: string;
  metricDate: string;
  followers?: number;
  impressions?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  rawJson?: string;
  createdAt: string;
}

export interface CreateSocialMetricInput {
  id: string;
  platform: string;
  accountId: string;
  metricDate: string;
  followers?: number;
  impressions?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  raw?: unknown;
}

export interface ListMetricsOptions {
  platform?: string;
  accountId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

interface SocialMetricRow {
  id: string;
  platform: string;
  account_id: string;
  metric_date: string;
  followers: number | null;
  impressions: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  raw_json: string | null;
  created_at: string;
}

export class MetricsRepository {
  constructor(private readonly store: D1Store) {}

  async create(input: CreateSocialMetricInput): Promise<void> {
    await this.store.run(
      `INSERT INTO social_metrics (
        id,
        platform,
        account_id,
        metric_date,
        followers,
        impressions,
        views,
        likes,
        comments,
        shares,
        raw_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.platform,
      input.accountId,
      input.metricDate,
      input.followers ?? null,
      input.impressions ?? null,
      input.views ?? null,
      input.likes ?? null,
      input.comments ?? null,
      input.shares ?? null,
      input.raw === undefined ? null : JSON.stringify(input.raw),
      new Date().toISOString()
    );
  }

  async list(options: ListMetricsOptions = {}): Promise<SocialMetric[]> {
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (options.platform) {
      conditions.push("platform = ?");
      bindings.push(options.platform);
    }

    if (options.accountId) {
      conditions.push("account_id = ?");
      bindings.push(options.accountId);
    }

    if (options.fromDate) {
      conditions.push("metric_date >= ?");
      bindings.push(options.fromDate);
    }

    if (options.toDate) {
      conditions.push("metric_date <= ?");
      bindings.push(options.toDate);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(options.limit ?? 100, 500);

    const rows = await this.store.all<SocialMetricRow>(
      `SELECT
        id,
        platform,
        account_id,
        metric_date,
        followers,
        impressions,
        views,
        likes,
        comments,
        shares,
        raw_json,
        created_at
      FROM social_metrics
      ${whereClause}
      ORDER BY metric_date DESC, created_at DESC
      LIMIT ?`,
      ...bindings,
      limit
    );

    return rows.map(mapMetricRow);
  }
}

function mapMetricRow(row: SocialMetricRow): SocialMetric {
  return {
    id: row.id,
    platform: row.platform,
    accountId: row.account_id,
    metricDate: row.metric_date,
    followers: row.followers ?? undefined,
    impressions: row.impressions ?? undefined,
    views: row.views ?? undefined,
    likes: row.likes ?? undefined,
    comments: row.comments ?? undefined,
    shares: row.shares ?? undefined,
    rawJson: row.raw_json ?? undefined,
    createdAt: row.created_at
  };
}
EOF_SRC_STORAGE_REPOSITORIES_METRICS_REPO_TS

cat > src/storage/repositories/reports-repo.ts <<'EOF_SRC_STORAGE_REPOSITORIES_REPORTS_REPO_TS'
import { D1Store } from "../d1";

export type ReportType = "weekly" | "topic_ideas";

export interface GeneratedReport {
  id: string;
  type: ReportType;
  title: string;
  content: string;
  periodStart?: string;
  periodEnd?: string;
  metadataJson?: string;
  createdAt: string;
}

export interface CreateGeneratedReportInput {
  id: string;
  type: ReportType;
  title: string;
  content: string;
  periodStart?: string;
  periodEnd?: string;
  metadata?: unknown;
}

export interface ListReportsOptions {
  type?: ReportType;
  limit?: number;
}

interface GeneratedReportRow {
  id: string;
  type: ReportType;
  title: string;
  content: string;
  period_start: string | null;
  period_end: string | null;
  metadata_json: string | null;
  created_at: string;
}

export class ReportsRepository {
  constructor(private readonly store: D1Store) {}

  async create(input: CreateGeneratedReportInput): Promise<void> {
    await this.store.run(
      `INSERT INTO generated_reports (
        id,
        type,
        title,
        content,
        period_start,
        period_end,
        metadata_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.type,
      input.title,
      input.content,
      input.periodStart ?? null,
      input.periodEnd ?? null,
      input.metadata === undefined ? null : JSON.stringify(input.metadata),
      new Date().toISOString()
    );
  }

  async findById(id: string): Promise<GeneratedReport | null> {
    const row = await this.store.first<GeneratedReportRow>(
      `SELECT
        id,
        type,
        title,
        content,
        period_start,
        period_end,
        metadata_json,
        created_at
      FROM generated_reports
      WHERE id = ?`,
      id
    );

    return row ? mapReportRow(row) : null;
  }

  async list(options: ListReportsOptions = {}): Promise<GeneratedReport[]> {
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (options.type) {
      conditions.push("type = ?");
      bindings.push(options.type);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(options.limit ?? 50, 200);

    const rows = await this.store.all<GeneratedReportRow>(
      `SELECT
        id,
        type,
        title,
        content,
        period_start,
        period_end,
        metadata_json,
        created_at
      FROM generated_reports
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ?`,
      ...bindings,
      limit
    );

    return rows.map(mapReportRow);
  }
}

function mapReportRow(row: GeneratedReportRow): GeneratedReport {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
    periodStart: row.period_start ?? undefined,
    periodEnd: row.period_end ?? undefined,
    metadataJson: row.metadata_json ?? undefined,
    createdAt: row.created_at
  };
}
EOF_SRC_STORAGE_REPOSITORIES_REPORTS_REPO_TS

cat > src/workflows/generate-weekly-report.ts <<'EOF_SRC_WORKFLOWS_GENERATE_WEEKLY_REPORT_TS'
import { ClaudeClient } from "../ai/claude-client";
import {
  buildWeeklyReportPrompt,
  type WeeklyReportPromptInput
} from "../ai/prompts/weekly-report";
import type { ReportsRepository } from "../storage/repositories/reports-repo";
import { logger, type Logger } from "../utils/logger";

export interface GenerateWeeklyReportInput extends WeeklyReportPromptInput {
  reportId?: string;
  title?: string;
  saveReport?: boolean;
}

export interface GenerateWeeklyReportDependencies {
  claude: ClaudeClient;
  reportsRepo?: ReportsRepository;
  logger?: Logger;
}

export interface GenerateWeeklyReportResult {
  id: string;
  title: string;
  content: string;
  weekStart: string;
  weekEnd: string;
  saved: boolean;
}

export async function generateWeeklyReport(
  input: GenerateWeeklyReportInput,
  dependencies: GenerateWeeklyReportDependencies
): Promise<GenerateWeeklyReportResult> {
  const workflowLogger = dependencies.logger ?? logger;
  const reportId = input.reportId ?? createReportId(input.weekStart, input.weekEnd);
  const title = input.title ?? `内容周报 ${input.weekStart} - ${input.weekEnd}`;
  const prompt = buildWeeklyReportPrompt(input);

  workflowLogger.info("Weekly report generation started", {
    reportId,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd
  });

  const generated = await dependencies.claude.generateText({
    prompt,
    maxTokens: 2200,
    temperature: 0.3
  });

  const shouldSave = input.saveReport ?? true;

  if (shouldSave) {
    if (!dependencies.reportsRepo) {
      throw new Error("ReportsRepository is required when saveReport is enabled");
    }

    await dependencies.reportsRepo.create({
      id: reportId,
      type: "weekly",
      title,
      content: generated.text,
      periodStart: input.weekStart,
      periodEnd: input.weekEnd,
      metadata: {
        creatorName: input.creatorName,
        inputTokens: generated.message.usage?.promptTokens,
        outputTokens: generated.message.usage?.completionTokens,
        totalTokens: generated.message.usage?.totalTokens,
        model: generated.message.model,
        stopReason: generated.message.finishReason
      }
    });
  }

  workflowLogger.info("Weekly report generation completed", {
    reportId,
    saved: shouldSave
  });

  return {
    id: reportId,
    title,
    content: generated.text,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    saved: shouldSave
  };
}

function createReportId(weekStart: string, weekEnd: string): string {
  return `weekly_${weekStart}_${weekEnd}`.replaceAll(/[^a-zA-Z0-9_-]/g, "-");
}
EOF_SRC_WORKFLOWS_GENERATE_WEEKLY_REPORT_TS

cat > src/workflows/notify-telegram.ts <<'EOF_SRC_WORKFLOWS_NOTIFY_TELEGRAM_TS'
import { TelegramClient } from "../telegram/client";
import { logger, type Logger } from "../utils/logger";
import type { GenerateWeeklyReportResult } from "./generate-weekly-report";

export interface NotifyTelegramDependencies {
  telegram: TelegramClient;
  logger?: Logger;
}

export interface NotifyTelegramInput {
  title: string;
  content: string;
  footer?: string;
}

export interface NotifyWeeklyReportInput {
  report: GenerateWeeklyReportResult;
  footer?: string;
}

export interface NotifyTelegramResult {
  messageId: number;
}

export async function notifyTelegram(
  input: NotifyTelegramInput,
  dependencies: NotifyTelegramDependencies
): Promise<NotifyTelegramResult> {
  const workflowLogger = dependencies.logger ?? logger;
  const message = formatTelegramMessage(input);

  workflowLogger.info("Telegram notification started", {
    title: input.title
  });

  const result = await dependencies.telegram.sendMessage(message);

  workflowLogger.info("Telegram notification completed", {
    messageId: result.message_id
  });

  return {
    messageId: result.message_id
  };
}

export async function notifyWeeklyReport(
  input: NotifyWeeklyReportInput,
  dependencies: NotifyTelegramDependencies
): Promise<NotifyTelegramResult> {
  return notifyTelegram(
    {
      title: input.report.title,
      content: input.report.content,
      footer:
        input.footer ??
        `报告 ID: ${input.report.id}\n周期: ${input.report.weekStart} 至 ${input.report.weekEnd}`
    },
    dependencies
  );
}

function formatTelegramMessage(input: NotifyTelegramInput): string {
  return [
    input.title,
    "",
    input.content,
    input.footer ? ["", input.footer].join("\n") : undefined
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}
EOF_SRC_WORKFLOWS_NOTIFY_TELEGRAM_TS

cat > src/router.ts <<'EOF_SRC_ROUTER_TS'
import { ClaudeClient } from "./ai/claude-client";
import type { Env } from "./config/env";
import { getRequiredEnv } from "./config/env";
import { D1Store } from "./storage/d1";
import { ReportsRepository } from "./storage/repositories/reports-repo";
import { TelegramClient } from "./telegram/client";
import {
  generateWeeklyReport,
  type GenerateWeeklyReportInput
} from "./workflows/generate-weekly-report";
import {
  notifyTelegram,
  notifyWeeklyReport,
  type NotifyTelegramInput
} from "./workflows/notify-telegram";

type RouteHandler = (request: Request, env: Env) => Promise<Response>;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8"
};

export async function handleRequest(
  request: Request,
  env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }

  const url = new URL(request.url);
  const route = routes[routeKey(request.method, url.pathname)];

  if (!route) {
    return jsonResponse(
      {
        error: "Not found",
        routes: Object.keys(routes)
      },
      404
    );
  }

  try {
    return await route(request, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return jsonResponse(
      {
        error: message
      },
      500
    );
  }
}

const routes: Record<string, RouteHandler> = {
  "GET /health": handleHealth,
  "POST /workflows/generate-weekly-report": handleGenerateWeeklyReport,
  "POST /workflows/notify-telegram": handleNotifyTelegram,
  "POST /workflows/generate-weekly-report-and-notify":
    handleGenerateWeeklyReportAndNotify
};

async function handleHealth(_request: Request, env: Env): Promise<Response> {
  return jsonResponse({
    ok: true,
    appEnv: env.APP_ENV ?? "development"
  });
}

async function handleGenerateWeeklyReport(
  request: Request,
  env: Env
): Promise<Response> {
  const input = await readJson<GenerateWeeklyReportInput>(request);
  const result = await generateWeeklyReport(input, {
    claude: createClaudeClient(env),
    reportsRepo: input.saveReport === false ? undefined : createReportsRepo(env)
  });

  return jsonResponse({
    ok: true,
    report: result
  });
}

async function handleNotifyTelegram(
  request: Request,
  env: Env
): Promise<Response> {
  const input = await readJson<NotifyTelegramInput>(request);
  const result = await notifyTelegram(input, {
    telegram: createTelegramClient(env)
  });

  return jsonResponse({
    ok: true,
    notification: result
  });
}

async function handleGenerateWeeklyReportAndNotify(
  request: Request,
  env: Env
): Promise<Response> {
  const input = await readJson<
    GenerateWeeklyReportInput & {
      notificationFooter?: string;
    }
  >(request);
  const telegram = createTelegramClient(env);
  const report = await generateWeeklyReport(input, {
    claude: createClaudeClient(env),
    reportsRepo: input.saveReport === false ? undefined : createReportsRepo(env)
  });
  const notification = await notifyWeeklyReport(
    {
      report,
      footer: input.notificationFooter
    },
    {
      telegram
    }
  );

  return jsonResponse({
    ok: true,
    report,
    notification
  });
}

function createClaudeClient(env: Env): ClaudeClient {
  return new ClaudeClient({
    apiKey: getRequiredEnv(env, "DEEPSEEK_API_KEY"),
    model: env.DEEPSEEK_MODEL ?? "deepseek-chat",
    baseUrl: env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com"
  });
}

function createTelegramClient(env: Env): TelegramClient {
  return new TelegramClient({
    botToken: getRequiredEnv(env, "TELEGRAM_BOT_TOKEN"),
    chatId: getRequiredEnv(env, "TELEGRAM_CHAT_ID")
  });
}

function createReportsRepo(env: Env): ReportsRepository {
  if (!env.DB) {
    throw new Error("Missing D1 database binding: DB");
  }

  return new ReportsRepository(new D1Store(env.DB));
}

async function readJson<T>(request: Request): Promise<T> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Request content-type must be application/json");
  }

  return (await request.json()) as T;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...jsonHeaders,
      ...corsHeaders()
    }
  });
}

function corsHeaders(): HeadersInit {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type"
  };
}

function routeKey(method: string, pathname: string): string {
  return `${method.toUpperCase()} ${normalizePath(pathname)}`;
}

function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}
EOF_SRC_ROUTER_TS

cat > src/index.ts <<'EOF_SRC_INDEX_TS'
import type { Env } from "./config/env";
import { handleRequest } from "./router";

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env, ctx);
  }
};
EOF_SRC_INDEX_TS

cat > scripts/test-telegram.ts <<'EOF_SCRIPTS_TEST_TELEGRAM_TS'
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
EOF_SCRIPTS_TEST_TELEGRAM_TS

if [ ! -f .env ]; then
  cp .env.example .env
fi

npm install
npm run typecheck

echo "Project files created. Fill .env before running Telegram, search, or LLM workflows."
