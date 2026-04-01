"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  AuthUser,
  clearStoredAuth,
  getStoredAuth,
  setStoredAuth,
  getStoredToken,
  isSessionExpired,
} from "@/types/auth";
import { isAdminRoleName } from "@/lib/admin-role";

type AuthContextType = {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const forceLogoutAndRedirect = useCallback(() => {
    clearStoredAuth();
    setUser(null);
    setToken(null);
    setIsLoading(false);
    router.replace("/signin");
  }, [router]);

  const refreshUser = useCallback(async () => {
    const t = getStoredToken();
    if (!t) {
      setUser(null);
      setToken(null);
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        const auth = { user: data.user, token: t };
        setStoredAuth(auth, { preserveLoginAt: true });
        setUser(data.user);
        setToken(t);
      } else {
        clearStoredAuth();
        setUser(null);
        setToken(null);
      }
    } catch {
      clearStoredAuth();
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = getStoredAuth();
    if (stored?.user && stored?.token) {
      if (isSessionExpired()) {
        forceLogoutAndRedirect();
        return;
      }
      setUser(stored.user);
      setToken(stored.token);
      refreshUser();
    } else {
      setIsLoading(false);
    }
  }, [refreshUser, forceLogoutAndRedirect]);

  // Session expiry: check every minute and on tab focus; logout and redirect after 1 hour
  useEffect(() => {
    const check = () => {
      if (getStoredToken() && isSessionExpired()) {
        forceLogoutAndRedirect();
      }
    };
    const interval = setInterval(check, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [forceLogoutAndRedirect]);

  const login = useCallback(
    async (email: string, password: string): Promise<{ error?: string }> => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { error: data.error || "Login failed" };
        }
        setStoredAuth({ user: data.user, token: data.token, loginAt: Date.now() });
        setUser(data.user);
        setToken(data.token);
        setIsLoading(false);
        return {};
      } catch (e) {
        return { error: "Network error" };
      }
    },
    []
  );

  const logout = useCallback(() => {
    clearStoredAuth();
    setUser(null);
    setToken(null);
  }, []);

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!user?.permissions) return false;
      if (user.permissions.includes("admin") || user.permissions.includes("*"))
        return true;
      // Admin role: match server-side userHasPermission (menus, audit pages, settings)
      if (isAdminRoleName(user.roleName)) return true;
      return user.permissions.includes(permission);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        refreshUser,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
