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
