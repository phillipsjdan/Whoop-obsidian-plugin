import { afterEach, describe, expect, it, vi } from "vitest";

const { requestUrl } = vi.hoisted(() => ({ requestUrl: vi.fn() }));
vi.mock("obsidian", () => ({ requestUrl }));

import { AuthError, NotFoundError, RateLimitError, WhoopClient } from "../client.ts";

function response(status: number, json: unknown = {}, headers: Record<string, string> = {}) {
  return { status, json, headers, text: "" };
}

/** Runs `work` with fake timers, letting every scheduled backoff elapse. */
async function withoutWaiting<T>(work: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  try {
    // Captured into a settled shape straight away: advancing the timers below
    // can reject the promise before an await would attach a handler, and vitest
    // reports that window as an unhandled rejection.
    const settled = work().then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error })
    );

    // Each pass releases one sleep; the client makes at most four attempts.
    for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(60_000);

    const result = await settled;
    if (result.ok) return result.value;
    throw result.error;
  } finally {
    vi.useRealTimers();
  }
}

afterEach(() => {
  requestUrl.mockReset();
});

describe("WhoopClient", () => {
  it("sends the token and returns the parsed body", async () => {
    requestUrl.mockResolvedValue(response(200, { records: [] }));

    await expect(new WhoopClient("tok").get("/activity/workout")).resolves.toEqual({
      records: [],
    });

    const call = requestUrl.mock.calls[0][0];
    expect(call.url).toBe(
      "https://api.prod.whoop.com/developer/v2/activity/workout"
    );
    expect(call.headers.Authorization).toBe("Bearer tok");
    // Status handling is impossible if requestUrl throws on non-2xx itself.
    expect(call.throw).toBe(false);
  });

  it("appends query parameters when there are any", async () => {
    requestUrl.mockResolvedValue(response(200));
    await new WhoopClient("tok").get("/cycle", { start: "a", limit: "25" });

    expect(requestUrl.mock.calls[0][0].url).toBe(
      "https://api.prod.whoop.com/developer/v2/cycle?start=a&limit=25"
    );
  });

  it("retries a 503 and returns the eventual success", async () => {
    requestUrl
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200, { ok: true }));

    await expect(withoutWaiting(() => new WhoopClient("tok").get("/x"))).resolves.toEqual(
      { ok: true }
    );
    expect(requestUrl).toHaveBeenCalledTimes(2);
  });

  it("gives up on a server error that never clears", async () => {
    requestUrl.mockResolvedValue(response(500));

    await expect(
      withoutWaiting(() => new WhoopClient("tok").get("/x"))
    ).rejects.toThrow(/500/);
    // The initial attempt plus three retries.
    expect(requestUrl).toHaveBeenCalledTimes(4);
  });

  it("backs off on 429 before succeeding", async () => {
    requestUrl
      .mockResolvedValueOnce(response(429, {}, { "Retry-After": "2" }))
      .mockResolvedValueOnce(response(200, { ok: true }));

    await expect(withoutWaiting(() => new WhoopClient("tok").get("/x"))).resolves.toEqual(
      { ok: true }
    );
  });

  it("raises a rate limit error once the retries run out", async () => {
    requestUrl.mockResolvedValue(response(429));

    await expect(
      withoutWaiting(() => new WhoopClient("tok").get("/x"))
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it("does not retry the statuses that will never change", async () => {
    for (const [status, error] of [
      [401, AuthError],
      [403, AuthError],
      [404, NotFoundError],
    ] as const) {
      requestUrl.mockReset();
      requestUrl.mockResolvedValue(response(status));

      await expect(new WhoopClient("tok").get("/x")).rejects.toBeInstanceOf(error);
      expect(requestUrl).toHaveBeenCalledTimes(1);
    }
  });

  it("does not retry a 400", async () => {
    requestUrl.mockResolvedValue(response(400));

    await expect(new WhoopClient("tok").get("/x")).rejects.toThrow(/400/);
    expect(requestUrl).toHaveBeenCalledTimes(1);
  });
});
