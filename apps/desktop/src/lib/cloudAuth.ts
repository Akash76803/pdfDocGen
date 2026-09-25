import { invoke } from '@tauri-apps/api/tauri';

const DEV_REFRESH_TOKEN_KEY = 'document-builder.cloud-auth-refresh-token.dev-session.v1';
const DEV_API_TOKEN_KEY = 'document-builder.cloud-api-token.dev-session.v1';
const AUTH_EVENT = 'document-builder:cloud-auth-changed';

type IdentitySignInResponse = {
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  email?: string;
};

type IdentityRefreshResponse = {
  id_token: string;
  refresh_token: string;
  expires_in: string;
};

export type CloudAuthState = {
  signedIn: boolean;
  email?: string;
};

let cachedIdToken: string | null = null;
let cachedExpiresAt = 0;
let cachedEmail: string | undefined;

function googleOAuthClientId(): string {
  const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID?.trim();
  console.log('[cloudAuth] Read googleOAuthClientId:', clientId);
  if (!clientId) throw new Error('Google verification is not configured.');
  return clientId;
}

function googleOAuthClientSecret(): string | undefined {
  const secret = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  return secret || undefined;
}

export async function verifyWithGoogle(): Promise<string> {
  console.log('[cloudAuth] verifyWithGoogle started...');
  if (!isTauriRuntime()) {
    throw new Error('Google verification requires the Tauri Desktop app runtime (must be run inside the Tauri desktop window).');
  }
  try {
    const clientId = googleOAuthClientId();
    const clientSecret = googleOAuthClientSecret();
    console.log('[cloudAuth] Invoking google_oauth_verify with configured Desktop OAuth client ID, hasSecret:', Boolean(clientSecret));
    const token = await invoke<string>('google_oauth_verify', { clientId, clientSecret });
    console.log('[cloudAuth] google_oauth_verify returned token');
    return token;
  } catch (error) {
    console.error('[cloudAuth] google_oauth_verify error:', error);
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

function apiKey(): string {
  const key = import.meta.env.VITE_IDENTITY_PLATFORM_API_KEY?.trim();
  if (!key) throw new Error('Desktop cloud sign-in is not configured. Missing VITE_IDENTITY_PLATFORM_API_KEY.');
  return key;
}

export function isTauriRuntime(): boolean {
  const isAvailable = typeof window !== 'undefined' && typeof (window as unknown as { __TAURI_IPC__?: unknown }).__TAURI_IPC__ === 'function';
  console.log('[cloudAuth] isTauriRuntime check: __TAURI_IPC__ function available =', isAvailable);
  return isAvailable;
}

export async function testTauriIpcSmoke(): Promise<string> {
  console.log('[cloudAuth] testTauriIpcSmoke starting...');
  if (!isTauriRuntime()) {
    throw new Error('Tauri IPC is not available in this window (not running inside Tauri native desktop app).');
  }
  const result = await invoke<string>('tauri_ipc_smoke');
  console.log('[cloudAuth] testTauriIpcSmoke result:', result);
  return result;
}
async function storeRefreshToken(token: string): Promise<void> {
  if (isTauriRuntime()) {
    await invoke('cloud_auth_store_refresh_token', { refreshToken: token });
    return;
  }
  window.sessionStorage.setItem(DEV_REFRESH_TOKEN_KEY, token);
}

async function readRefreshToken(): Promise<string | null> {
  if (isTauriRuntime()) {
    return await invoke<string | null>('cloud_auth_read_refresh_token');
  }
  return window.sessionStorage.getItem(DEV_REFRESH_TOKEN_KEY);
}

async function clearRefreshToken(): Promise<void> {
  if (isTauriRuntime()) {
    await invoke('cloud_auth_clear_refresh_token');
    return;
  }
  window.sessionStorage.removeItem(DEV_REFRESH_TOKEN_KEY);
}

function decodeJwtEmail(token: string): string | undefined {
  try {
    const payload = token.split('.')[1];
    if (!payload) return undefined;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as { email?: unknown };
    return typeof decoded.email === 'string' ? decoded.email : undefined;
  } catch {
    return undefined;
  }
}

function setCachedSession(idToken: string, expiresInSeconds: string, email?: string) {
  cachedIdToken = idToken;
  const seconds = Math.max(60, Number(expiresInSeconds) || 3600);
  cachedExpiresAt = Date.now() + seconds * 1000;
  cachedEmail = email ?? decodeJwtEmail(idToken);
}

function emitAuthChanged() {
  window.dispatchEvent(new CustomEvent(AUTH_EVENT));
}

async function readIdentityError(response: Response): Promise<Error> {
  try {
    const body = await response.json() as { error?: { message?: string } };
    const code = body.error?.message ?? 'AUTH_FAILED';
    const friendly = code === 'INVALID_LOGIN_CREDENTIALS' || code === 'EMAIL_NOT_FOUND' || code === 'INVALID_PASSWORD'
      ? 'Email or password is incorrect.'
      : code === 'USER_DISABLED'
        ? 'This cloud account is disabled.'
        : code === 'TOO_MANY_ATTEMPTS_TRY_LATER'
          ? 'Too many sign-in attempts. Try again later.'
          : `Cloud sign-in failed: ${code}`;
    return new Error(friendly);
  } catch {
    return new Error(`Cloud sign-in failed (${response.status}).`);
  }
}

export async function signInToCloud(email: string, password: string): Promise<CloudAuthState> {
  const normalizedEmail = email.trim();
  if (!normalizedEmail || !password) throw new Error('Enter your email and password.');
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey())}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: normalizedEmail, password, returnSecureToken: true }),
  });
  if (!response.ok) throw await readIdentityError(response);
  const result = await response.json() as IdentitySignInResponse;
  if (!result.idToken || !result.refreshToken) throw new Error('Cloud sign-in returned an invalid session.');
  await storeRefreshToken(result.refreshToken);
  setCachedSession(result.idToken, result.expiresIn, result.email ?? normalizedEmail);
  emitAuthChanged();
  return { signedIn: true, ...(cachedEmail ? { email: cachedEmail } : {}) };
}

