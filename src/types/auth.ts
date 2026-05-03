export type AuthUser = {
  id: number;
  email: string;
  name: string | null;
  roleId: number;
  roleName: string;
  permissions: string[];
  /** null = may use all branches; non-empty = restricted to these branch ids */
  branchIds?: number[] | null;
  /** Set when this user is linked to a Doctor record (login as doctor). */
  doctorId?: number | null;
};

export const AUTH_STORAGE_KEY = "call_a_doctor_auth";
export const TOKEN_KEY = "call_a_doctor_token";

/** Idle timeout: signed out after this long with no activity (clicks, keys, scrolls, or authenticated API calls). */
export const SESSION_IDLE_TTL_MS = 60 * 60 * 1000;

/** Throttle how often we persist activity to localStorage. */
const SESSION_ACTIVITY_PERSIST_MIN_MS = 15_000;

export type StoredAuth = {
  user: AuthUser;
  token: string;
  loginAt?: number;
  /** Last moment the user interacted or an authenticated request succeeded; drives idle expiry. */
  lastActivityAt?: number;
};

export function getStoredAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

export function setStoredAuth(data: StoredAuth, options?: { preserveLoginAt?: boolean }): void {
  if (typeof window === "undefined") return;
  const existing = options?.preserveLoginAt ? getStoredAuth() : null;
  const now = Date.now();
  const loginAt =
    options?.preserveLoginAt && existing?.loginAt ? existing.loginAt : (data.loginAt ?? now);
  const lastActivityAt =
    data.lastActivityAt !== undefined
      ? data.lastActivityAt
      : options?.preserveLoginAt
        ? existing?.lastActivityAt ?? existing?.loginAt ?? now
        : data.loginAt ?? now;
  const payload: StoredAuth = {
    ...data,
    loginAt,
    lastActivityAt,
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
  localStorage.setItem(TOKEN_KEY, data.token);
}

/** Call when the user uses the app (throttled) or pass force after a session validation / API success. */
export function touchSessionActivity(options?: { force?: boolean }): void {
  if (typeof window === "undefined") return;
  const stored = getStoredAuth();
  if (!stored?.token) return;
  const now = Date.now();
  const prev = stored.lastActivityAt ?? stored.loginAt ?? now;
  if (!options?.force && now - prev < SESSION_ACTIVITY_PERSIST_MIN_MS) return;
  const next: StoredAuth = { ...stored, lastActivityAt: now };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
}

export function isSessionExpired(): boolean {
  const stored = getStoredAuth();
  if (!stored?.token) return false;
  const last = stored.lastActivityAt ?? stored.loginAt;
  if (last == null) return false;
  return Date.now() - last > SESSION_IDLE_TTL_MS;
}

export function clearStoredAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
