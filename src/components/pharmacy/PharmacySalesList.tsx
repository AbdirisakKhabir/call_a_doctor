"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import DateRangeFilter from "@/components/form/DateRangeFilter";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Pagination from "@/components/tables/Pagination";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";
import { Eye, Loader2, MoreHorizontal, Pencil, Printer, RotateCcw, ShoppingCart } from "lucide-react";
import SaleReceiptModal, { printSaleReceiptById } from "@/components/pharmacy/SaleReceiptModal";
import { DropdownItem } from "@/components/ui/dropdown/DropdownItem";

type Branch = { id: number; name: string };

type SaleRow = {
  id: number;
  saleDate: string;
  totalAmount: number;
  discount: number;
  paymentMethod: string;
  customerType: string;
  kind?: string;
  appointmentId?: number | null;
  outreachTeamId?: number | null;
  branchId?: number | null;
  branch: { id: number; name: string } | null;
  patient: { id: number; patientCode: string; name: string } | null;
  createdBy: { id: number; name: string | null } | null;
  depositTransaction: { id: number } | null;
  _count: { items: number };
};

export type PharmacySalesListVariant = "all" | "appointment";

type Props = { variant: PharmacySalesListVariant };

function formatSaleListDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

export default function PharmacySalesList({ variant }: Props) {
  const { hasPermission } = useAuth();
  const { allBranchesLabel } = useBranchScope();
  const searchParams = useSearchParams();
  const appointmentIdFilter = searchParams.get("appointmentId")?.trim() ?? "";

  const canViewAll = hasPermission("pharmacy.view");
  const canViewAppointment =
    hasPermission("pharmacy.view") ||
    hasPermission("pharmacy.pos") ||
    hasPermission("accounts.view") ||
    hasPermission("accounts.reports") ||
    hasPermission("appointments.view");
  const canView = variant === "appointment" ? canViewAppointment : canViewAll;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const defaultRange = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 90);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  }, []);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [rows, setRows] = useState<SaleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [receiptSaleId, setReceiptSaleId] = useState<number | null>(null);
  const [printingSaleId, setPrintingSaleId] = useState<number | null>(null);
  const [actionMenuSaleId, setActionMenuSaleId] = useState<number | null>(null);
  const [actionMenuPos, setActionMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const canViewPos = hasPermission("pharmacy.pos");
  const canEditSale = hasPermission("pharmacy.edit") || hasPermission("pharmacy.pos");
  const canReturnSale = hasPermission("pharmacy.pos");
  const showSaleActions = hasPermission("pharmacy.view") || canEditSale || canReturnSale;
  const showReceiptActions = canView;

  const handlePrintSaleReceipt = async (saleId: number) => {
    setPrintingSaleId(saleId);
    setError("");
    try {
      const r = await printSaleReceiptById(saleId);
      if (!r.ok) setError(r.error);
    } finally {
      setPrintingSaleId(null);
    }
  };

  const closeActionMenu = useCallback(() => setActionMenuSaleId(null), []);

  const openActionMenu = useCallback((saleId: number, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 176;
    const left = Math.max(8, rect.right - menuWidth);
    setActionMenuPos({ top: rect.bottom + 4, left });
    setActionMenuSaleId((prev) => (prev === saleId ? null : saleId));
  }, []);

  const pageTitle = variant === "appointment" ? "Appointment sales" : "Sales list";

  useEffect(() => {
    if (actionMenuSaleId == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActionMenuSaleId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actionMenuSaleId]);

  const actionMenuSale = useMemo(
    () => (actionMenuSaleId != null ? rows.find((r) => r.id === actionMenuSaleId) ?? null : null),
    [actionMenuSaleId, rows],
  );

  const actionMenuMeta = useMemo(() => {
    if (!actionMenuSale) return null;
    const am = actionMenuSale;
    const isOutreach = am.customerType === "outreach" || am.outreachTeamId != null;
    const isAppointmentSale = am.kind === "appointment" || variant === "appointment";
    const branchPk = am.branch?.id ?? am.branchId;
    const editHref = `/pharmacy/pos?editSale=${am.id}`;
    const returnHref =
      branchPk != null
        ? `/pharmacy/sale-returns?saleId=${am.id}&branchId=${branchPk}`
        : `/pharmacy/sale-returns?saleId=${am.id}`;
    return {
      editHref,
      returnHref,
      showEdit: canEditSale && !isOutreach && !isAppointmentSale,
      showReturn: canReturnSale && !isOutreach && !isAppointmentSale,
    };
  }, [actionMenuSale, variant, canEditSale, canReturnSale]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (!appointmentIdFilter) {
        if (from) params.set("from", from);
        if (to) params.set("to", to);
      }
      if (branchId) params.set("branchId", branchId);
      if (appointmentIdFilter) params.set("appointmentId", appointmentIdFilter);
      if (variant === "appointment") params.set("kind", "appointment");
      const res = await authFetch(`/api/pharmacy/sales?${params.toString()}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Failed to load sales");
        setRows([]);
        setTotal(0);
        return;
      }
      setRows(body.data || []);
      setTotal(typeof body.total === "number" ? body.total : 0);
    } finally {
      setLoading(false);
    }
  }, [page, from, to, branchId, appointmentIdFilter, variant]);

  useEffect(() => {
    authFetch("/api/branches").then((r) => {
      if (r.ok) r.json().then((d: Branch[]) => setBranches(d || []));
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [from, to, branchId, appointmentIdFilter, variant]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fromIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toIdx = Math.min(page * pageSize, total);

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle={pageTitle} />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <PageBreadCrumb pageTitle={pageTitle} />
          {variant === "appointment" && !appointmentIdFilter ? (
            <p className="max-w-xl text-sm text-gray-600 dark:text-gray-400">
              Visit billing only — sales recorded when a calendar booking is completed with a payment.
            </p>
          ) : null}
          {appointmentIdFilter ? (
            <p className="max-w-xl text-sm text-gray-600 dark:text-gray-400">
              Showing sales linked to appointment{" "}
              <Link
                href={`/appointments/${appointmentIdFilter}`}
                className="font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                #{appointmentIdFilter}
              </Link>
              .{" "}
              <Link
                href={variant === "appointment" ? "/accounting/appointment-sales" : "/pharmacy/sales"}
                className="text-brand-600 hover:underline dark:text-brand-400"
              >
                Clear filter
              </Link>
            </p>
          ) : null}
        </div>
        {canViewPos && variant === "all" ? (
          <Link href="/pharmacy/pos">
            <Button variant="outline" size="sm" startIcon={<ShoppingCart className="size-4 shrink-0" strokeWidth={2} aria-hidden />}>
              Open POS
            </Button>
          </Link>
        ) : null}
      </div>

      <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3 sm:flex-row sm:flex-wrap sm:items-end">
        <div>
          <Label>Branch</Label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="mt-1.5 h-10 w-full min-w-[180px] rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white sm:w-auto"
          >
            <option value="">{allBranchesLabel}</option>
            {branches.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <DateRangeFilter
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          onClear={() => {
            setFrom("");
            setTo("");
          }}
        />
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          {loading ? "Loading…" : "Apply"}
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-error-50 px-4 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">No sales in this range.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>Date</TableCell>
                <TableCell isHeader>#</TableCell>
                {variant === "appointment" ? <TableCell isHeader>Booking</TableCell> : null}
                <TableCell isHeader>Branch</TableCell>
                <TableCell isHeader>Customer</TableCell>
                <TableCell isHeader>Lines</TableCell>
                <TableCell isHeader>Total</TableCell>
                <TableCell isHeader>Payment</TableCell>
                <TableCell isHeader>Recorded by</TableCell>
                <TableCell isHeader>Status</TableCell>
                {showSaleActions || showReceiptActions ? (
                  <TableCell isHeader className="w-12 text-center">
                    <span className="sr-only">Actions</span>
                    <MoreHorizontal className="inline size-4 text-gray-400 dark:text-gray-500" strokeWidth={2} aria-hidden />
                  </TableCell>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const cust =
                  s.customerType === "patient" && s.patient
                    ? s.patient.name
                    : s.customerType === "outreach" || s.outreachTeamId != null
                      ? "Outreach"
                      : "Walking";
                const hasDep = Boolean(s.depositTransaction?.id);
                return (
                  <TableRow key={s.id}>
                    <TableCell>{formatSaleListDate(s.saleDate)}</TableCell>
                    <TableCell className="font-mono text-xs">{s.id}</TableCell>
                    {variant === "appointment" ? (
                      <TableCell>
                        {s.appointmentId != null ? (
                          <Link
                            href={`/appointments/${s.appointmentId}`}
                            className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                          >
                            #{s.appointmentId}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    ) : null}
                    <TableCell>{s.branch?.name ?? "—"}</TableCell>
                    <TableCell>{cust}</TableCell>
                    <TableCell>{s._count.items}</TableCell>
                    <TableCell className="font-medium">${s.totalAmount.toFixed(2)}</TableCell>
                    <TableCell>{s.paymentMethod}</TableCell>
                    <TableCell>{s.createdBy?.name ?? "—"}</TableCell>
                    <TableCell>
                      {hasDep ? (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                          Deposited
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">—</span>
                      )}
                    </TableCell>
                    {showSaleActions || showReceiptActions ? (
                      <TableCell className="text-center">
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                          aria-label={`Actions for sale #${s.id}`}
                          onClick={(e) => openActionMenu(s.id, e)}
                        >
                          <MoreHorizontal className="size-4" strokeWidth={2} aria-hidden />
                        </button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {!loading && total > 0 && (
          <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Showing {fromIdx}–{toIdx} of {total} sales
            </p>
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      <SaleReceiptModal saleId={receiptSaleId} open={receiptSaleId != null} onClose={() => setReceiptSaleId(null)} />

      {typeof document !== "undefined" &&
        actionMenuSaleId != null &&
        actionMenuSale &&
        createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-100 cursor-default bg-black/0"
              aria-label="Close menu"
              onClick={closeActionMenu}
            />
            <div
              role="menu"
              className="fixed z-101 min-w-48 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
              style={{ top: actionMenuPos.top, left: actionMenuPos.left }}
            >
              {showReceiptActions ? (
                <>
                  <DropdownItem
                    onClick={() => {
                      setReceiptSaleId(actionMenuSale.id);
                      closeActionMenu();
                    }}
                    className="flex items-center gap-2"
                  >
                    <Eye className="size-4 shrink-0 opacity-70" strokeWidth={2} aria-hidden />
                    View receipt
                  </DropdownItem>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={printingSaleId === actionMenuSale.id}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-800"
                    onClick={() => {
                      void handlePrintSaleReceipt(actionMenuSale.id);
                      closeActionMenu();
                    }}
                  >
                    {printingSaleId === actionMenuSale.id ? (
                      <Loader2 className="size-4 shrink-0 animate-spin opacity-70" strokeWidth={2} aria-hidden />
                    ) : (
                      <Printer className="size-4 shrink-0 opacity-70" strokeWidth={2} aria-hidden />
                    )}
                    Print receipt
                  </button>
                </>
              ) : null}
              {actionMenuMeta?.showEdit ? (
                <DropdownItem
                  tag="a"
                  href={actionMenuMeta.editHref}
                  onItemClick={closeActionMenu}
                  className="flex items-center gap-2"
                >
                  <Pencil className="size-4 shrink-0 opacity-70" strokeWidth={2} aria-hidden />
                  Edit
                </DropdownItem>
              ) : null}
              {actionMenuMeta?.showReturn ? (
                <DropdownItem
                  tag="a"
                  href={actionMenuMeta.returnHref}
                  onItemClick={closeActionMenu}
                  className="flex items-center gap-2"
                >
                  <RotateCcw className="size-4 shrink-0 opacity-70" strokeWidth={2} aria-hidden />
                  Return
                </DropdownItem>
              ) : null}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