async function refreshCloudSession(): Promise<string | null> {
  const refreshToken = await readRefreshToken();
  if (!refreshToken) return null;
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey())}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    await clearRefreshToken();
    cachedIdToken = null;
    cachedExpiresAt = 0;
    cachedEmail = undefined;
    emitAuthChanged();
    throw new Error('Cloud session expired. Please sign in again.');
  }
  const result = await response.json() as IdentityRefreshResponse;
  if (!result.id_token || !result.refresh_token) throw new Error('Cloud token refresh returned an invalid session.');
  await storeRefreshToken(result.refresh_token);
  setCachedSession(result.id_token, result.expires_in);
  return result.id_token;
}

export async function getCloudAccessToken(): Promise<string | null> {
  if (cachedIdToken && Date.now() < cachedExpiresAt - 60_000) return cachedIdToken;
  return await refreshCloudSession();
}

export async function getCloudAuthState(): Promise<CloudAuthState> {
  try {
    const token = await getCloudAccessToken();
    return token ? { signedIn: true, ...(cachedEmail ? { email: cachedEmail } : {}) } : { signedIn: false };
  } catch {
    return { signedIn: false };
  }
}

export async function signOutFromCloud(): Promise<void> {
  await clearRefreshToken();
  cachedIdToken = null;
  cachedExpiresAt = 0;
  cachedEmail = undefined;
  emitAuthChanged();
}



export type IssuedIntegrationToken = {
  token: string;
  tokenId: string;
  label: string;
  createdAt: string;
  warning?: string;
};

async function storeApiToken(token: string): Promise<void> {
  if (isTauriRuntime()) {
    await invoke('cloud_auth_store_api_token', { apiToken: token });
    return;
  }
  window.sessionStorage.setItem(DEV_API_TOKEN_KEY, token);
}

export async function getIntegrationApiToken(): Promise<string | null> {
  if (isTauriRuntime()) return await invoke<string | null>('cloud_auth_read_api_token');
  return window.sessionStorage.getItem(DEV_API_TOKEN_KEY);
}

export async function clearIntegrationApiToken(): Promise<void> {
  if (isTauriRuntime()) {
    await invoke('cloud_auth_clear_api_token');
  } else {
    window.sessionStorage.removeItem(DEV_API_TOKEN_KEY);
  }
  emitAuthChanged();
}

export async function generateIntegrationApiToken(apiBaseUrl: string, label = 'Desktop + ERP integration'): Promise<IssuedIntegrationToken> {
  console.log('[cloudAuth] generateIntegrationApiToken starting, apiBaseUrl:', apiBaseUrl);
  const identityToken = await verifyWithGoogle();
  console.log('[cloudAuth] Received identityToken from verifyWithGoogle, length:', identityToken?.length);
  const response = await fetch(`${apiBaseUrl.replace(/\/+$/, '')}/api/v1/auth/tokens`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-pdfdocgen-authorization': `Bearer ${identityToken}`,
    },
    body: JSON.stringify({ label }),
  });
  if (!response.ok) {
    let message = `API token generation failed (${response.status}).`;
    try {
      const body = await response.json() as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch { }
    throw new Error(message);
  }
  const issued = await response.json() as IssuedIntegrationToken;
  if (!issued.token?.startsWith('pdfdg_')) throw new Error('API returned an invalid integration token.');
  await storeApiToken(issued.token);
  emitAuthChanged();
  return issued;
}

export async function revokeIntegrationApiToken(apiBaseUrl: string): Promise<void> {
  const token = await getIntegrationApiToken();
  if (!token) {
    await clearIntegrationApiToken();
    return;
  }
  const response = await fetch(`${apiBaseUrl.replace(/\/+$/, '')}/api/v1/auth/tokens/current`, {
    method: 'DELETE',
    headers: { 'x-pdfdocgen-authorization': `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 404) throw new Error(`Unable to revoke API token (${response.status}).`);
  await clearIntegrationApiToken();
}

export const CLOUD_AUTH_EVENT = AUTH_EVENT;
