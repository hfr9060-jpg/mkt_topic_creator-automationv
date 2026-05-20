import type { LlmClient } from "../ai/llm-client";
import { CREATOR_ASSISTANT_SYSTEM_PROMPT } from "../ai/prompts/system";
import type { TavilySearchClient } from "../research/search-client";
import type { TelegramClient } from "../telegram/client";

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: {
      id: number;
      type: string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    from?: {
      id: number;
      is_bot: boolean;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  };
}

export interface HandleTelegramCommandResult {
  handled: boolean;
  reason?: string;
  chatId?: string;
  responseText?: string;
}

export interface HandleTelegramCommandDependencies {
  llm: LlmClient;
  search: TavilySearchClient;
  telegram: TelegramClient;
}

const MAX_TELEGRAM_MESSAGE_LENGTH = 3900;

export async function handleTelegramCommand(
  update: TelegramUpdate,
  dependencies: HandleTelegramCommandDependencies
): Promise<HandleTelegramCommandResult> {
  const message = update.message;
  const text = message?.text?.trim();

  if (!message || !text) {
    return {
      handled: false,
      reason: "No text message found"
    };
  }

  const chatId = String(message.chat.id);

  if (text === "/start") {
    const responseText = [
      "已连接。你可以直接发需求，例如：",
      "",
      "今天 x.com 有哪些热门 AI 话题？",
      "帮我基于这个话题写一条小红书脚本",
      "给我 10 个适合知识博主的选题"
    ].join("\n");

    await dependencies.telegram.sendMessage(responseText, { chatId });

    return {
      handled: true,
      chatId,
      responseText
    };
  }

  await dependencies.telegram.sendMessage("收到，正在搜索和生成内容。", {
    chatId
  });

  const searchResults = await dependencies.search.search({
    query: text,
    maxResults: 10,
    searchDepth: "advanced"
  });

  const generated = await dependencies.llm.generateText({
    systemPrompt: CREATOR_ASSISTANT_SYSTEM_PROMPT,
    maxTokens: 2200,
    temperature: 0.45,
    prompt: buildCommandPrompt(text, searchResults)
  });

  const responseText = truncateTelegramMessage(generated.text);

  await dependencies.telegram.sendMessage(responseText, {
    chatId,
    disableWebPagePreview: true
  });

  return {
    handled: true,
    chatId,
    responseText
  };
}

function buildCommandPrompt(
  userRequest: string,
  searchResults: Array<{
    title: string;
    url: string;
    content: string;
    score?: number;
  }>
): string {
  const sources =
    searchResults.length > 0
      ? searchResults
          .map((result, index) =>
            [
              `#${index + 1} ${result.title}`,
              `URL: ${result.url}`,
              `摘要: ${result.content}`
            ].join("\n")
          )
          .join("\n\n")
      : "没有搜索结果。";

  return [
    "用户通过 Telegram 发来一个内容创作需求。",
    "",
    "你的任务：",
    "- 如果用户要热点或话题，给出清晰的候选话题列表。",
    "- 如果用户要脚本，直接写出可发布的中文脚本。",
    "- 明确标注哪些判断来自搜索结果，哪些是你的推断。",
    "- 输出要适合 Telegram 阅读，短段落、可直接复制使用。",
    "- 不要编造无法从资料支撑的实时数据。",
    "",
    "用户需求：",
    userRequest,
    "",
    "搜索资料：",
    sources,
    "",
    "请给出最终回复。"
  ].join("\n");
}

function truncateTelegramMessage(text: string): string {
  if (text.length <= MAX_TELEGRAM_MESSAGE_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH - 80)}\n\n内容较长，已截断。`;
}
