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
    title: input.title,
    messageLength: message.length,
    hasFooter: Boolean(input.footer)
  });

  let result: Awaited<ReturnType<TelegramClient["sendMessage"]>>;

  try {
    workflowLogger.info("Telegram sendMessage call started", {
      title: input.title,
      messageLength: message.length
    });

    result = await dependencies.telegram.sendMessage(message);

    workflowLogger.info("Telegram sendMessage call completed", {
      title: input.title,
      messageId: result.message_id
    });
  } catch (error) {
    workflowLogger.error("Telegram sendMessage call failed", {
      title: input.title,
      messageLength: message.length,
      error
    });
    throw error;
  }

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
