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

interface ParsedResponseBody<T> {
  text: string;
  json?: T;
  parseError?: string;
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

    const endpoint = "https://api.tavily.com/search";
    let response: Response;

    try {
      this.logger.info("Tavily search request started", {
        endpoint,
        query,
        maxResults: input.maxResults ?? 5,
        searchDepth: input.searchDepth ?? "basic"
      });

      response = await fetch(endpoint, {
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
    } catch (error) {
      this.logger.error("Tavily search fetch threw before response", {
        endpoint,
        query,
        error
      });
      throw error;
    }

    const contentType = response.headers.get("content-type");
    const body = await readResponseBody<TavilySearchResponse>(response, "Tavily");

    this.logger.info("Tavily search response received", {
      endpoint,
      query,
      status: response.status,
      ok: response.ok,
      contentType,
      responseBody: body.text,
      jsonParseError: body.parseError
    });

    if (!response.ok) {
      throw new Error(
        body.json?.error ?? `Tavily request failed: ${response.status}. Body: ${body.text}`
      );
    }

    if (!body.json) {
      throw new Error(buildJsonParseFailureMessage("Tavily", body));
    }

    const payload = body.json;

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

async function readResponseBody<T>(
  response: Response,
  apiName: string
): Promise<ParsedResponseBody<T>> {
  const text = await response.text();

  console.log(`${apiName} API response:`, text);

  if (text.trim().length === 0) {
    return {
      text,
      parseError: `${apiName} returned an empty response`
    };
  }

  try {
    return {
      text,
      json: JSON.parse(text) as T
    };
  } catch (error) {
    return {
      text,
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}

function buildJsonParseFailureMessage(
  apiName: string,
  body: ParsedResponseBody<unknown>
): string {
  if (body.text.trim().length === 0) {
    return `${apiName} returned an empty response`;
  }

  return `${apiName} returned a non-JSON response. Parse error: ${
    body.parseError ?? "unknown"
  }. Body: ${body.text}`;
}
