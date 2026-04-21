"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/badge/Badge";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";
import Label from "@/components/form/Label";
import DateRangeFilter from "@/components/form/DateRangeFilter";
import ExpiryDateBadge from "@/components/pharmacy/ExpiryDateBadge";

export type PharmacyReportId =
  | "sales"
  | "purchases"
  | "inventory"
  | "internal_usage"
  | "categories"
  | "suppliers"
  | "opening_inventory";

const REPORT_META: Record<
  PharmacyReportId,
  { label: string; description: string }
> = {
  sales: { label: "Sales report", description: "Retail POS sales by date, branch, and payment." },
  purchases: { label: "Purchase report", description: "Stock purchases from suppliers and payment account." },
  inventory: { label: "Inventory report", description: "Current products, quantities, retail vs internal." },
  internal_usage: { label: "Internal usage report", description: "Non-sale stock used for lab, cleaning, or general." },
  categories: { label: "Categories report", description: "Product categories and item counts." },
  suppliers: { label: "Suppliers report", description: "Suppliers and purchase totals in the selected period." },
  opening_inventory: {
    label: "Opening inventory report",
    description: "Products first added in the date range (new SKUs).",
  },
};

type Props = { report: PharmacyReportId };

export function PharmacyReportPanel({ report }: Props) {
  const { hasPermission } = useAuth();
  const { seesAllBranches, hasMultipleAssignedBranches, allBranchesLabel } = useBranchScope();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reportBranchId, setReportBranchId] = useState("");
  const [reportBranches, setReportBranches] = useState<{ id: number; name: string }[]>([]);
  const [stockType, setStockType] = useState<"all" | "sale" | "internal">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [sales, setSales] = useState<
    {
      id: number;
      saleDate: string;
      totalAmount: number;
      paymentMethod: string;
      branch: { name: string } | null;
      patient: { name: string; patientCode: string } | null;
      customerType: string;
    }[]
  >([]);
  const [purchases, setPurchases] = useState<
    {
      id: number;
      supplierId: number | null;
      purchaseDate: string;
      totalAmount: number;
      branch: { name: string } | null;
      supplier: { name: string } | null;
      paymentMethod: { name: string; account: { name: string } } | null;
    }[]
  >([]);
  const [products, setProducts] = useState<
    {
      id: number;
      name: string;
      code: string;
      quantity: number;
      unit: string;
      sellingPrice: number;
      forSale: boolean;
      expiryDate: string | null;
      category: { name: string } | null;
      createdAt: string;
    }[]
  >([]);
  const [internalLogs, setInternalLogs] = useState<
    {
      id: number;
      quantity: number;
      purpose: string;
      createdAt: string;
      product: { name: string; code: string; unit: string };
      branch: { name: string } | null;
      createdBy: { name: string | null; email: string } | null;
    }[]
  >([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: number; name: string; phone: string | null }[]>([]);

  const dateParams = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }, [from, to]);

  const branchScopedReports =
    report === "sales" ||
    report === "purchases" ||
    report === "internal_usage" ||
    report === "inventory" ||
    report === "categories" ||
    report === "suppliers" ||
    report === "opening_inventory";

  /** Transaction reports (sales / purchases / internal) can use “all branches”; catalog reports always scope to one branch. */
  const transactionReports =
    report === "sales" || report === "purchases" || report === "internal_usage";
  const showReportBranchFilter =
    branchScopedReports &&
    (seesAllBranches || hasMultipleAssignedBranches || hasPermission("settings.manage")) &&
    (transactionReports ? reportBranches.length >= 1 : reportBranches.length > 1);

  useEffect(() => {
    if (!branchScopedReports) {
      setReportBranches([]);
      return;
    }
    const url = hasPermission("settings.manage") ? "/api/branches?all=true" : "/api/branches";
    authFetch(url)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: { id: number; name: string }[]) => {
        const arr = Array.isArray(d) ? d : [];
        setReportBranches(arr);
        setReportBranchId((prev) => {
          if (prev && arr.some((b) => String(b.id) === prev)) return prev;
          if (transactionReports) return "";
          return arr[0] ? String(arr[0].id) : "";
        });
      })
      .catch(() => setReportBranches([]));
  }, [report, hasPermission, transactionReports]);

  const load = useCallback(async () => {
    if (!hasPermission("pharmacy.view")) return;
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (
        reportBranchId &&
        transactionReports
      ) {
        p.set("branchId", reportBranchId);
      }
      const q = p.toString() ? `?${p.toString()}` : "";

      if (report === "sales") {
        const res = await authFetch(`/api/pharmacy/sales${q}`);
        if (!res.ok) throw new Error("Failed to load sales");
        setSales(await res.json());
        return;
      }
      if (report === "purchases") {
        const res = await authFetch(`/api/pharmacy/purchases${q}`);
        if (!res.ok) throw new Error("Failed to load purchases");
        setPurchases(await res.json());
        return;
      }
      if (report === "internal_usage") {
        const res = await authFetch(`/api/pharmacy/internal-usage${q}`);
        if (!res.ok) throw new Error("Failed to load internal usage");
        setInternalLogs(await res.json());
        return;
      }
      const catalogBranchId =
        reportBranchId ||
        (reportBranches[0] ? String(reportBranches[0].id) : "");

      if (report === "inventory") {
        if (!catalogBranchId) throw new Error("No branch available");
        const params = new URLSearchParams();
        params.set("branchId", catalogBranchId);
        if (stockType !== "all") params.set("stockType", stockType);
        const res = await authFetch(`/api/pharmacy/products?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load inventory");
        setProducts(await res.json());
        return;
      }
      if (report === "categories") {
        if (!catalogBranchId) throw new Error("No branch available");
        const bq = `branchId=${encodeURIComponent(catalogBranchId)}`;
        const [cRes, pRes] = await Promise.all([
          authFetch(`/api/pharmacy/categories?${bq}`),
          authFetch(`/api/pharmacy/products?${bq}`),
        ]);
        if (!cRes.ok || !pRes.ok) throw new Error("Failed to load categories");
        setCategories(await cRes.json());
        setProducts(await pRes.json());
        return;
      }
      if (report === "suppliers") {
        if (!catalogBranchId) throw new Error("No branch available");
        const purchaseQ = new URLSearchParams();
        if (from) purchaseQ.set("from", from);
        if (to) purchaseQ.set("to", to);
        purchaseQ.set("branchId", catalogBranchId);
        const pQs = purchaseQ.toString() ? `?${purchaseQ.toString()}` : "";
        const [sRes, pRes] = await Promise.all([
          authFetch(`/api/pharmacy/suppliers?branchId=${encodeURIComponent(catalogBranchId)}`),
          authFetch(`/api/pharmacy/purchases${pQs}`),
        ]);
        if (!sRes.ok || !pRes.ok) throw new Error("Failed to load suppliers");
        setSuppliers(await sRes.json());
        setPurchases(await pRes.json());
        return;
      }
      if (report === "opening_inventory") {
        if (!catalogBranchId) throw new Error("No branch available");
        const res = await authFetch(
          `/api/pharmacy/products?branchId=${encodeURIComponent(catalogBranchId)}`
        );
        if (!res.ok) throw new Error("Failed to load products");
        setProducts(await res.json());
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [report, from, to, stockType, hasPermission, reportBranchId, reportBranches, transactionReports]);

  useEffect(() => {
    load();
  }, [load]);

  const salesTotal = useMemo(() => sales.reduce((s, x) => s + x.totalAmount, 0), [sales]);
  const purchasesTotal = useMemo(() => purchases.reduce((s, x) => s + x.totalAmount, 0), [purchases]);

  const categoryCounts = useMemo(() => {
    const m = new Map<string | number, number>();
    for (const p of products) {
      const key = p.category?.name ?? "Uncategorized";
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [products]);

  const supplierSpendById = useMemo(() => {
    const m = new Map<number, number>();
    for (const pu of purchases) {
      const sid = pu.supplierId;
      if (typeof sid === "number") {
        m.set(sid, (m.get(sid) ?? 0) + pu.totalAmount);
      }
    }
    return m;
  }, [purchases]);

  const openingFiltered = useMemo(() => {
    if (!from && !to) return products;
    return products.filter((p) => {
      const d = new Date(p.createdAt).getTime();
      if (from) {
        const start = new Date(from);
        start.setHours(0, 0, 0, 0);
        if (d < start.getTime()) return false;
      }
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        if (d > end.getTime()) return false;
      }
      return true;
    });
  }, [products, from, to]);

  const meta = REPORT_META[report];

  if (!hasPermission("pharmacy.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle={meta.label} />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4">
        <PageBreadCrumb pageTitle={meta.label} />
        <p className="max-w-3xl text-sm text-gray-600 dark:text-gray-400">{meta.description}</p>
      </div>

      <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3 sm:flex-row sm:flex-wrap sm:items-end">
        {report === "inventory" && (
          <div className="min-w-[180px]">
            <Label>Stock type</Label>
            <select
              value={stockType}
              onChange={(e) => setStockType(e.target.value as "all" | "sale" | "internal")}
              className="mt-1.5 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="all">All</option>
              <option value="sale">For sale (retail)</option>
              <option value="internal">Internal (non-sale)</option>
            </select>
          </div>
        )}
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
        {showReportBranchFilter ? (
          <div className="min-w-[200px]">
            <Label>Branch</Label>
            <select
              value={reportBranchId}
              onChange={(e) => setReportBranchId(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">{allBranchesLabel}</option>
              {reportBranches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
            {hasPermission("settings.manage") ? (
              <p className="mt-1.5 max-w-xs text-xs text-gray-500 dark:text-gray-400">
                Branch administrators see every location here; other users only see branches they are assigned to.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-200">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">{meta.label}</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
          </div>
        ) : report === "sales" ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3 dark:border-gray-800">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {sales.length} sale{sales.length === 1 ? "" : "s"}
              </span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">Total: ${salesTotal.toFixed(2)}</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-transparent! hover:bg-transparent!">
                  <TableCell isHeader>Date</TableCell>
                  <TableCell isHeader>Branch</TableCell>
                  <TableCell isHeader>Customer</TableCell>
                  <TableCell isHeader>Payment</TableCell>
                  <TableCell isHeader className="text-right">Total</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center text-sm text-gray-500">
                      No sales in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  sales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="whitespace-nowrap text-sm">{new Date(s.saleDate).toLocaleString()}</TableCell>
                      <TableCell>{s.branch?.name ?? "—"}</TableCell>
                      <TableCell>
                        {s.customerType === "patient" && s.patient
                          ? `${s.patient.name} (${s.patient.patientCode})`
                          : "Walking"}
                      </TableCell>
                      <TableCell className="capitalize">{s.paymentMethod || "—"}</TableCell>
                      <TableCell className="text-right font-medium">${s.totalAmount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        ) : report === "purchases" ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3 dark:border-gray-800">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {purchases.length} purchase{purchases.length === 1 ? "" : "s"}
              </span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">Total: ${purchasesTotal.toFixed(2)}</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-transparent! hover:bg-transparent!">
                  <TableCell isHeader>Date</TableCell>
                  <TableCell isHeader>Branch</TableCell>
                  <TableCell isHeader>Supplier</TableCell>
                  <TableCell isHeader>Payment</TableCell>
                  <TableCell isHeader className="text-right">Amount</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center text-sm text-gray-500">
                      No purchases in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  purchases.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap text-sm">{new Date(p.purchaseDate).toLocaleDateString()}</TableCell>
                      <TableCell>{p.branch?.name ?? "—"}</TableCell>
                      <TableCell className="font-medium">{p.supplier?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {p.paymentMethod ? (
                          <>
                            {p.paymentMethod.name}
                            <span className="block text-xs text-gray-500">{p.paymentMethod.account.name}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">${p.totalAmount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        ) : report === "inventory" ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>Code</TableCell>
                <TableCell isHeader>Name</TableCell>
                <TableCell isHeader>Type</TableCell>
                <TableCell isHeader>Category</TableCell>
                <TableCell isHeader className="text-right">Qty</TableCell>
                <TableCell isHeader>Expiry</TableCell>
                <TableCell isHeader className="text-right">Sell</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-sm text-gray-500">
                    No products.
                  </TableCell>
                </TableRow>
              ) : (
                products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-sm">{p.code}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      {p.forSale ? (
                        <Badge color="success" size="sm">
                          Retail
                        </Badge>
                      ) : (
                        <Badge color="warning" size="sm">
                          Internal
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{p.category?.name ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {p.quantity} {p.unit}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <ExpiryDateBadge expiryDate={p.expiryDate} />
                    </TableCell>
                    <TableCell className="text-right">{p.forSale ? `$${p.sellingPrice.toFixed(2)}` : "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        ) : report === "internal_usage" ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>Date</TableCell>
                <TableCell isHeader>Product</TableCell>
                <TableCell isHeader>Branch</TableCell>
                <TableCell isHeader>Qty</TableCell>
                <TableCell isHeader>Purpose</TableCell>
                <TableCell isHeader>By</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {internalLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-gray-500">
                    No internal usage in this period.
                  </TableCell>
                </TableRow>
              ) : (
                internalLogs.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-sm">{new Date(row.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      {row.product.name} <span className="font-mono text-xs text-gray-500">{row.product.code}</span>
                    </TableCell>
                    <TableCell>{row.branch?.name ?? "—"}</TableCell>
                    <TableCell>
                      {row.quantity} {row.product.unit}
                    </TableCell>
                    <TableCell className="capitalize">{row.purpose}</TableCell>
                    <TableCell className="text-sm">{row.createdBy?.name || row.createdBy?.email || "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        ) : report === "categories" ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>Category</TableCell>
                <TableCell isHeader className="text-right">Products</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.length === 0 && products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="py-12 text-center text-sm text-gray-500">
                    No category data.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {categories.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right">{categoryCounts.get(c.name) ?? 0}</TableCell>
                    </TableRow>
                  ))}
                  {(categoryCounts.get("Uncategorized") ?? 0) > 0 && (
                    <TableRow>
                      <TableCell className="font-medium text-gray-500">Uncategorized</TableCell>
                      <TableCell className="text-right">{categoryCounts.get("Uncategorized") ?? 0}</TableCell>
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        ) : report === "suppliers" ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>Supplier</TableCell>
                <TableCell isHeader>Phone</TableCell>
                <TableCell isHeader className="text-right">Purchase total (period)</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-12 text-center text-sm text-gray-500">
                    No suppliers.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.phone || "—"}</TableCell>
                    <TableCell className="text-right font-medium">
                      ${(supplierSpendById.get(s.id) ?? 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        ) : report === "opening_inventory" ? (
          <>
            <div className="border-b border-gray-100 px-5 py-3 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400">
              Products with <strong>created</strong> date in the selected range ({openingFiltered.length} item
              {openingFiltered.length === 1 ? "" : "s"}).
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-transparent! hover:bg-transparent!">
                  <TableCell isHeader>Added</TableCell>
                  <TableCell isHeader>Code</TableCell>
                  <TableCell isHeader>Name</TableCell>
                  <TableCell isHeader>Type</TableCell>
                  <TableCell isHeader>Expiry</TableCell>
                  <TableCell isHeader className="text-right">On hand</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openingFiltered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-sm text-gray-500">
                      No products added in this period (or clear dates to see all products’ created dates).
                    </TableCell>
                  </TableRow>
                ) : (
                  openingFiltered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap text-sm">{new Date(p.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell className="font-mono text-sm">{p.code}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.forSale ? "Retail" : "Internal"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <ExpiryDateBadge expiryDate={p.expiryDate} />
                      </TableCell>
                      <TableCell className="text-right text-sm text-gray-600 dark:text-gray-400">
                        {p.quantity} {p.unit}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        ) : null}
      </div>
    </>
  );
}
