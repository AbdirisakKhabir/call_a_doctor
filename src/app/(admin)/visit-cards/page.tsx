"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";
import { CalenderIcon, PencilIcon, PlusIcon, UserCircleIcon } from "@/icons";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";
import { labelPaymentStatus, labelQueueStatus } from "@/lib/visit-card-labels";

type PatientMini = { id: number; patientCode: string; name: string; phone: string | null };
type DoctorMini = { id: number; name: string };
type BranchMini = { id: number; name: string };

type VisitCardRow = {
  id: number;
  cardNumber: string;
  visitDate: string;
  status: string;
  paymentStatus: string;
  visitFee: number;
  branch: BranchMini;
  patient: PatientMini;
  doctor: DoctorMini;
  depositTransaction: { id: number; amount: number } | null;
};

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return d;
  }
}

export default function VisitCardsPage() {
  const { hasPermission, user } = useAuth();
  const { seesAllBranches, assignedBranchIds, singleAssignedBranchId } = useBranchScope();

  const canView =
    hasPermission("visit_cards.view_all") ||
    hasPermission("visit_cards.view_own") ||
    hasPermission("visit_cards.create");
  const canCreate = hasPermission("visit_cards.create");
  const canEdit = hasPermission("visit_cards.edit");

  const [rows, setRows] = useState<VisitCardRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [branches, setBranches] = useState<BranchMini[]>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [depositNotice, setDepositNotice] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("visitCardDepositNotice");
      if (!raw) return;
      sessionStorage.removeItem("visitCardDepositNotice");
      const parsed = JSON.parse(raw) as { accountBalanceAfter?: unknown };
      if (typeof parsed.accountBalanceAfter === "number" && Number.isFinite(parsed.accountBalanceAfter)) {
        setDepositNotice(parsed.accountBalanceAfter);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadBranches = useCallback(async () => {
    const res = await authFetch("/api/branches");
    if (res.ok) {
      const data = await res.json();
      setBranches(Array.isArray(data) ? data : []);
    }
  }, []);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    if (seesAllBranches) return;
    if (singleAssignedBranchId && !branchId) {
      setBranchId(String(singleAssignedBranchId));
    }
  }, [seesAllBranches, singleAssignedBranchId, branchId]);

  useEffect(() => {
    setPage(1);
  }, [branchId]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (branchId) params.set("branchId", branchId);
    authFetch(`/api/visit-cards?${params}`)
      .then((res) => res.json())
      .then((body) => {
        if (body.data) {
          setRows(body.data);
          setTotal(typeof body.total === "number" ? body.total : 0);
        } else {
          setRows([]);
          setTotal(0);
        }
      })
      .finally(() => setLoading(false));
  }, [page, branchId]);

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Visit cards" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-500 dark:text-gray-400">You do not have permission to view visit cards.</p>
        </div>
      </div>
    );
  }

  const newHref =
    branchId ? `/visit-cards/new?branchId=${encodeURIComponent(branchId)}` : "/visit-cards/new";

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Visit cards" />
        <div className="flex flex-wrap items-center gap-2">
          {seesAllBranches && (
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              aria-label="Branch"
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          {!seesAllBranches && assignedBranchIds && assignedBranchIds.length > 1 && (
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              aria-label="Branch"
            >
              <option value="">All my branches</option>
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          {canCreate &&
            (!seesAllBranches && (!assignedBranchIds || assignedBranchIds.length === 0) ? (
              <span className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white opacity-50 shadow-theme-xs">
                <PlusIcon />
                New visit card
              </span>
            ) : (
              <Link
                href={newHref}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600"
              >
                <PlusIcon />
                New visit card
              </Link>
            ))}
        </div>
      </div>

      {hasPermission("visit_cards.view_own") && !hasPermission("visit_cards.view_all") && user?.doctorId != null && (
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          You are viewing visit cards assigned to your doctor profile only.
        </p>
      )}

      {depositNotice != null && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"
        >
          <span>
            Deposit recorded. Linked account balance is now{" "}
            <strong className="font-semibold">${depositNotice.toFixed(2)}</strong>.
          </span>
          <button
            type="button"
            onClick={() => setDepositNotice(null)}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-emerald-800 underline hover:bg-emerald-100/80 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-gray-500">No visit cards yet.</p>
            {canCreate && (
              <Link
                href={newHref}
                className="mt-2 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
              >
                Create one
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 sm:p-6">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-white/2"
                >
                  <div className="border-b border-gray-100 bg-linear-to-r from-gray-50/80 to-white px-5 py-4 dark:border-gray-800 dark:from-gray-900/50 dark:to-transparent">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold text-brand-600 dark:text-brand-400">{row.cardNumber}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{row.branch.name}</p>
                      </div>
                      {canEdit && (
                        <Link
                          href={`/visit-cards/${row.id}/edit`}
                          className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg px-3 text-sm font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
                        >
                          <PencilIcon className="mr-1.5 h-4 w-4" />
                          Edit
                        </Link>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 dark:bg-brand-500/20">
                        <UserCircleIcon className="h-5 w-5 text-brand-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold text-gray-900 dark:text-white">{row.patient.name}</h3>
                        <p className="truncate text-sm text-gray-500 dark:text-gray-400">{row.patient.patientCode}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <CalenderIcon className="h-4 w-4 shrink-0" />
                      {formatDate(row.visitDate)}
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-3 px-5 py-4">
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                      <span className="text-gray-500 dark:text-gray-400">Doctor: </span>
                      <span className="font-medium text-gray-900 dark:text-white">{row.doctor.name}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-white/10 dark:text-gray-200">
                        {labelQueueStatus(row.status)}
                      </span>
                      <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800 dark:bg-brand-500/15 dark:text-brand-200">
                        {labelPaymentStatus(row.paymentStatus)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-800">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Visit fee</span>
                      <span className="text-lg font-semibold text-gray-900 dark:text-white">${row.visitFee.toFixed(2)}</span>
                    </div>
                    {row.depositTransaction && (
                      <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Ledger deposit recorded</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <ListPaginationFooter
              loading={loading}
              total={total}
              page={page}
              pageSize={pageSize}
              noun="visit cards"
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </>
  );
}
