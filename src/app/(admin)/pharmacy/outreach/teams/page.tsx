"use client";

import React, { useEffect, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";
import { PlusIcon } from "@/icons";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type Branch = { id: number; name: string };

type Member = { id: number; name: string; phone: string | null; role: string | null };

type Team = {
  id: number;
  name: string;
  phone: string | null;
  notes: string | null;
  creditBalance: number;
  isActive: boolean;
  members: Member[];
  inventory: { quantity: number; product: { name: string; code: string } }[];
};

export default function OutreachTeamsPage() {
  const { hasPermission } = useAuth();
  const { seesAllBranches } = useBranchScope();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamTotal, setTeamTotal] = useState(0);
  const [teamPage, setTeamPage] = useState(1);
  const teamPageSize = 20;
  const [loading, setLoading] = useState(true);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    notes: "",
    memberName: "",
    memberPhone: "",
  });

  const canManage =
    hasPermission("pharmacy.edit") || hasPermission("settings.manage");

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
      setTeamTotal(0);
      return;
    }
    const params = new URLSearchParams({
      branchId,
      activeOnly: "false",
      page: String(teamPage),
      pageSize: String(teamPageSize),
    });
    const res = await authFetch(`/api/outreach/teams?${params}`);
    if (res.ok) {
      const body = await res.json();
      setTeams(body.data ?? []);
      setTeamTotal(typeof body.total === "number" ? body.total : 0);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadBranches().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setTeamPage(1);
  }, [branchId]);

  useEffect(() => {
    setTeamsLoading(true);
    loadTeams().finally(() => setTeamsLoading(false));
  }, [branchId, teamPage]);

  function openAdd() {
    setForm({ name: "", phone: "", notes: "", memberName: "", memberPhone: "" });
    setError("");
    setModal(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!branchId || !form.name.trim()) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const members =
        form.memberName.trim().length > 0
          ? [{ name: form.memberName.trim(), phone: form.memberPhone.trim() || undefined }]
          : [];
      const res = await authFetch("/api/outreach/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: Number(branchId),
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          notes: form.notes.trim() || null,
          members,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed");
        return;
      }
      setModal(false);
      await loadTeams();
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(t: Team) {
    const res = await authFetch(`/api/outreach/teams/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !t.isActive }),
    });
    if (res.ok) await loadTeams();
  }

  if (!hasPermission("pharmacy.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Outreach teams" />
        <p className="mt-6 text-sm text-gray-500">You do not have permission.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Outreach teams" />
        <div className="flex flex-wrap items-center gap-2">
          {branches.length > 1 ? (
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-gray-600 dark:text-gray-400">{branches[0]?.name}</span>
          )}
          {canManage && (
            <Button size="sm" startIcon={<PlusIcon />} onClick={openAdd}>
              Add team
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading || teamsLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
          </div>
        ) : teamTotal === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">
            No outreach teams for this branch. {canManage ? "Add a team to use outreach on the POS." : ""}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>Team</TableCell>
                <TableCell isHeader>AR (credit)</TableCell>
                <TableCell isHeader>Members</TableCell>
                <TableCell isHeader>Bag SKUs</TableCell>
                <TableCell isHeader className="text-right">Status</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <p className="font-medium">{t.name}</p>
                    {t.phone ? <p className="text-xs text-gray-500">{t.phone}</p> : null}
                    {t.notes ? <p className="text-xs text-gray-400 line-clamp-2">{t.notes}</p> : null}
                  </TableCell>
                  <TableCell className="font-mono">${t.creditBalance.toFixed(2)}</TableCell>
                  <TableCell>
                    <ul className="text-sm">
                      {t.members.map((m) => (
                        <li key={m.id}>
                          {m.name}
                          {m.role ? <span className="text-gray-500"> — {m.role}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                  <TableCell>{t.inventory.length}</TableCell>
                  <TableCell className="text-right">
                    {canManage ? (
                      <Button variant="outline" size="sm" onClick={() => toggleActive(t)}>
                        {t.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    ) : (
                      <span className="text-xs">{t.isActive ? "Active" : "Inactive"}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <ListPaginationFooter
          loading={teamsLoading}
          total={teamTotal}
          page={teamPage}
          pageSize={teamPageSize}
          noun="teams"
          onPageChange={setTeamPage}
        />
      </div>

      {modal && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold">New outreach team</h2>
            </div>
            <form onSubmit={handleCreate} className="space-y-4 px-6 py-5">
              {error && (
                <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                  {error}
                </div>
              )}
              <div>
                <Label>Team name *</Label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <Label>Notes</Label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Optional first member</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Name</Label>
                  <input
                    value={form.memberName}
                    onChange={(e) => setForm((f) => ({ ...f, memberName: e.target.value }))}
                    className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <input
                    value={form.memberPhone}
                    onChange={(e) => setForm((f) => ({ ...f, memberPhone: e.target.value }))}
                    className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? "Saving…" : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
