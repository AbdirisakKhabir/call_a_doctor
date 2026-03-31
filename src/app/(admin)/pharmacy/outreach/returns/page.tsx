"use client";

import React, { useEffect, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type Branch = { id: number; name: string };

type InvLine = {
  productId: number;
  name: string;
  code: string;
  maxQty: number;
  returnQty: number;
};

type Team = {
  id: number;
  name: string;
  inventory: { productId: number; quantity: number; product: { id: number; name: string; code: string } }[];
};

export default function OutreachReturnsPage() {
  const { hasPermission } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [lines, setLines] = useState<InvLine[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadBranches() {
    const url = hasPermission("settings.manage") ? "/api/branches?all=true" : "/api/branches";
    const res = await authFetch(url);
    if (res.ok) {
      const data: Branch[] = await res.json();
      setBranches(data);
      setBranchId((prev) => {
        if (prev && data.some((b) => String(b.id) === prev)) return prev;
        return data[0] ? String(data[0].id) : "";
      });
    }
  }

  async function loadTeams() {
    if (!branchId) {
      setTeams([]);
      return;
    }
    const res = await authFetch(
      `/api/outreach/teams?branchId=${encodeURIComponent(branchId)}&activeOnly=true`
    );
    if (res.ok) {
      const data: Team[] = await res.json();
      setTeams(data);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadBranches().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadTeams();
  }, [branchId]);

  useEffect(() => {
    const t = teams.find((x) => String(x.id) === teamId);
    if (!t) {
      setLines([]);
      return;
    }
    setLines(
      t.inventory.map((i) => ({
        productId: i.productId,
        name: i.product.name,
        code: i.product.code,
        maxQty: i.quantity,
        returnQty: 0,
      }))
    );
  }, [teamId, teams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!branchId || !teamId) {
      setError("Select branch and team.");
      return;
    }
    const items = lines
      .filter((l) => l.returnQty > 0)
      .map((l) => ({ productId: l.productId, quantity: l.returnQty }));
    if (items.length === 0) {
      setError("Enter quantity to return for at least one product.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch("/api/outreach/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: Number(branchId),
          teamId: Number(teamId),
          notes: notes.trim() || null,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed");
        return;
      }
      setSuccess(`Return #${data.id} recorded. Pharmacy stock restored and team credit reduced.`);
      setNotes("");
      await loadTeams();
    } finally {
      setSubmitting(false);
    }
  }

  function setReturnQty(productId: number, v: number) {
    setLines((prev) =>
      prev.map((l) =>
        l.productId === productId
          ? { ...l, returnQty: Math.max(0, Math.min(l.maxQty, Math.floor(v))) }
          : l
      )
    );
  }

  if (!hasPermission("pharmacy.pos")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Outreach return" />
        <p className="mt-6 text-sm text-gray-500">You do not have permission.</p>
      </div>
    );
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="Return stock to pharmacy" />
      <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
        When an outreach team brings medication back, record it here. Pharmacy shelf quantity increases, bag
        quantity decreases, and the team&apos;s accounts receivable is reduced by the value of the return.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-8 max-w-3xl space-y-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/3"
      >
        {error && (
          <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-500/10 dark:text-green-300">
            {success}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Branch</Label>
            <select
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setTeamId("");
              }}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              disabled={loading}
            >
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Outreach team</Label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="">Select team…</option>
              {teams.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {teamId && lines.length === 0 ? (
          <p className="text-sm text-gray-500">This team has no stock in the bag to return.</p>
        ) : null}

        {lines.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-2 pr-3">Product</th>
                  <th className="pb-2 pr-3">In bag</th>
                  <th className="pb-2">Return qty</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.productId} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2 pr-3">
                      <span className="font-medium">{l.name}</span>
                      <span className="ml-2 text-xs text-gray-500">{l.code}</span>
                    </td>
                    <td className="py-2 pr-3">{l.maxQty}</td>
                    <td className="py-2">
                      <input
                        type="number"
                        min={0}
                        max={l.maxQty}
                        value={l.returnQty || ""}
                        onChange={(e) => setReturnQty(l.productId, Number(e.target.value))}
                        className="h-9 w-24 rounded-lg border border-gray-200 px-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div>
          <Label>Notes</Label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>

        <Button type="submit" disabled={submitting || !teamId || lines.length === 0} size="sm">
          {submitting ? "Saving…" : "Record return"}
        </Button>
      </form>
    </div>
  );
}
