"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { OutreachReportPayload } from "./outreach-report-types";

const INCLUDE_ALL = "sales,returns,dispenses,snapshot";

type Branch = { id: number; name: string };

function defaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const from = `${y}-${pad(m + 1)}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const to = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
  return { from, to };
}

type Ctx = {
  branches: Branch[];
  branchId: string;
  setBranchId: (v: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  teamId: string;
  setTeamId: (v: string) => void;
  teams: { id: number; name: string }[];
  data: OutreachReportPayload | null;
  loading: boolean;
  error: string;
  refetch: () => Promise<void>;
  includeQuery: string;
};

const OutreachReportContext = createContext<Ctx | null>(null);

export function useOutreachReport() {
  const ctx = useContext(OutreachReportContext);
  if (!ctx) {
    throw new Error("useOutreachReport must be used within /reports/outreach layout");
  }
  return ctx;
}

export function OutreachReportsProvider({ children }: { children: React.ReactNode }) {
  const { hasPermission } = useAuth();
  const includeQuery = INCLUDE_ALL;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [range, setRange] = useState(defaultDateRange);
  const dateFrom = range.from;
  const dateTo = range.to;
  const setDateFrom = useCallback((v: string) => {
    setRange((r) => ({ ...r, from: v }));
  }, []);
  const setDateTo = useCallback((v: string) => {
    setRange((r) => ({ ...r, to: v }));
  }, []);
  const [teamId, setTeamId] = useState("");
  const [teams, setTeams] = useState<{ id: number; name: string }[]>([]);
  const [data, setData] = useState<OutreachReportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const url = hasPermission("settings.manage") ? "/api/branches?all=true" : "/api/branches";
    authFetch(url).then(async (res) => {
      if (!res.ok) return;
      const b: Branch[] = await res.json();
      setBranches(b);
      setBranchId((prev) => {
        if (prev && b.some((x) => String(x.id) === prev)) return prev;
        return b[0] ? String(b[0].id) : "";
      });
    });
  }, [hasPermission]);

  useEffect(() => {
    if (!branchId) {
      setTeams([]);
      return;
    }
    authFetch(`/api/outreach/teams?branchId=${encodeURIComponent(branchId)}&activeOnly=false`).then(
      async (res) => {
        if (!res.ok) return;
        const t = await res.json();
        setTeams(
          Array.isArray(t) ? t.map((x: { id: number; name: string }) => ({ id: x.id, name: x.name })) : []
        );
      }
    );
  }, [branchId]);

  const refetch = useCallback(async () => {
    if (!branchId || !dateFrom || !dateTo) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        branchId,
        from: dateFrom,
        to: dateTo,
        include: includeQuery,
      });
      if (teamId) params.set("teamId", teamId);
      const res = await authFetch(`/api/reports/outreach-inventory?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load");
        setData(null);
        return;
      }
      setData(json as OutreachReportPayload);
    } finally {
      setLoading(false);
    }
  }, [branchId, dateFrom, dateTo, teamId, includeQuery]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const value = useMemo(
    () =>
      ({
        branches,
        branchId,
        setBranchId,
        dateFrom,
        setDateFrom,
        dateTo,
        setDateTo,
        teamId,
        setTeamId,
        teams,
        data,
        loading,
        error,
        refetch,
        includeQuery,
      }) satisfies Ctx,
    [
      branches,
      branchId,
      dateFrom,
      dateTo,
      setDateFrom,
      setDateTo,
      teamId,
      teams,
      data,
      loading,
      error,
      refetch,
      includeQuery,
    ]
  );

  return (
    <OutreachReportContext.Provider value={value}>{children}</OutreachReportContext.Provider>
  );
}
