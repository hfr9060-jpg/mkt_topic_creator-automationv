import { ClaudeClient } from "../ai/claude-client";
import {
  buildWeeklyReportPrompt,
  type WeeklyReportPromptInput
} from "../ai/prompts/weekly-report";
import type { ReportsRepository } from "../storage/repositories/reports-repo";
import type { TelegramClient } from "../telegram/client";
import { logger, type Logger } from "../utils/logger";
import { notifyTelegram, type NotifyTelegramResult } from "./notify-telegram";

export interface GenerateWeeklyReportInput extends WeeklyReportPromptInput {
  reportId?: string;
  title?: string;
  saveReport?: boolean;
}

export interface GenerateWeeklyReportDependencies {
  claude: ClaudeClient;
  reportsRepo?: ReportsRepository;
  telegram?: TelegramClient;
  logger?: Logger;
}

export interface GenerateWeeklyReportResult {
  id: string;
  title: string;
  content: string;
  weekStart: string;
  weekEnd: string;
  saved: boolean;
  notification?: NotifyTelegramResult;
}

class WorkflowStepError extends Error {
  constructor(
    message: string,
    readonly step: string,
    readonly cause: unknown
  ) {
    super(`${message}: ${formatErrorMessage(cause)}`);
    this.name = "WorkflowStepError";
  }
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
    weekEnd: input.weekEnd,
    promptLength: prompt.length,
    hasReportsRepo: Boolean(dependencies.reportsRepo),
    hasTelegram: Boolean(dependencies.telegram)
  });

  let generated: Awaited<ReturnType<ClaudeClient["generateText"]>>;

  try {
    workflowLogger.info("Weekly report DeepSeek generation step started", {
      reportId,
      promptLength: prompt.length
    });

    generated = await dependencies.claude.generateText({
      prompt,
      maxTokens: 2200,
      temperature: 0.3
    });

    workflowLogger.info("Weekly report DeepSeek generation step completed", {
      reportId,
      contentLength: generated.text.length,
      model: generated.message.model,
      usage: generated.message.usage,
      finishReason: generated.message.finishReason,
      rawResponse: generated.message.raw
    });
  } catch (error) {
    workflowLogger.error("Weekly report DeepSeek generation step failed", {
      reportId,
      error
    });

    throw new WorkflowStepError(
      "Weekly report failed during DeepSeek generation",
      "deepseek.generateText",
      error
    );
  }

  const shouldSave = input.saveReport ?? true;

  if (shouldSave) {
    if (!dependencies.reportsRepo) {
      throw new Error("ReportsRepository is required when saveReport is enabled");
    }

    try {
      workflowLogger.info("Weekly report persistence step started", {
        reportId
      });

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

      workflowLogger.info("Weekly report persistence step completed", {
        reportId
      });
    } catch (error) {
      workflowLogger.error("Weekly report persistence step failed", {
        reportId,
        error
      });

      throw new WorkflowStepError(
        "Weekly report failed during persistence",
        "reportsRepo.create",
        error
      );
    }
  }

  let notification: NotifyTelegramResult | undefined;

  if (dependencies.telegram) {
    try {
      workflowLogger.info("Weekly report Telegram notification step started", {
        reportId,
        title,
        contentLength: generated.text.length
      });

      notification = await notifyTelegram(
          {
            title,
            content: generated.text,
            footer: `报告 ID: ${reportId}\n周期: ${input.weekStart} 至 ${input.weekEnd}`
          },
          {
            telegram: dependencies.telegram,
            logger: workflowLogger
          }
        );

      workflowLogger.info("Weekly report Telegram notification step completed", {
        reportId,
        messageId: notification.messageId
      });
    } catch (error) {
      workflowLogger.error("Weekly report Telegram notification step failed", {
        reportId,
        error
      });

      throw new WorkflowStepError(
        "Weekly report failed during Telegram notification",
        "notifyTelegram",
        error
      );
    }
  } else {
    workflowLogger.info("Weekly report Telegram notification step skipped", {
      reportId,
      reason: "No TelegramClient dependency provided"
    });
  }

  workflowLogger.info("Weekly report generation completed", {
    reportId,
    saved: shouldSave,
    notificationMessageId: notification?.messageId
  });

  return {
    id: reportId,
    title,
    content: generated.text,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    saved: shouldSave,
    notification
  };
}

function createReportId(weekStart: string, weekEnd: string): string {
  return `weekly_${weekStart}_${weekEnd}`.replaceAll(/[^a-zA-Z0-9_-]/g, "-");
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}
