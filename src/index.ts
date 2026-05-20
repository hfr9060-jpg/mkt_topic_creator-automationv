import { ClaudeClient } from "./ai/claude-client";
import type { Env } from "./config/env";
import { getRequiredEnv } from "./config/env";
import { handleRequest } from "./router";
import { TavilySearchClient, type SearchResult } from "./research/search-client";
import { D1Store } from "./storage/d1";
import { ReportsRepository } from "./storage/repositories/reports-repo";
import { TelegramClient } from "./telegram/client";
import { logger } from "./utils/logger";
import {
  generateWeeklyReport,
  type GenerateWeeklyReportInput
} from "./workflows/generate-weekly-report";

interface WeeklyReportRequestInput extends GenerateWeeklyReportInput {
  includeSearch?: boolean;
  searchQueries?: string[];
}

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8"
};

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/weekly-report") {
      return handleWeeklyReport(request, env);
    }

    return handleRequest(request, env, ctx);
  }
};

async function handleWeeklyReport(
  request: Request,
  env: Env
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const authorization = request.headers.get("authorization");
  const hasBearerPrefix = authorization?.startsWith("Bearer ") ?? false;

  console.log("POST /weekly-report authorization debug", {
    requestId,
    authorization,
    expectedFormat: "Authorization: Bearer test-secret-12345",
    hasAuthorization: Boolean(authorization),
    hasBearerPrefix
  });
  logger.info("POST /weekly-report request received", {
    requestId,
    method: request.method,
    url: request.url,
    authorization,
    expectedFormat: "Authorization: Bearer test-secret-12345",
    hasAuthorization: Boolean(authorization),
    hasBearerPrefix
  });

  try {
    const expectedToken = getRequiredEnv(env, "WORKER_SECRET");
    const isAuthorized = authorization === `Bearer ${expectedToken}`;

    if (!isAuthorized) {
      logger.warn("POST /weekly-report unauthorized", {
        requestId,
        authorization,
        hasAuthorization: Boolean(authorization),
        hasBearerPrefix,
        authorizationMatches: false
      });

      return jsonResponse(
        {
          success: false,
          message: "Unauthorized",
          debug: {
            requestId,
            route: "POST /weekly-report",
            expectedFormat: "Authorization: Bearer test-secret-12345",
            hasAuthorization: Boolean(authorization),
            hasBearerPrefix,
            receivedAuthorization: authorization,
            authorizationMatches: false
          }
        },
        401
      );
    }

    logger.info("POST /weekly-report authorization passed", {
      requestId,
      authorizationMatches: true
    });

    const input = (await request.json()) as WeeklyReportRequestInput;
    const enrichedInput = await enrichWeeklyReportInputWithSearch(input, env, requestId);
    const dependencies = {
      claude: new ClaudeClient({
        apiKey: getRequiredEnv(env, "DEEPSEEK_API_KEY"),
        model: env.DEEPSEEK_MODEL ?? "deepseek-chat",
        baseUrl: env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com"
      }),
      telegram: new TelegramClient({
        botToken: getRequiredEnv(env, "TELEGRAM_BOT_TOKEN"),
        chatId: getRequiredEnv(env, "TELEGRAM_CHAT_ID")
      }),
      reportsRepo: env.DB
        ? new ReportsRepository(new D1Store(env.DB))
        : undefined,
      logger
    };

    console.log("POST /weekly-report calling generateWeeklyReport", {
      requestId,
      input: enrichedInput,
      dependencyState: {
        hasClaude: Boolean(dependencies.claude),
        hasTelegram: Boolean(dependencies.telegram),
        hasReportsRepo: Boolean(dependencies.reportsRepo),
        hasLogger: Boolean(dependencies.logger)
      },
      signature: "generateWeeklyReport(input, dependencies)"
    });
    logger.info("POST /weekly-report calling generateWeeklyReport", {
      requestId,
      inputSummary: summarizeWeeklyReportInput(enrichedInput),
      dependencyState: {
        hasClaude: Boolean(dependencies.claude),
        hasTelegram: Boolean(dependencies.telegram),
        hasReportsRepo: Boolean(dependencies.reportsRepo),
        hasLogger: Boolean(dependencies.logger)
      },
      signature: "generateWeeklyReport(input, dependencies)"
    });

    const report = await generateWeeklyReport(enrichedInput, dependencies);

    console.log("POST /weekly-report generateWeeklyReport completed", {
      requestId,
      report
    });
    logger.info("POST /weekly-report generateWeeklyReport completed", {
      requestId,
      reportId: report.id,
      weekStart: report.weekStart,
      weekEnd: report.weekEnd,
      saved: report.saved,
      telegramMessageId: report.notification?.messageId
    });

    return jsonResponse({
      success: true,
      message: "Weekly report triggered",
      debug: {
        requestId,
        route: "POST /weekly-report",
        expectedFormat: "Authorization: Bearer test-secret-12345",
        hasAuthorization: Boolean(authorization),
        hasBearerPrefix,
        authorizationMatches: true,
        reportId: report.id,
        weekStart: report.weekStart,
        weekEnd: report.weekEnd,
        saved: report.saved,
        telegramMessageId: report.notification?.messageId,
        workflowCall: {
          signature: "generateWeeklyReport(input, dependencies)",
          passedContext: false,
          contextRequired: false,
          dependencyState: {
            hasClaude: Boolean(dependencies.claude),
            hasTelegram: Boolean(dependencies.telegram),
            hasReportsRepo: Boolean(dependencies.reportsRepo),
            hasLogger: Boolean(dependencies.logger)
          }
        }
      }
    });
  } catch (error) {
    const errorDetails = serializeError(error);

    console.error("POST /weekly-report failed", {
      requestId,
      error: errorDetails
    });
    logger.error("POST /weekly-report failed", {
      requestId,
      error: error instanceof Error ? error : errorDetails
    });

    return jsonResponse(
      {
        success: false,
        message: errorDetails.message,
        error: errorDetails,
        debug: {
          requestId,
          route: "POST /weekly-report",
          expectedFormat: "Authorization: Bearer test-secret-12345",
          hasAuthorization: Boolean(authorization),
          hasBearerPrefix,
          receivedAuthorization: authorization,
          authorizationMatches: env.WORKER_SECRET
            ? authorization === `Bearer ${env.WORKER_SECRET}`
            : false
        }
      },
      500
    );
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders
  });
}

