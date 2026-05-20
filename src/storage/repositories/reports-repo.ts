import { D1Store } from "../d1";

export type ReportType = "weekly" | "topic_ideas";

export interface GeneratedReport {
  id: string;
  type: ReportType;
  title: string;
  content: string;
  periodStart?: string;
  periodEnd?: string;
  metadataJson?: string;
  createdAt: string;
}

export interface CreateGeneratedReportInput {
  id: string;
  type: ReportType;
  title: string;
  content: string;
  periodStart?: string;
  periodEnd?: string;
  metadata?: unknown;
}

export interface ListReportsOptions {
  type?: ReportType;
  limit?: number;
}

interface GeneratedReportRow {
  id: string;
  type: ReportType;
  title: string;
  content: string;
  period_start: string | null;
  period_end: string | null;
  metadata_json: string | null;
  created_at: string;
}

export class ReportsRepository {
  constructor(private readonly store: D1Store) {}

  async create(input: CreateGeneratedReportInput): Promise<void> {
    await this.store.run(
      `INSERT INTO generated_reports (
        id,
        type,
        title,
        content,
        period_start,
        period_end,
        metadata_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        title = excluded.title,
        content = excluded.content,
        period_start = excluded.period_start,
        period_end = excluded.period_end,
        metadata_json = excluded.metadata_json,
        created_at = excluded.created_at`,
      input.id,
      input.type,
      input.title,
      input.content,
      input.periodStart ?? null,
      input.periodEnd ?? null,
      input.metadata === undefined ? null : JSON.stringify(input.metadata),
      new Date().toISOString()
    );
  }

  async findById(id: string): Promise<GeneratedReport | null> {
    const row = await this.store.first<GeneratedReportRow>(
      `SELECT
        id,
        type,
        title,
        content,
        period_start,
        period_end,
        metadata_json,
        created_at
      FROM generated_reports
      WHERE id = ?`,
      id
    );

    return row ? mapReportRow(row) : null;
  }

  async list(options: ListReportsOptions = {}): Promise<GeneratedReport[]> {
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (options.type) {
      conditions.push("type = ?");
      bindings.push(options.type);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(options.limit ?? 50, 200);

    const rows = await this.store.all<GeneratedReportRow>(
      `SELECT
        id,
        type,
        title,
        content,
        period_start,
        period_end,
        metadata_json,
        created_at
      FROM generated_reports
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ?`,
      ...bindings,
      limit
    );

    return rows.map(mapReportRow);
  }
}

function mapReportRow(row: GeneratedReportRow): GeneratedReport {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
    periodStart: row.period_start ?? undefined,
    periodEnd: row.period_end ?? undefined,
    metadataJson: row.metadata_json ?? undefined,
    createdAt: row.created_at
  };
}
