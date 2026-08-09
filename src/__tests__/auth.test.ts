import { describe, expect, it } from "vitest";
import {
  AUTH_STATE_TTL_MS,
  AuthStateError,
  REDIRECT_URI,
  SCOPES,
  TokenData,
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

    expect(params.get("scope")).toBe("offline read:workout");
    for (const unwanted of ["read:cycles", "read:recovery", "read:sleep", "read:body_measurement", "read:profile"]) {
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