function summarizeWeeklyReportInput(input: WeeklyReportRequestInput): object {
  return {
    creatorName: input.creatorName,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    includeSearch: input.includeSearch,
    searchQueryCount: input.searchQueries?.length ?? 0,
    reportId: input.reportId,
    title: input.title,
    saveReport: input.saveReport,
    hasMetricsSummary: Boolean(input.metricsSummary),
    metricsSummaryLength: input.metricsSummary?.length ?? 0,
    hasTopPosts: Boolean(input.topPosts),
    topPostsLength: input.topPosts?.length ?? 0,
    hasNotes: Boolean(input.notes),
    notesLength: input.notes?.length ?? 0
  };
}

async function enrichWeeklyReportInputWithSearch(
  input: WeeklyReportRequestInput,
  env: Env,
  requestId: string
): Promise<GenerateWeeklyReportInput> {
  if (!input.includeSearch) {
    return input;
  }

  const apiKey = env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is required when includeSearch is true");
  }

  const searchQueries =
    input.searchQueries && input.searchQueries.length > 0
      ? input.searchQueries
      : defaultWeeklyReportSearchQueries(input);

  const searchClient = new TavilySearchClient({
    apiKey,
    logger
  });

  logger.info("Weekly report Tavily enrichment started", {
    requestId,
    searchQueries
  });

  const resultGroups = await Promise.all(
    searchQueries.map(async (query) => ({
      query,
      results: await searchClient.search({
        query,
        maxResults: 5,
        searchDepth: "advanced"
      })
    }))
  );

  logger.info("Weekly report Tavily enrichment completed", {
    requestId,
    queryCount: resultGroups.length,
    resultCount: resultGroups.reduce(
      (total, group) => total + group.results.length,
      0
    )
  });

  const searchSummary = formatSearchSummary(resultGroups);
  const metricsSummary = [
    input.metricsSummary,
    "",
    "公开网络热点资料（来自 Tavily 搜索，不代表账号后台指标）：",
    searchSummary
  ]
    .filter((item): item is string => Boolean(item?.trim()))
    .join("\n");
  const notes = [
    input.notes,
    "本周账号级社媒指标尚未接入；请基于 Tavily 搜索结果补充公开热点、选题机会和内容方向，但不要把搜索结果误写成账号表现数据。"
  ]
    .filter((item): item is string => Boolean(item?.trim()))
    .join("\n");

  return {
    ...input,
    metricsSummary,
    notes
  };
}

function defaultWeeklyReportSearchQueries(input: WeeklyReportRequestInput): string[] {
  const weekRange = [input.weekStart, input.weekEnd]
    .filter(Boolean)
    .join(" to ");

  return [
    `AI creator economy trending topics ${weekRange}`,
    `x.com trending AI tools and agents ${weekRange}`,
    `content creator automation AI trends ${weekRange}`
  ];
}

function formatSearchSummary(
  resultGroups: Array<{ query: string; results: SearchResult[] }>
): string {
  return resultGroups
    .map((group) => {
      const results = group.results
        .map((result, index) =>
          [
            `${index + 1}. ${result.title}`,
            `URL: ${result.url}`,
            `摘要: ${result.content}`
          ].join("\n")
        )
        .join("\n");

      return [`搜索词：${group.query}`, results || "无结果"].join("\n");
    })
    .join("\n\n");
}

function serializeError(error: unknown): {
  name: string;
  message: string;
  stack?: string;
  raw?: unknown;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return {
    name: "NonError",
    message: typeof error === "string" ? error : "Unknown error",
    raw: error
  };
}
