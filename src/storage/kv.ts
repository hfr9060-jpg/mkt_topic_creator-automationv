import type { Env } from "../config/env";

export class KvStore {
  constructor(private readonly namespace: KVNamespace) {}

  async getText(key: string): Promise<string | null> {
    return this.namespace.get(key);
  }

  async getJson<T>(key: string): Promise<T | null> {
    return this.namespace.get<T>(key, "json");
  }

  async putText(
    key: string,
    value: string,
    options?: KVNamespacePutOptions
  ): Promise<void> {
    await this.namespace.put(key, value, options);
  }

  async putJson<T>(
    key: string,
    value: T,
    options?: KVNamespacePutOptions
  ): Promise<void> {
    await this.namespace.put(key, JSON.stringify(value), options);
  }

  async delete(key: string): Promise<void> {
    await this.namespace.delete(key);
  }
}

export function getKvStore(env: Env): KvStore {
  if (!env.CREATOR_AUTOMATION_KV) {
    throw new Error("Missing KV namespace binding: CREATOR_AUTOMATION_KV");
  }

  return new KvStore(env.CREATOR_AUTOMATION_KV);
}
