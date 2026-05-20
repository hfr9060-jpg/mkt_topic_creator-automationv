import { ClaudeClient } from "./ai/claude-client";
import type { Env } from "./config/env";
import { getRequiredEnv } from "./config/env";
import { TavilySearchClient } from "./research/search-client";
import { D1Store } from "./storage/d1";
import { ReportsRepository } from "./storage/repositories/reports-repo";
import { TelegramClient } from "./telegram/client";
import {
  generateWeeklyReport,
  type GenerateWeeklyReportInput
} from "./workflows/generate-weekly-report";
import {
  notifyTelegram,
  type NotifyTelegramInput
} from "./workflows/notify-telegram";
import {
  handleTelegramCommand,
  type TelegramUpdate
} from "./workflows/handle-telegram-command";

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
    handleGenerateWeeklyReportAndNotify,
  "POST /telegram/webhook": handleTelegramWebhook
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
    telegram: createTelegramClient(env),
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
    telegram,
    reportsRepo: input.saveReport === false ? undefined : createReportsRepo(env)
  });

  return jsonResponse({
    ok: true,
    report,
    notification: report.notification
  });
}

async function handleTelegramWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  const update = await readJson<TelegramUpdate>(request);
  const result = await handleTelegramCommand(update, {
    llm: createClaudeClient(env),
    search: createSearchClient(env),
    telegram: createTelegramClient(env)
  });

  return jsonResponse({
    ok: true,
    result
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

function createSearchClient(env: Env): TavilySearchClient {
  return new TavilySearchClient({
    apiKey: getRequiredEnv(env, "TAVILY_API_KEY")
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
