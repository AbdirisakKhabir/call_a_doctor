"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authFetch } from "@/lib/api";
import {
  DEFAULT_EXPIRY_SOON_CONFIG,
  type ExpirySoonConfig,
} from "@/lib/expiry";

type ExpirySoonCtx = {
  config: ExpirySoonConfig;
  refresh: () => Promise<void>;
};

const ExpirySoonContext = createContext<ExpirySoonCtx>({
  config: DEFAULT_EXPIRY_SOON_CONFIG,
  refresh: async () => {},
});

export function ExpirySoonProvider({ children }: { children: React.ReactNode }) {
  const [cfg, setCfg] = useState<ExpirySoonConfig>(DEFAULT_EXPIRY_SOON_CONFIG);

  const refresh = useCallback(async () => {
    const res = await authFetch("/api/settings/expiry-soon");
    if (res.ok) {
      const data = await res.json();
      setCfg({
        mode: data.mode === "months" ? "months" : "days",
        days: Number(data.days) || DEFAULT_EXPIRY_SOON_CONFIG.days,
        months: Number(data.months) || DEFAULT_EXPIRY_SOON_CONFIG.months,
      });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = React.useMemo(
    () => ({ config: cfg, refresh }),
    [cfg, refresh]
  );

  return (
    <ExpirySoonContext.Provider value={value}>{children}</ExpirySoonContext.Provider>
  );
}

export function useExpirySoon(): ExpirySoonCtx {
  return useContext(ExpirySoonContext);
}
