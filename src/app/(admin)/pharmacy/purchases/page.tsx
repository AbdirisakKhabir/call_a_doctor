"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";
import { PlusIcon } from "@/icons";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type Purchase = {
  id: number;
  purchaseDate: string;
  totalAmount: number;
  branch: { id: number; name: string } | null;
  supplier: { id: number; name: string } | null;
  createdBy: { name: string | null } | null;
  paymentMethod: {
    id: number;
    name: string;
    account: { id: number; name: string; type: string };
  } | null;
  items: { productId: number; quantity: number; unitPrice: number; totalAmount: number; product: { name: string; code: string } }[];
};

type Branch = { id: number; name: string };

export default function PurchasesPage() {
  const { hasPermission } = useAuth();
  const { seesAllBranches, hasMultipleAssignedBranches, allBranchesLabel } = useBranchScope();
  const [listBranchFilter, setListBranchFilter] = useState("");
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseTotal, setPurchaseTotal] = useState(0);
  const [purchasePage, setPurchasePage] = useState(1);
  const purchasePageSize = 20;
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadPurchases() {
    const params = new URLSearchParams();
    if (listBranchFilter) params.set("branchId", listBranchFilter);
    params.set("page", String(purchasePage));
    params.set("pageSize", String(purchasePageSize));
    const res = await authFetch(`/api/pharmacy/purchases?${params}`);
    if (res.ok) {
      const body = await res.json();
      setPurchases(body.data ?? []);
      setPurchaseTotal(typeof body.total === "number" ? body.total : 0);
    }
  }

  async function loadBranches() {
    const url = hasPermission("settings.manage") ? "/api/branches?all=true" : "/api/branches";
    const res = await authFetch(url);
    if (res.ok) {
      const data: Branch[] = await res.json();
      setBranches(data);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadBranches().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setPurchasePage(1);
  }, [listBranchFilter]);

  useEffect(() => {
    loadPurchases();
  }, [listBranchFilter, purchasePage]);

  if (!hasPermission("pharmacy.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Purchases" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  const canCreate = hasPermission("pharmacy.create");

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Purchases" />
        {canCreate && (
          <Link
            href="/pharmacy/purchases/new"
            onClick={(e) => {
              if (branches.length === 0) {
                e.preventDefault();
                alert("No branch is available. Create a branch in Settings and assign your user to it.");
              }
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
          >
            <PlusIcon className="size-4 shrink-0" aria-hidden />
            New Purchase
          </Link>
        )}
      </div>

      {canCreate && !loading && branches.length === 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          No branch is assigned to your account (or none exist yet). Add branches under Settings and assign users to branches before recording purchases.
        </div>
      )}

      {(seesAllBranches || hasMultipleAssignedBranches) && branches.length > 1 ? (
        <div className="mb-4 flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-white/3">
          <div>
            <Label>Filter by branch</Label>
            <select
              value={listBranchFilter}
              onChange={(e) => setListBranchFilter(e.target.value)}
              className="mt-1.5 h-10 min-w-[200px] rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">{allBranchesLabel}</option>
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 sm:pb-2">
            {seesAllBranches ? "Administrators see every branch; narrow the list here." : "Show purchases for one assigned branch or all of yours."}
          </p>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
          </div>
        ) : purchaseTotal === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-gray-500 dark:text-gray-400">No purchases yet.</p>
            {canCreate && (
              <Link
                href="/pharmacy/purchases/new"
                className="mt-2 inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
              >
                New Purchase
              </Link>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>Date</TableCell>
                <TableCell isHeader>Branch</TableCell>
                <TableCell isHeader>Supplier</TableCell>
                <TableCell isHeader>Payment</TableCell>
                <TableCell isHeader>Total</TableCell>
                <TableCell isHeader>Recorded By</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{new Date(p.purchaseDate).toLocaleDateString()}</TableCell>
                  <TableCell>{p.branch?.name ?? "—"}</TableCell>
                  <TableCell className="font-medium">{p.supplier?.name ?? "—"}</TableCell>
                  <TableCell>
                    {p.paymentMethod ? (
                      <span className="text-sm">
                        <span className="font-medium">{p.paymentMethod.name}</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                          {p.paymentMethod.account.name}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>${p.totalAmount.toFixed(2)}</TableCell>
                  <TableCell>{p.createdBy?.name || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <ListPaginationFooter
          loading={loading}
          total={purchaseTotal}
          page={purchasePage}
          pageSize={purchasePageSize}
          noun="purchases"
          onPageChange={setPurchasePage}
        />
      </div>
    </>
  );
}
