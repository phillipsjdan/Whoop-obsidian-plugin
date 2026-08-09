import { requestUrl } from "obsidian";

const BASE_URL = "https://api.prod.whoop.com/developer/v2";
const MAX_RETRIES = 3;

export class NotFoundError extends Error {
  constructor(path: string) {
    super(`Not found: ${path}`);
    this.name = "NotFoundError";
  }
}

export class AuthError extends Error {
  constructor(message = "WHOOP rejected the access token. Reconnect in settings.") {
    super(message);
    this.name = "AuthError";
  }
}

export class RateLimitError extends Error {
  constructor(path: string) {
    super(`WHOOP API rate limit exceeded for ${path}. Try again in a minute.`);
    this.name = "RateLimitError";
  }
}

/** Minimal surface the fetch helpers need, so tests can substitute a fake. */
export interface ApiClient {
  get(path: string, params?: Record<string, string>): Promise<unknown>;
}

/**
 * Thin wrapper over Obsidian's requestUrl with exponential backoff on 429.
 *
 * requestUrl throws on non-2xx by default, which makes status-specific handling
 * impossible — `throw: false` keeps the response so we can branch on it.
 */
export class WhoopClient implements ApiClient {
  constructor(private readonly accessToken: string) {}

  async get(path: string, params?: Record<string, string>): Promise<unknown> {
    let url = BASE_URL + path;
    if (params && Object.keys(params).length > 0) {
      url += "?" + new URLSearchParams(params).toString();
    }

    let backoffMs = 1000;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const resp = await requestUrl({
        url,
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
        },
        throw: false,
      });

      if (resp.status === 429) {
        if (attempt < MAX_RETRIES) {
          await sleep(retryAfterMs(resp.headers) ?? backoffMs);
          backoffMs *= 2;
          continue;
        }
        throw new RateLimitError(path);
      }

      if (resp.status === 401 || resp.status === 403) {
        throw new AuthError();
      }

      if (resp.status === 404) {
        throw new NotFoundError(path);
      }

      if (resp.status < 200 || resp.status >= 300) {
        throw new Error(`WHOOP API returned ${resp.status} for ${path}`);
      }

      return resp.json;
    }

    throw new Error(`WHOOP API request failed for ${path}`);
  }
}

/** Parses a Retry-After header (seconds) into milliseconds, if present. */
export function retryAfterMs(
  headers: Record<string, string> | undefined
): number | null {
  if (!headers) return null;
  const key = Object.keys(headers).find(
    (k) => k.toLowerCase() === "retry-after"
  );
  if (!key) return null;
  const seconds = Number(headers[key]);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  // Cap so a hostile/odd header can't hang the UI for minutes.
  return Math.min(seconds, 60) * 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
