import { describe, expect, it } from "vitest";
import {
  AUTH_STATE_TTL_MS,
  AuthStateError,
  REDIRECT_URI,
  SCOPES,
  TokenData,
  TokenProvider,
  buildAuthUrl,
  needsRefresh,
  validateState,
} from "../auth.ts";

const NOW = Date.UTC(2026, 7, 9, 12, 0, 0);

function tokens(overrides: Partial<TokenData> = {}): TokenData {
  return {
    access_token: "access",
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
    scope: SCOPES,
    expires_at: NOW + 3_600_000,
    ...overrides,
  };
}

describe("buildAuthUrl", () => {
  it("requests only the scopes this plugin needs", () => {
    const { url } = buildAuthUrl("client-123");
    const params = new URL(url).searchParams;

    expect(params.get("scope")).toBe(
      "offline read:workout read:recovery read:sleep read:body_measurement"
    );
    // Read-only, and never the profile: the plugin has no use for who you are.
    for (const unwanted of ["read:cycles", "read:profile", "write:"]) {
      expect(url).not.toContain(unwanted);
    }
  });

  it("points at the plugin's own protocol handler", () => {
    const { url } = buildAuthUrl("client-123");
    const params = new URL(url).searchParams;

    expect(REDIRECT_URI).toBe("obsidian://whoop-workout-callback");
    expect(params.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(params.get("client_id")).toBe("client-123");
    expect(params.get("response_type")).toBe("code");
    expect(url.startsWith("https://api.prod.whoop.com/oauth/oauth2/auth?")).toBe(true);
  });

  it("generates a fresh, non-trivial state each time", () => {
    const first = buildAuthUrl("client-123").state;
    const second = buildAuthUrl("client-123").state;

    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(first).not.toBe(second);
  });
});

describe("validateState", () => {
  const pending = { state: "abc123", createdAt: NOW };

  it("accepts the state it issued", () => {
    expect(() => validateState(pending, "abc123", NOW + 1000)).not.toThrow();
  });

  it("rejects a callback with no pending request", () => {
    expect(() => validateState(null, "abc123", NOW)).toThrow(AuthStateError);
  });

  it("rejects a mismatched state", () => {
    expect(() => validateState(pending, "not-it", NOW)).toThrow(AuthStateError);
  });

  it("rejects a callback that carries no state at all", () => {
    expect(() => validateState(pending, undefined, NOW)).toThrow(AuthStateError);
    expect(() => validateState(pending, "", NOW)).toThrow(AuthStateError);
  });

  it("rejects a state of the right length but wrong content", () => {
    expect(() => validateState(pending, "abc124", NOW)).toThrow(AuthStateError);
  });

  it("rejects a state that is a prefix or extension of the real one", () => {
    expect(() => validateState(pending, "abc12", NOW)).toThrow(AuthStateError);
    expect(() => validateState(pending, "abc1234", NOW)).toThrow(AuthStateError);
  });

  it("expires a pending request after the TTL", () => {
    expect(() =>
      validateState(pending, "abc123", NOW + AUTH_STATE_TTL_MS - 1)
    ).not.toThrow();
    expect(() =>
      validateState(pending, "abc123", NOW + AUTH_STATE_TTL_MS + 1)
    ).toThrow(/expired/);
  });
});

describe("TokenProvider", () => {
  /** Builds a provider over mutable settings, counting refresh calls. */
  function harness(initial: TokenData | null, refreshImpl?: () => Promise<TokenData>) {
    const state = { tokens: initial };
    let calls = 0;
    const provider = new TokenProvider(
      () => ({ clientId: "id", clientSecret: "secret", tokens: state.tokens }),
      async (t) => {
        state.tokens = t;
      },
      async () => {
        calls++;
        return refreshImpl
          ? refreshImpl()
          : tokens({ access_token: `refreshed-${calls}`, expires_at: NOW + 3_600_000 });
      }
    );
    return {
      provider,
      state,
      refreshCalls: () => calls,
    };
  }

  it("returns the stored token while it is still fresh", async () => {
    const h = harness(tokens({ access_token: "still-good" }));
    await expect(h.provider.getAccessToken(NOW)).resolves.toBe("still-good");
    expect(h.refreshCalls()).toBe(0);
  });

  it("refreshes and persists when the token is near expiry", async () => {
    const h = harness(tokens({ expires_at: NOW + 60_000 }));

    await expect(h.provider.getAccessToken(NOW)).resolves.toBe("refreshed-1");
    expect(h.refreshCalls()).toBe(1);
    expect(h.state.tokens?.access_token).toBe("refreshed-1");
  });

  it("refuses when there is no stored token", async () => {
    const h = harness(null);
    await expect(h.provider.getAccessToken(NOW)).rejects.toThrow(/Not connected/);
  });

  it("collapses concurrent refreshes into one call", async () => {
    // WHOOP rotates the refresh token, so a second concurrent refresh would
    // present one the server has already retired.
    let release!: (t: TokenData) => void;
    const gate = new Promise<TokenData>((resolve) => {
      release = resolve;
    });
    const h = harness(tokens({ expires_at: NOW + 60_000 }), () => gate);

    const all = Promise.all([
      h.provider.getAccessToken(NOW),
      h.provider.getAccessToken(NOW),
      h.provider.getAccessToken(NOW),
    ]);
    release(tokens({ access_token: "shared", expires_at: NOW + 3_600_000 }));

    await expect(all).resolves.toEqual(["shared", "shared", "shared"]);
    expect(h.refreshCalls()).toBe(1);
  });

  it("retries after a failed refresh rather than caching the failure", async () => {
    let attempt = 0;
    const h = harness(tokens({ expires_at: NOW + 60_000 }), async () => {
      attempt++;
      if (attempt === 1) throw new Error("network down");
      return tokens({ access_token: "second-try", expires_at: NOW + 3_600_000 });
    });

    await expect(h.provider.getAccessToken(NOW)).rejects.toThrow("network down");
    await expect(h.provider.getAccessToken(NOW)).resolves.toBe("second-try");
    expect(h.refreshCalls()).toBe(2);
  });

  it("stops refreshing once the stored token is fresh again", async () => {
    const h = harness(tokens({ expires_at: NOW + 60_000 }));

    await h.provider.getAccessToken(NOW);
    await h.provider.getAccessToken(NOW);

    expect(h.refreshCalls()).toBe(1);
  });
});

describe("needsRefresh", () => {
  it("is false while the token has more than five minutes left", () => {
    expect(needsRefresh(tokens({ expires_at: NOW + 10 * 60_000 }), NOW)).toBe(false);
  });

  it("is true within five minutes of expiry", () => {
    expect(needsRefresh(tokens({ expires_at: NOW + 4 * 60_000 }), NOW)).toBe(true);
    expect(needsRefresh(tokens({ expires_at: NOW + 5 * 60_000 }), NOW)).toBe(true);
  });

  it("is true for an already-expired token", () => {
    expect(needsRefresh(tokens({ expires_at: NOW - 1 }), NOW)).toBe(true);
  });
});
