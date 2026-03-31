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

/** Session expires after 1 hour of inactivity from login */
export const SESSION_TTL_MS = 60 * 60 * 1000;

export type StoredAuth = {
  user: AuthUser;
  token: string;
  loginAt?: number;
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
  const payload: StoredAuth = {
    ...data,
    loginAt: options?.preserveLoginAt && existing?.loginAt ? existing.loginAt : (data.loginAt ?? Date.now()),
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
  localStorage.setItem(TOKEN_KEY, data.token);
}

export function isSessionExpired(): boolean {
  const stored = getStoredAuth();
  if (!stored?.loginAt) return false;
  return Date.now() - stored.loginAt > SESSION_TTL_MS;
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
