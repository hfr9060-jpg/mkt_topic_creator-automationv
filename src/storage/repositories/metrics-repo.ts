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
