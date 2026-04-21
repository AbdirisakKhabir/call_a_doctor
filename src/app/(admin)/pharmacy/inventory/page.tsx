"use client";

import React, { useEffect, useMemo, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
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
import Label from "@/components/form/Label";
import { ArrowDownIcon, ArrowUpIcon, MoreDotIcon, PlusIcon, PosIcon } from "@/icons";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { DropdownItem } from "@/components/ui/dropdown/DropdownItem";
import Link from "next/link";
import Image from "next/image";
import ExpiryDateBadge from "@/components/pharmacy/ExpiryDateBadge";
import {
  DEFAULT_EXPIRY_SOON_CONFIG,
  expirySoonFilterOptionLabel,
  matchesInventoryExpiryFilter,
  type ExpirySoonConfig,
  type ExpirySoonMode,
  type InventoryExpiryFilter,
} from "@/lib/expiry";
import { useExpirySoon } from "@/context/ExpirySoonContext";
import { useBranchScope } from "@/hooks/useBranchScope";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";
import { printProductBarcodeLabel } from "@/lib/print-product-barcode";

type Product = {
  id: number;
  name: string;
  code: string;
  description: string | null;
  imageUrl: string | null;
  costPrice: number;
  sellingPrice: number;
  quantity: number;
  /** Non-sellable quantity (expired/damaged, etc.) — not available at POS. */
  unsellableQuantity?: number;
  unit: string;
  expiryDate: string | null;
  forSale: boolean;
  internalPurpose: string | null;
  category: { id: number; name: string } | null;
  /** When present, stock can be entered as several packaging lines that convert to base pcs. */
  saleUnits?: { unitKey: string; label: string; baseUnitsEach: number }[];
};

type Category = { id: number; name: string };
type Branch = { id: number; name: string };

type SortKey = "code" | "name" | "category" | "type" | "costPrice" | "sellingPrice" | "quantity" | "expiry" | "status";

function compareProducts(a: Product, b: Product, key: SortKey): number {
  switch (key) {
    case "code":
      return a.code.localeCompare(b.code, undefined, { sensitivity: "base" });
    case "name":
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    case "category":
      return (a.category?.name ?? "").localeCompare(b.category?.name ?? "", undefined, { sensitivity: "base" });
    case "type": {
      const av = a.forSale ? 0 : 1;
      const bv = b.forSale ? 0 : 1;
      if (av !== bv) return av - bv;
      return (a.internalPurpose ?? "").localeCompare(b.internalPurpose ?? "");
    }
    case "costPrice":
      return a.costPrice - b.costPrice;
    case "sellingPrice":
      return a.sellingPrice - b.sellingPrice;
    case "quantity":
      return a.quantity - b.quantity;
    case "expiry": {
      if (a.expiryDate == null && b.expiryDate == null) return 0;
      if (a.expiryDate == null) return 1;
      if (b.expiryDate == null) return -1;
      return a.expiryDate.localeCompare(b.expiryDate);
    }
    case "status":
      return a.quantity - b.quantity;
    default:
      return 0;
  }
}

function SortableInventoryHeader({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  columnKey: SortKey;
  sortKey: SortKey | null;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === columnKey;
  return (
    <TableCell isHeader className={className}>
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className="inline-flex max-w-full items-center gap-1.5 text-left font-semibold text-gray-700 hover:text-brand-600 dark:text-gray-300 dark:hover:text-brand-400"
        aria-label={`Sort by ${label}${active ? `, ${sortDir === "asc" ? "ascending" : "descending"}` : ""}`}
      >
        <span>{label}</span>
        <span className="inline-flex shrink-0 flex-col leading-none" aria-hidden>
          <ArrowUpIcon
            className={`h-3 w-3 ${active && sortDir === "asc" ? "text-brand-600 dark:text-brand-400" : "text-gray-300 dark:text-gray-600"}`}
          />
          <ArrowDownIcon
            className={`h-3 w-3 -mt-1 ${active && sortDir === "desc" ? "text-brand-600 dark:text-brand-400" : "text-gray-300 dark:text-gray-600"}`}
          />
        </span>
      </button>
    </TableCell>
  );
}

export default function InventoryPage() {
  const { hasPermission } = useAuth();
  const { config: systemExpirySoon } = useExpirySoon();
  const { seesAllBranches, allBranchesLabel } = useBranchScope();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [productTotal, setProductTotal] = useState(0);
  const [productPage, setProductPage] = useState(1);
  const productPageSize = 20;
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockType, setStockType] = useState<"all" | "sale" | "internal">("all");
  const [expiryFilter, setExpiryFilter] = useState<InventoryExpiryFilter>("all");
  /** Window for “Expiring soon” (days from today, or through end of month N). */
  const [expirySoonWindow, setExpirySoonWindow] = useState<ExpirySoonConfig>(DEFAULT_EXPIRY_SOON_CONFIG);
  const [modal, setModal] = useState<"unsellable" | null>(null);
  const [unsellableProduct, setUnsellableProduct] = useState<Product | null>(null);
  const [unsellableQty, setUnsellableQty] = useState("1");
  const [unsellableReason, setUnsellableReason] = useState<"expired" | "damaged" | "recall" | "other">("expired");
  const [unsellableNotes, setUnsellableNotes] = useState("");
  const [unsellableSubmitting, setUnsellableSubmitting] = useState(false);
  const [unsellableError, setUnsellableError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [actionsMenuProductId, setActionsMenuProductId] = useState<number | null>(null);

  const canEdit = hasPermission("pharmacy.edit");
  const canDelete = hasPermission("pharmacy.delete");
  const canOpenPos = hasPermission("pharmacy.pos");

  useEffect(() => {
    setExpirySoonWindow(systemExpirySoon);
  }, [systemExpirySoon.mode, systemExpirySoon.days, systemExpirySoon.months]);

  const filteredProducts = useMemo(
    () =>
      products.filter((p) =>
        matchesInventoryExpiryFilter(p.expiryDate, expiryFilter, expirySoonWindow)
      ),
    [products, expiryFilter, expirySoonWindow]
  );

  const sortedProducts = useMemo(() => {
    if (!sortKey) return filteredProducts;
    const list = [...filteredProducts];
    list.sort((a, b) => {
      const c = compareProducts(a, b, sortKey);
      return sortDir === "asc" ? c : -c;
    });
    return list;
  }, [filteredProducts, sortKey, sortDir]);

  function handleSortHeader(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

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

  async function loadProducts() {
    if (!branchId) return;
    const params = new URLSearchParams();
    params.set("branchId", branchId);
    if (search) params.set("search", search);
    if (categoryFilter) params.set("categoryId", categoryFilter);
    if (stockType !== "all") params.set("stockType", stockType);
    params.set("page", String(productPage));
    params.set("pageSize", String(productPageSize));
    const res = await authFetch(`/api/pharmacy/products?${params}`);
    if (res.ok) {
      const body = await res.json();
      setProducts(body.data ?? []);
      setProductTotal(typeof body.total === "number" ? body.total : 0);
    }
  }

  async function loadCategories() {
    if (!branchId) return;
    const res = await authFetch(`/api/pharmacy/categories?branchId=${encodeURIComponent(branchId)}`);
    if (res.ok) {
      const data = await res.json();
      setCategories(data);
    }
  }

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    setProductPage(1);
  }, [branchId, search, categoryFilter, stockType]);

  useEffect(() => {
    if (!branchId) return;
    setLoading(true);
    Promise.all([loadProducts(), loadCategories()]).finally(() => setLoading(false));
  }, [branchId, search, categoryFilter, stockType, productPage]);

  async function handleDelete(id: number) {
    if (!confirm("Delete this product?")) return;
    const res = await authFetch(`/api/pharmacy/products/${id}`, { method: "DELETE" });
    if (res.ok) await loadProducts();
    else alert((await res.json()).error || "Failed to delete");
  }

  function openUnsellable(p: Product) {
    setUnsellableProduct(p);
    setUnsellableQty(String(Math.max(1, p.quantity)));
    setUnsellableReason("expired");
    setUnsellableNotes("");
    setUnsellableError("");
    setModal("unsellable");
  }

  async function handleUnsellableSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!unsellableProduct || !branchId) return;
    const q = Math.floor(Number(unsellableQty));
    if (!Number.isFinite(q) || q <= 0) {
      setUnsellableError("Enter a positive whole number.");
      return;
    }
    if (q > unsellableProduct.quantity) {
      setUnsellableError("Cannot move more than current sellable quantity.");
      return;
    }
    setUnsellableSubmitting(true);
    setUnsellableError("");
    try {
      const res = await authFetch("/api/pharmacy/unsellable-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: unsellableProduct.id,
          quantity: q,
          branchId: Number(branchId),
          reason: unsellableReason,
          notes: unsellableNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUnsellableError(data.error || "Failed");
        return;
      }
      await loadProducts();
      setModal(null);
      setUnsellableProduct(null);
    } finally {
      setUnsellableSubmitting(false);
    }
  }

  if (!hasPermission("pharmacy.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Inventory" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
        Inventory is <span className="font-medium">per branch</span>. Pick a branch to view and edit stock for that location.
        {hasPermission("settings.manage")
          ? " As a branch administrator you can select any branch."
          : seesAllBranches
            ? ` (${allBranchesLabel} for your account).`
            : " (only your assigned branches)."}
      </div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Inventory" />
        <div className="flex flex-wrap gap-2">
          <Link href="/pharmacy/opening-inventory">
            <Button startIcon={<PlusIcon />} size="sm">Add Product</Button>
          </Link>
          <Link href="/pharmacy/internal-usage">
            <Button size="sm" variant="outline">Internal usage</Button>
          </Link>
          <Link href="/pharmacy/unsellable-stock">
            <Button size="sm" variant="outline">Unsellable stock</Button>
          </Link>
          <Link href="/pharmacy/pos">
            <Button size="sm" variant="primary" startIcon={<PosIcon className="size-4 shrink-0" aria-hidden />}>
              Open POS
            </Button>
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="sr-only">Branch</Label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              disabled={branches.length <= 1}
              className="h-10 min-w-[10rem] rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
              aria-label="Branch"
            >
              {branches.length === 0 ? (
                <option value="">No branches</option>
              ) : (
                branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))
              )}
            </select>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">Products</h3>
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-50 px-1.5 text-xs font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              {loading ? "…" : productTotal}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-48 rounded-lg border border-gray-200 bg-transparent px-4 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-brand-300 dark:border-gray-700 dark:text-white"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-transparent px-4 py-2 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
            <select
              value={stockType}
              onChange={(e) => setStockType(e.target.value as "all" | "sale" | "internal")}
              className="h-10 rounded-lg border border-gray-200 bg-transparent px-4 py-2 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="all">All stock types</option>
              <option value="sale">For sale (retail)</option>
              <option value="internal">Internal (non-sale)</option>
            </select>
            <select
              value={expiryFilter}
              onChange={(e) => setExpiryFilter(e.target.value as InventoryExpiryFilter)}
              className="h-10 min-w-[11rem] rounded-lg border border-gray-200 bg-transparent px-4 py-2 text-sm dark:border-gray-700 dark:text-white"
              aria-label="Filter by expiry"
            >
              <option value="all">All expiry</option>
              <option value="expired">Expired</option>
              <option value="soon">{expirySoonFilterOptionLabel(expirySoonWindow)}</option>
              <option value="not_expired">Not expired</option>
            </select>
          </div>
        </div>

        {expiryFilter === "soon" && (
          <div className="flex flex-col gap-2 border-t border-gray-200 bg-gray-50/90 px-5 py-3 dark:border-gray-800 dark:bg-white/3">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">Expiring soon</span> is measured in days from
              today, or through the end of a calendar month—adjust below.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs">Measure by</Label>
                <select
                  value={expirySoonWindow.mode}
                  onChange={(e) =>
                    setExpirySoonWindow((prev) => ({
                      ...prev,
                      mode: e.target.value as ExpirySoonMode,
                    }))
                  }
                  className="mt-1 h-10 min-w-[10rem] rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  aria-label="Expiring soon: days or months"
                >
                  <option value="days">Days</option>
                  <option value="months">Months</option>
                </select>
              </div>
              {expirySoonWindow.mode === "days" ? (
                <div>
                  <Label className="text-xs">Within (days)</Label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={expirySoonWindow.days}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(365, Math.floor(Number(e.target.value) || 1)));
                      setExpirySoonWindow((prev) => ({ ...prev, days: v }));
                    }}
                    className="mt-1 h-10 w-24 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    aria-label="Number of days for expiring soon"
                  />
                </div>
              ) : (
                <div>
                  <Label className="text-xs">Through end of month (1 = this month)</Label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={expirySoonWindow.months}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(24, Math.floor(Number(e.target.value) || 1)));
                      setExpirySoonWindow((prev) => ({ ...prev, months: v }));
                    }}
                    className="mt-1 h-10 w-24 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    aria-label="Number of months through end of calendar month"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
          </div>
        ) : productTotal === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-gray-500 dark:text-gray-400">No products yet.</p>
            <Link href="/pharmacy/opening-inventory" className="mt-2 text-brand-500 hover:underline">Add Product</Link>
          </div>
        ) : sortedProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              No products match this expiry filter. Try &quot;All expiry&quot; or adjust other filters.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader className="!normal-case">Image</TableCell>
                <SortableInventoryHeader
                  label="Barcode"
                  columnKey="code"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSortHeader}
                  className="!normal-case"
                />
                <SortableInventoryHeader
                  label="Name"
                  columnKey="name"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSortHeader}
                  className="!normal-case"
                />
                <SortableInventoryHeader
                  label="Category"
                  columnKey="category"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSortHeader}
                  className="!normal-case"
                />
                <SortableInventoryHeader
                  label="Type"
                  columnKey="type"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSortHeader}
                  className="!normal-case"
                />
                <SortableInventoryHeader
                  label="Cost Price"
                  columnKey="costPrice"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSortHeader}
                  className="!normal-case"
                />
                <SortableInventoryHeader
                  label="Selling Price"
                  columnKey="sellingPrice"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSortHeader}
                  className="!normal-case"
                />
                <SortableInventoryHeader
                  label="Qty"
                  columnKey="quantity"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSortHeader}
                  className="!normal-case"
                />
                <SortableInventoryHeader
                  label="Expiry"
                  columnKey="expiry"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSortHeader}
                  className="!normal-case"
                />
                <SortableInventoryHeader
                  label="Status"
                  columnKey="status"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSortHeader}
                  className="!normal-case"
                />
                <TableCell isHeader className="!normal-case text-right">Actions</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedProducts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                      {p.imageUrl ? (
                        <Image src={p.imageUrl} alt={p.name} width={48} height={48} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-lg font-semibold text-gray-400">{p.name.charAt(0)}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{p.code}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <Badge color="light" size="sm">{p.category?.name || "—"}</Badge>
                  </TableCell>
                  <TableCell>
                    {p.forSale ? (
                      <Badge color="success" size="sm">Retail</Badge>
                    ) : (
                      <span className="inline-flex flex-col gap-0.5">
                        <Badge color="warning" size="sm">Internal</Badge>
                        <span className="text-[10px] capitalize text-gray-500 dark:text-gray-400">
                          {p.internalPurpose || "—"}
                        </span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell>${p.costPrice.toFixed(2)}</TableCell>
                  <TableCell>{p.forSale ? `$${p.sellingPrice.toFixed(2)}` : "—"}</TableCell>
                  <TableCell>
                    <span className="font-medium">{p.quantity.toLocaleString()} pcs</span>
                    {(p.unsellableQuantity ?? 0) > 0 ? (
                      <span className="mt-0.5 block text-xs text-amber-700 dark:text-amber-300">
                        {(p.unsellableQuantity ?? 0).toLocaleString()} unsellable
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <ExpiryDateBadge expiryDate={p.expiryDate} />
                  </TableCell>
                  <TableCell>
                    <Badge color={p.quantity > 0 ? "success" : "error"} size="sm">
                      {p.quantity > 0 ? "In Stock" : "Out of Stock"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="relative inline-block text-left">
                      <button
                        type="button"
                        className="dropdown-toggle inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
                        aria-haspopup="menu"
                        aria-expanded={actionsMenuProductId === p.id}
                        aria-label={`Actions for ${p.name}`}
                        onClick={() =>
                          setActionsMenuProductId((cur) => (cur === p.id ? null : p.id))
                        }
                      >
                        <MoreDotIcon className="h-5 w-5" aria-hidden />
                      </button>
                      <Dropdown
                        isOpen={actionsMenuProductId === p.id}
                        onClose={() => setActionsMenuProductId(null)}
                        className="min-w-44 p-2"
                      >
                        <DropdownItem
                          onClick={() => {
                            const branchName = branches.find((b) => String(b.id) === branchId)?.name;
                            printProductBarcodeLabel({
                              productName: p.name,
                              code: p.code,
                              branchName,
                            });
                          }}
                          onItemClick={() => setActionsMenuProductId(null)}
                          className="flex w-full rounded-lg font-normal text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                        >
                          Print barcode label
                        </DropdownItem>
                        {canOpenPos && p.forSale && branchId ? (
                          <DropdownItem
                            tag="a"
                            href={`/pharmacy/pos?branchId=${encodeURIComponent(branchId)}&scan=${encodeURIComponent(p.code)}`}
                            onItemClick={() => setActionsMenuProductId(null)}
                            className="flex w-full rounded-lg font-normal text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                          >
                            Ring up at POS
                          </DropdownItem>
                        ) : null}
                        {canEdit && p.quantity > 0 ? (
                          <DropdownItem
                            onClick={() => openUnsellable(p)}
                            onItemClick={() => setActionsMenuProductId(null)}
                            className="flex w-full rounded-lg font-normal text-amber-800 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-500/15"
                          >
                            Move to unsellable stock
                          </DropdownItem>
                        ) : null}
                        {canEdit && branchId ? (
                          <DropdownItem
                            tag="a"
                            href={`/pharmacy/inventory/${p.id}/edit`}
                            onItemClick={() => setActionsMenuProductId(null)}
                            className="flex w-full rounded-lg font-normal text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                          >
                            Edit product
                          </DropdownItem>
                        ) : null}
                        {canDelete ? (
                          <DropdownItem
                            onClick={() => handleDelete(p.id)}
                            onItemClick={() => setActionsMenuProductId(null)}
                            className="flex w-full rounded-lg font-normal text-error-600 hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-500/10"
                          >
                            Delete
                          </DropdownItem>
                        ) : null}
                      </Dropdown>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <ListPaginationFooter
          loading={loading}
          total={productTotal}
          page={productPage}
          pageSize={productPageSize}
          noun="products"
          onPageChange={setProductPage}
        />
      </div>

      {modal === "unsellable" && unsellableProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Move to unsellable stock</h2>
              <button
                type="button"
                onClick={() => {
                  setModal(null);
                  setUnsellableProduct(null);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleUnsellableSubmit} className="space-y-4 px-6 py-5">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium text-gray-900 dark:text-white">{unsellableProduct.name}</span>
                <span className="ml-2 font-mono text-xs text-gray-500">{unsellableProduct.code}</span>
              </p>
              <p className="text-xs text-gray-500">
                Sellable on hand: {unsellableProduct.quantity.toLocaleString()} {unsellableProduct.unit || "pcs"}
              </p>
              {unsellableError && (
                <div className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                  {unsellableError}
                </div>
              )}
              <div>
                <Label htmlFor="unsellable-qty">Quantity to move (base units)</Label>
                <input
                  id="unsellable-qty"
                  type="number"
                  min={1}
                  max={unsellableProduct.quantity}
                  value={unsellableQty}
                  onChange={(e) => setUnsellableQty(e.target.value)}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <Label htmlFor="unsellable-reason">Reason</Label>
                <select
                  id="unsellable-reason"
                  value={unsellableReason}
                  onChange={(e) =>
                    setUnsellableReason(e.target.value as "expired" | "damaged" | "recall" | "other")
                  }
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                >
                  <option value="expired">Expired</option>
                  <option value="damaged">Damaged</option>
                  <option value="recall">Recall</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <Label htmlFor="unsellable-notes">Notes (optional)</Label>
                <textarea
                  id="unsellable-notes"
                  value={unsellableNotes}
                  onChange={(e) => setUnsellableNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  placeholder="Batch reference, etc."
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setModal(null);
                    setUnsellableProduct(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={unsellableSubmitting}>
                  {unsellableSubmitting ? "Moving…" : "Move to unsellable"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </>
  );
}
