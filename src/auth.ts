import { requestUrl } from "obsidian";

const TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";

/** This plugin only reads workouts, so it only asks for workout scope. */
export const SCOPES = "offline read:workout";

/** obsidian://<this> — must match the redirect URI registered with WHOOP. */
export const CALLBACK_ACTION = "whoop-workout-callback";
export const REDIRECT_URI = `obsidian://${CALLBACK_ACTION}`;

/** How long a pending authorization attempt stays valid. */
export const AUTH_STATE_TTL_MS = 10 * 60 * 1000;

/** Refresh the access token this long before it actually expires. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  /** Unix timestamp in ms. */
  expires_at: number;
}

export interface AuthSettings {
  clientId: string;
  clientSecret: string;
  tokens: TokenData | null;
}

/** An authorization attempt awaiting its callback. */
export interface PendingAuth {
  state: string;
  createdAt: number;
}

export class AuthStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthStateError";
  }
}

function randomState(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function buildAuthUrl(clientId: string): { url: string; state: string } {
  const state = randomState();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state,
  });
  return { url: `${AUTH_URL}?${params.toString()}`, state };
}

/**
 * Validates the `state` returned by the authorization server against the one we
 * generated. Anyone can fire an `obsidian://` URL at a running Obsidian, so an
 * unvalidated callback lets a third party trade their own authorization code
 * for tokens stored under this vault's settings.
 */
export function validateState(
  pending: PendingAuth | null,
  returnedState: string | undefined,
  now: number = Date.now()
): void {
  if (!pending) {
    throw new AuthStateError(
      "Received a WHOOP callback without a pending authorization request. Ignored."
    );
  }
  if (now - pending.createdAt > AUTH_STATE_TTL_MS) {
    throw new AuthStateError(
      "The authorization request expired. Start over from settings."
    );
  }
  if (!returnedState) {
    throw new AuthStateError(
      "The WHOOP callback did not include a state parameter. Ignored."
    );
  }
  if (!timingSafeEqual(returnedState, pending.state)) {
    throw new AuthStateError(
      "The WHOOP callback state did not match. Ignored — this request did not come from your authorization attempt."
    );
  }
}

/** Constant-time string comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function postToken(body: URLSearchParams, label: string): Promise<TokenData> {
  const resp = await requestUrl({
    url: TOKEN_URL,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    throw: false,
  });

  if (resp.status !== 200) {
    throw new Error(`${label} failed: ${resp.status} ${resp.text?.slice(0, 300) ?? ""}`);
  }

  const data = resp.json as Omit<TokenData, "expires_at">;
  return { ...data, expires_at: Date.now() + data.expires_in * 1000 };
}

export function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string = REDIRECT_URI
): Promise<TokenData> {
  return postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    "Token exchange"
  );
}

export function refreshTokens(
  tokens: TokenData,
  clientId: string,
  clientSecret: string
): Promise<TokenData> {
  return postToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
      // WHOOP requires the scope to be restated on refresh.
      scope: "offline",
    }),
    "Token refresh"
  );
}

/** True when the token is expired or within the refresh margin of expiring. */
export function needsRefresh(tokens: TokenData, now: number = Date.now()): boolean {
  return now + REFRESH_MARGIN_MS >= tokens.expires_at;
}

/** Returns a valid access token, refreshing first if needed. Throws if not connected. */
export async function getValidToken(
  auth: AuthSettings,
  saveTokens: (t: TokenData) => Promise<void>
): Promise<string> {
  if (!auth.tokens) {
    throw new Error("Not connected to WHOOP. Connect in Settings → WHOOP workout insert.");
  }

  if (needsRefresh(auth.tokens)) {
    const refreshed = await refreshTokens(auth.tokens, auth.clientId, auth.clientSecret);
    await saveTokens(refreshed);
    return refreshed.access_token;
  }

  return auth.tokens.access_token;
}
