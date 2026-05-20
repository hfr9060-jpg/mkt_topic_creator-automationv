import type { Env } from "../config/env";

export class D1Store {
  constructor(private readonly db: D1Database) {}

  async first<T extends object>(
    sql: string,
    ...bindings: unknown[]
  ): Promise<T | null> {
    return this.db
      .prepare(sql)
      .bind(...bindings)
      .first<T>();
  }

  async all<T extends object>(
    sql: string,
    ...bindings: unknown[]
  ): Promise<T[]> {
    const result = await this.db
      .prepare(sql)
      .bind(...bindings)
      .all<T>();

    return result.results ?? [];
  }

  async run(sql: string, ...bindings: unknown[]): Promise<D1Result> {
    return this.db
      .prepare(sql)
      .bind(...bindings)
      .run();
  }

  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    return this.db.batch<T>(statements);
  }

  prepare(sql: string): D1PreparedStatement {
    return this.db.prepare(sql);
  }
}

export function getD1Store(env: Env): D1Store {
  if (!env.DB) {
    throw new Error("Missing D1 database binding: DB");
  }

  return new D1Store(env.DB);
}
