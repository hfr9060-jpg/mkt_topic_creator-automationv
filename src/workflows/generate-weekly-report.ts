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
