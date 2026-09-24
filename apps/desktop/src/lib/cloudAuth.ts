import { invoke } from '@tauri-apps/api/tauri';

const DEV_REFRESH_TOKEN_KEY = 'document-builder.cloud-auth-refresh-token.dev-session.v1';
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

function apiKey(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string,string|undefined> }).env;
  const key = env?.VITE_IDENTITY_PLATFORM_API_KEY?.trim();
  if (!key) throw new Error('Desktop cloud sign-in is not configured. Missing VITE_IDENTITY_PLATFORM_API_KEY.');
  return key;
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
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
    const normalized = payload.replace(/-/g,'+').replace(/_/g,'/');
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as { email?:unknown };
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
    const body = await response.json() as { error?:{ message?:string } };
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
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({ email:normalizedEmail, password, returnSecureToken:true }),
  });
  if (!response.ok) throw await readIdentityError(response);
  const result = await response.json() as IdentitySignInResponse;
  if (!result.idToken || !result.refreshToken) throw new Error('Cloud sign-in returned an invalid session.');
  await storeRefreshToken(result.refreshToken);
  setCachedSession(result.idToken,result.expiresIn,result.email ?? normalizedEmail);
  emitAuthChanged();
  return { signedIn:true, ...(cachedEmail ? { email:cachedEmail } : {}) };
}

async function refreshCloudSession(): Promise<string | null> {
  const refreshToken = await readRefreshToken();
  if (!refreshToken) return null;
  const body = new URLSearchParams({ grant_type:'refresh_token', refresh_token:refreshToken });
  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey())}`, {
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body:body.toString(),
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
  setCachedSession(result.id_token,result.expires_in);
  return result.id_token;
}

export async function getCloudAccessToken(): Promise<string | null> {
  if (cachedIdToken && Date.now() < cachedExpiresAt - 60_000) return cachedIdToken;
  return await refreshCloudSession();
}

export async function getCloudAuthState(): Promise<CloudAuthState> {
  try {
    const token = await getCloudAccessToken();
    return token ? { signedIn:true, ...(cachedEmail ? { email:cachedEmail } : {}) } : { signedIn:false };
  } catch {
    return { signedIn:false };
  }
}

export async function signOutFromCloud(): Promise<void> {
  await clearRefreshToken();
  cachedIdToken = null;
  cachedExpiresAt = 0;
  cachedEmail = undefined;
  emitAuthChanged();
}

export const CLOUD_AUTH_EVENT = AUTH_EVENT;
