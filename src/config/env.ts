export type AppEnv = "development" | "staging" | "production";

export interface Env {
  APP_ENV?: AppEnv;
  WORKER_SECRET?: string;
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
