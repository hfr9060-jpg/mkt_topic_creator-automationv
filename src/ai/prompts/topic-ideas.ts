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
