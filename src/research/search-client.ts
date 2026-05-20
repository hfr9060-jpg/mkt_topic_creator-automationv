import type { AppConfig } from "../config/env";
import { logger, type Logger } from "../utils/logger";

export interface TavilySearchClientOptions {
  apiKey: string;
  logger?: Logger;
}

export interface SearchInput {
  query: string;
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
}

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

interface TavilySearchResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    score?: number;
  }>;
  error?: string;
}

export class TavilySearchClient {
  private readonly apiKey: string;
  private readonly logger: Logger;

  constructor(options: TavilySearchClientOptions) {
    this.apiKey = options.apiKey;
    this.logger = options.logger ?? logger;
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const query = input.query.trim();

    if (query.length === 0) {
      throw new Error("Search query cannot be empty");
    }

    this.logger.info("Tavily search started", {
      query,
      maxResults: input.maxResults ?? 5
    });

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: input.maxResults ?? 5,
        search_depth: input.searchDepth ?? "basic",
        include_answer: false,
        include_raw_content: false
      })
    });

    const payload = (await response.json()) as TavilySearchResponse;

    if (!response.ok) {
      throw new Error(payload.error ?? `Tavily request failed: ${response.status}`);
    }

    const results =
      payload.results?.flatMap((result) => {
        if (!result.title || !result.url || !result.content) {
          return [];
        }

        return [
          {
            title: result.title,
            url: result.url,
            content: result.content,
            score: result.score
          }
        ];
      }) ?? [];

    this.logger.info("Tavily search completed", {
      query,
      resultCount: results.length
    });

    return results;
  }
}

export function createSearchClient(config: AppConfig): TavilySearchClient {
  if (!config.tavily) {
    throw new Error("TAVILY_API_KEY is required to use search");
  }

  return new TavilySearchClient({
    apiKey: config.tavily.apiKey
  });
}
