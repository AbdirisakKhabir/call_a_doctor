"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Label from "@/components/form/Label";
import DateField from "@/components/form/DateField";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { TrashBinIcon } from "@/icons";
import ProductPurchaseSearch from "@/components/pharmacy/ProductPurchaseSearch";
import ProductBarcodeLabel from "@/components/pharmacy/ProductBarcodeLabel";
import { suggestBarcodeValue } from "@/lib/barcode";
import ProductUnitConversionPanel from "@/components/pharmacy/ProductUnitConversionPanel";
import {
  defaultProductSaleUnitRows,
  saleUnitRowsToPayload,
  syncBaseSaleUnitLabel,
  validateSaleUnitRowsClient,
  type ProductSaleUnitRow,
} from "@/components/pharmacy/ProductSaleUnitsEditor";

type Supplier = { id: number; name: string };
type Product = {
  id: number;
  name: string;
  code: string;
  costPrice: number;
  forSale: boolean;
  sellingPrice: number;
  unit?: string;
  saleUnits?: ProductSaleUnitRow[];
};

/** Catalog `sellingPrice` is per base unit; convert to price for the chosen purchase packaging. */
function catalogRetailPerPurchaseUnit(
  catalogPerBase: number,
  units: ProductSaleUnitRow[],
  purchaseUnitKey: string
): string {
  const u =
    units.find((x) => x.unitKey === purchaseUnitKey) ??
    units.find((x) => x.unitKey === "base") ??
    units[0];
  if (!u) return Number.isFinite(catalogPerBase) ? String(Math.round(catalogPerBase * 100) / 100) : "";
  const each = Math.max(1, Math.floor(Number(u.baseUnitsEach) || 1));
  const v = Number(catalogPerBase) * each;
  if (!Number.isFinite(v)) return "";
  return String(Math.round(v * 100) / 100);
}
type Branch = { id: number; name: string };
type Category = { id: number; name: string };

type PurchaseLineForm = {
  isNewProduct: boolean;
  productId: string;
  newName: string;
  newCode: string;
  unit: string;
  forSale: boolean;
  internalPurpose: "laboratory" | "cleaning" | "general";
  sellingPrice: string;
  categoryId: string;
  quantity: string;
  unitPrice: string;
  purchaseUnitKey: string;
  saleUnits: ProductSaleUnitRow[];
};

const emptyLine = (): PurchaseLineForm => ({
  isNewProduct: false,
  productId: "",
  newName: "",
  newCode: "",
  unit: "pcs",
  forSale: true,
  internalPurpose: "general",
  sellingPrice: "",
  categoryId: "",
  quantity: "1",
  unitPrice: "",
  purchaseUnitKey: "base",
  saleUnits: defaultProductSaleUnitRows("pcs"),
});

type LedgerPaymentMethod = {
  id: number;
  name: string;
  account: { id: number; name: string; type: string; code: string | null };
};

export default function NewPurchasePage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  /** While fetching full product after picking from search (per row). */
  const [lineLoadingIdx, setLineLoadingIdx] = useState<number | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<LedgerPaymentMethod[]>([]);
  /** Latest product row from GET /api/pharmacy/products/[id] when an existing line picks a product (prices + sale units). */
  const [productDetails, setProductDetails] = useState<Record<number, Product>>({});
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [form, setForm] = useState({
    branchId: "",
    supplierId: "",
    paymentMethodId: "",
    purchaseDate: new Date().toISOString().slice(0, 10),
    notes: "",
    items: [emptyLine()],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadPharmacyForBranch = useCallback(async (bid: string) => {
    if (!bid) return;
    const qs = `?branchId=${encodeURIComponent(bid)}`;
    const [sRes, cRes] = await Promise.all([
      authFetch(`/api/pharmacy/suppliers${qs}`),
      authFetch(`/api/pharmacy/categories${qs}`),
    ]);
    if (sRes.ok) setSuppliers(await sRes.json());
    if (cRes.ok) setCategories(await cRes.json());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMeta(true);
      const url = hasPermission("settings.manage") ? "/api/branches?all=true" : "/api/branches";
      const [bRes, pmRes] = await Promise.all([authFetch(url), authFetch("/api/pharmacy/payment-methods")]);
      if (!cancelled && bRes.ok) {
        const data: Branch[] = await bRes.json();
        setBranches(data);
        setForm((f) => ({
          ...f,
          branchId: f.branchId || (data[0] ? String(data[0].id) : ""),
        }));
      }
      if (!cancelled && pmRes.ok) setPaymentMethods(await pmRes.json());
      if (!cancelled) setLoadingMeta(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasPermission]);

  useEffect(() => {
    if (form.branchId) {
      setProductDetails({});
      void loadPharmacyForBranch(form.branchId);
    }
  }, [form.branchId, loadPharmacyForBranch]);

  useEffect(() => {
    if (paymentMethods.length === 0) return;
    setForm((f) => {
      if (f.paymentMethodId) return f;
      return { ...f, paymentMethodId: String(paymentMethods[0].id) };
    });
  }, [paymentMethods]);

  useEffect(() => {
    if (suppliers.length === 0) return;
    setForm((f) => {
      if (!f.supplierId) return f;
      const ok = suppliers.some((s) => String(s.id) === f.supplierId);
      if (ok) return f;
      return { ...f, supplierId: "" };
    });
  }, [suppliers]);

  function addItem() {
    setForm((f) => ({ ...f, items: [...f.items, emptyLine()] }));
  }

  function removeItem(idx: number) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  function updateItem(idx: number, field: keyof PurchaseLineForm, value: string | boolean) {
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
    }));
  }

  async function applyExistingProduct(idx: number, productId: string) {
    if (!productId) {
      setLineLoadingIdx(null);
      setForm((f) => ({
        ...f,
        items: f.items.map((row, i) =>
          i === idx ? { ...row, productId: "", unitPrice: "", sellingPrice: "", purchaseUnitKey: "base" } : row
        ),
      }));
      return;
    }
    setLineLoadingIdx(idx);
    try {
      const res = await authFetch(`/api/pharmacy/products/${productId}`);
      if (!res.ok) return;
      const p: Product = await res.json();
      setProductDetails((prev) => ({ ...prev, [p.id]: p }));
      const units = p.saleUnits?.length ? p.saleUnits : defaultProductSaleUnitRows(p.unit ?? "pcs");
      setForm((f) => ({
        ...f,
        items: f.items.map((row, i) =>
          i === idx
            ? {
                ...row,
                productId,
                purchaseUnitKey: "base",
                unitPrice: String(p.costPrice ?? ""),
                sellingPrice: p.forSale ? catalogRetailPerPurchaseUnit(p.sellingPrice ?? 0, units, "base") : "",
              }
            : row
        ),
      }));
    } finally {
      setLineLoadingIdx(null);
    }
  }

  function saleUnitsForLine(it: PurchaseLineForm): ProductSaleUnitRow[] {
    if (it.isNewProduct) {
      return it.saleUnits?.length ? it.saleUnits : defaultProductSaleUnitRows(it.unit);
    }
    if (!it.productId) {
      return [{ unitKey: "base", label: "Unit", baseUnitsEach: 1 }];
    }
    const id = Number(it.productId);
    const fromDetail = productDetails[id];
    return fromDetail?.saleUnits?.length
      ? fromDetail.saleUnits
      : defaultProductSaleUnitRows(fromDetail?.unit ?? "pcs");
  }

  function setPurchaseUnitForLine(idx: number, purchaseUnitKey: string) {
    setForm((f) => ({
      ...f,
      items: f.items.map((row, i) => {
        if (i !== idx) return row;
        const next = { ...row, purchaseUnitKey };
        if (!row.isNewProduct && row.productId) {
          const pid = Number(row.productId);
          const d = productDetails[pid];
          if (d?.forSale) {
            const u = saleUnitsForLine(next);
            next.sellingPrice = catalogRetailPerPurchaseUnit(d.sellingPrice ?? 0, u, purchaseUnitKey);
          }
        }
        return next;
      }),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const validItems: (
        | {
            productId: number;
            quantity: number;
            unitPrice: number;
            purchaseUnitKey: string;
            sellingPrice?: number;
          }
        | {
            newProduct: {
              name: string;
              code: string;
              unit: string;
              forSale: boolean;
              internalPurpose?: string;
              sellingPrice: number;
              categoryId: number | null;
              saleUnits: ReturnType<typeof saleUnitRowsToPayload>;
            };
            quantity: number;
            unitPrice: number;
            purchaseUnitKey: string;
          }
      )[] = [];

      for (const it of form.items) {
        const quantity = Math.max(1, Math.floor(Number(it.quantity) || 0));
        const unitPrice = Number(it.unitPrice);
        if (!it.quantity?.trim() || Number.isNaN(unitPrice) || unitPrice < 0) continue;

        if (it.isNewProduct) {
          const name = it.newName.trim();
          const code = it.newCode.trim();
          if (!name || !code) continue;
          const uCheck = validateSaleUnitRowsClient(it.saleUnits);
          if (!uCheck.ok) {
            setError(uCheck.error);
            return;
          }
          const unitKeys = new Set(it.saleUnits.map((r) => r.unitKey));
          const purchaseUnitKey = unitKeys.has(it.purchaseUnitKey) ? it.purchaseUnitKey : "base";
          validItems.push({
            newProduct: {
              name,
              code,
              unit: it.unit.trim() || "pcs",
              forSale: it.forSale,
              ...(it.forSale ? {} : { internalPurpose: it.internalPurpose }),
              sellingPrice: it.forSale ? Math.max(0, Number(it.sellingPrice) || 0) : 0,
              categoryId: it.categoryId ? Number(it.categoryId) : null,
              saleUnits: saleUnitRowsToPayload(it.saleUnits),
            },
            quantity,
            unitPrice,
            purchaseUnitKey,
          });
        } else {
          const purchaseUnitKey = it.purchaseUnitKey || "base";
          if (!it.productId) continue;
          const pid = Number(it.productId);
          const prod = productDetails[pid];
          if (!prod) continue;
          const line: {
            productId: number;
            quantity: number;
            unitPrice: number;
            purchaseUnitKey: string;
            sellingPrice?: number;
          } = {
            productId: pid,
            quantity,
            unitPrice,
            purchaseUnitKey,
          };
          if (prod && prod.forSale && it.sellingPrice.trim() !== "") {
            line.sellingPrice = Math.max(0, Number(it.sellingPrice) || 0);
          }
          validItems.push(line);
        }
      }

      if (validItems.length === 0) {
        setError("Add at least one complete line: existing product (or new name & code), quantity, and unit cost.");
        return;
      }

      const res = await authFetch("/api/pharmacy/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: Number(form.branchId),
          supplierId:
            form.supplierId && String(form.supplierId).trim() !== "" ? Number(form.supplierId) : null,
          paymentMethodId: Number(form.paymentMethodId),
          purchaseDate: form.purchaseDate,
          notes: form.notes || null,
          items: validItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create purchase");
        return;
      }
      router.push("/pharmacy/purchases");
    } finally {
      setSubmitting(false);
    }
  }

  const canCreate = hasPermission("pharmacy.create");

  if (!hasPermission("pharmacy.view")) {
    return (
      <div>
        <div className="mb-6">
          <Link href="/pharmacy/purchases" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
            ← Purchases
          </Link>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">You do not have permission.</p>
      </div>
    );
  }

  if (!canCreate) {
    return (
      <div>
        <div className="mb-6">
          <Link href="/pharmacy/purchases" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
            ← Purchases
          </Link>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">You do not have permission to create purchases.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/pharmacy/purchases" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          ← Back to Purchases
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">New purchase</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Record stock received from a supplier and pay from a linked account.
        </p>
      </div>

      {loadingMeta ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
        </div>
      ) : (
        <>
          {!loadingMeta && branches.length === 0 && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              No branch is assigned. Add branches under Settings before recording purchases.
            </div>
          )}
          {!loadingMeta && paymentMethods.length === 0 && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              No payment methods found. Create accounts and payment methods under Settings first.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                {error}
              </div>
            )}

            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
              <h2 className="mb-4 text-sm font-semibold text-gray-800 dark:text-white">Header</h2>
              <div className="space-y-4">
                <div>
                  <Label>Payment method *</Label>
                  <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                    Money is withdrawn from the linked finance account (Settings → Payment methods).
                  </p>
                  <select
                    required
                    value={form.paymentMethodId}
                    onChange={(e) => setForm((f) => ({ ...f, paymentMethodId: e.target.value }))}
                    className="h-11 w-full max-w-xl rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                  >
                    <option value="">Select account payment method</option>
                    {paymentMethods.map((pm) => (
                      <option key={pm.id} value={String(pm.id)}>
                        {pm.name} — {pm.account.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <Label>Branch *</Label>
                    <select
                      required
                      value={form.branchId}
                      disabled={branches.length === 1}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          branchId: e.target.value,
                          supplierId: "",
                        }))
                      }
                      className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm disabled:opacity-75 dark:border-gray-700 dark:text-white"
                    >
                      <option value="">Select branch</option>
                      {branches.map((b) => (
                        <option key={b.id} value={String(b.id)}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Supplier</Label>
                    <select
                      value={form.supplierId}
                      onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
                      className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                    >
                      <option value="">No supplier</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={String(s.id)}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <DateField
                    id="purchase-date-new"
                    label="Date *"
                    required
                    value={form.purchaseDate}
                    onChange={(v) => setForm((f) => ({ ...f, purchaseDate: v }))}
                    appendToBody
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    className="h-20 w-full max-w-2xl rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Purchased items</h2>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  Add row
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-transparent! hover:bg-transparent!">
                      <TableCell isHeader className="whitespace-nowrap">
                        #
                      </TableCell>
                      <TableCell isHeader className="min-w-[8rem] whitespace-nowrap">
                        New product
                      </TableCell>
                      <TableCell isHeader className="min-w-[14rem]">
                        Item
                      </TableCell>
                      <TableCell isHeader className="whitespace-nowrap">
                        Purchase unit
                      </TableCell>
                      <TableCell isHeader className="whitespace-nowrap">
                        Qty
                      </TableCell>
                      <TableCell isHeader className="whitespace-nowrap">
                        Unit cost *
                      </TableCell>
                      <TableCell isHeader className="min-w-[7rem] whitespace-nowrap">
                        <span className="block">Retail</span>
                        <span className="block text-[10px] font-normal normal-case text-gray-500 dark:text-gray-400">
                          per purchase unit
                        </span>
                      </TableCell>
                      <TableCell isHeader className="w-12 text-right">
                        {" "}
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {form.items.map((it, idx) => {
                      const detail = it.productId ? productDetails[Number(it.productId)] : undefined;
                      const forSale = it.isNewProduct ? it.forSale : detail?.forSale;
                      const units = saleUnitsForLine(it);
                      return (
                        <TableRow key={idx} className="align-top">
                          <TableCell className="whitespace-nowrap text-gray-500 dark:text-gray-400">{idx + 1}</TableCell>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={it.isNewProduct}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setForm((f) => ({
                                  ...f,
                                  items: f.items.map((row, i) =>
                                    i === idx
                                      ? {
                                          ...emptyLine(),
                                          isNewProduct: checked,
                                          quantity: row.quantity,
                                          unitPrice: row.unitPrice,
                                        }
                                      : row
                                  ),
                                }));
                              }}
                              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                              aria-label="New product line"
                            />
                          </TableCell>
                          <TableCell>
                            {it.isNewProduct ? (
                              <div className="flex min-w-[16rem] flex-col gap-2 sm:min-w-[18rem]">
                                <input
                                  value={it.newName}
                                  onChange={(e) => updateItem(idx, "newName", e.target.value)}
                                  placeholder="Name *"
                                  className="h-9 w-full rounded-lg border border-gray-200 bg-transparent px-2 text-sm dark:border-gray-700 dark:text-white"
                                />
                                <div>
                                  <div className="flex flex-wrap items-end justify-between gap-2">
                                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Barcode / code *</span>
                                    <button
                                      type="button"
                                      onClick={() => updateItem(idx, "newCode", suggestBarcodeValue())}
                                      className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                                    >
                                      Generate barcode
                                    </button>
                                  </div>
                                  <input
                                    value={it.newCode}
                                    onChange={(e) => updateItem(idx, "newCode", e.target.value.toUpperCase())}
                                    placeholder="SKU or scan"
                                    className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-transparent px-2 font-mono text-sm dark:border-gray-700 dark:text-white"
                                    autoComplete="off"
                                  />
                                  <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                                    Unique per branch; CODE128 preview below (same as POS labels).
                                  </p>
                                  <div className="mt-2 max-w-xs rounded-lg border border-gray-100 bg-gray-50/80 p-2 dark:border-gray-700 dark:bg-gray-800/50">
                                    <ProductBarcodeLabel value={it.newCode} />
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <select
                                    value={it.unit}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setForm((f) => ({
                                        ...f,
                                        items: f.items.map((row, i) =>
                                          i === idx
                                            ? {
                                                ...row,
                                                unit: v,
                                                saleUnits: syncBaseSaleUnitLabel(row.saleUnits, v),
                                              }
                                            : row
                                        ),
                                      }));
                                    }}
                                    className="h-9 rounded-lg border border-gray-200 bg-transparent px-2 text-sm dark:border-gray-700 dark:text-white"
                                  >
                                    <option value="pcs">pcs</option>
                                    <option value="box">box</option>
                                    <option value="bottle">bottle</option>
                                    <option value="pack">pack</option>
                                    <option value="strip">strip</option>
                                    <option value="ml">ml</option>
                                  </select>
                                  <select
                                    value={it.categoryId}
                                    onChange={(e) => updateItem(idx, "categoryId", e.target.value)}
                                    className="h-9 min-w-[8rem] rounded-lg border border-gray-200 bg-transparent px-2 text-sm dark:border-gray-700 dark:text-white"
                                  >
                                    <option value="">Category</option>
                                    {categories.map((c) => (
                                      <option key={c.id} value={String(c.id)}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                                  <input
                                    type="checkbox"
                                    checked={it.forSale}
                                    onChange={(e) => updateItem(idx, "forSale", e.target.checked)}
                                    className="rounded border-gray-300 text-brand-600"
                                  />
                                  For sale (POS)
                                </label>
                                {!it.forSale && (
                                  <select
                                    value={it.internalPurpose}
                                    onChange={(e) =>
                                      updateItem(idx, "internalPurpose", e.target.value as PurchaseLineForm["internalPurpose"])
                                    }
                                    className="h-9 max-w-xs rounded-lg border border-gray-200 bg-transparent px-2 text-sm dark:border-gray-700 dark:text-white"
                                  >
                                    <option value="laboratory">Laboratory</option>
                                    <option value="cleaning">Cleaning</option>
                                    <option value="general">General</option>
                                  </select>
                                )}
                                <div className="mt-2 max-w-md rounded-lg border border-gray-200 bg-gray-50/80 p-2 dark:border-gray-700 dark:bg-gray-900/30">
                                  <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    Unit conversion
                                  </p>
                                  <ProductUnitConversionPanel
                                    rows={it.saleUnits}
                                    onChange={(rows) => {
                                      setForm((f) => ({
                                        ...f,
                                        items: f.items.map((row, i) => {
                                          if (i !== idx) return row;
                                          const keys = new Set(rows.map((r) => r.unitKey));
                                          const puk = keys.has(row.purchaseUnitKey) ? row.purchaseUnitKey : "base";
                                          return { ...row, saleUnits: rows, purchaseUnitKey: puk };
                                        }),
                                      }));
                                    }}
                                    disabled={submitting}
                                    className="max-h-56 overflow-y-auto pr-1"
                                  />
                                </div>
                              </div>
                            ) : (
                              <ProductPurchaseSearch
                                branchId={form.branchId}
                                disabled={!form.branchId}
                                selectedProductId={it.productId}
                                selectedSummary={
                                  detail ? `${detail.name} (${detail.code})` : null
                                }
                                loading={lineLoadingIdx === idx}
                                onPick={(id) => void applyExistingProduct(idx, id)}
                                onClear={() => void applyExistingProduct(idx, "")}
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            {it.isNewProduct || it.productId ? (
                              <select
                                value={
                                  units.some((u) => u.unitKey === it.purchaseUnitKey)
                                    ? it.purchaseUnitKey
                                    : "base"
                                }
                                onChange={(e) => setPurchaseUnitForLine(idx, e.target.value)}
                                className="h-9 min-w-[7rem] rounded-lg border border-gray-200 bg-transparent px-2 text-sm dark:border-gray-700 dark:text-white"
                              >
                                {units.map((u) => (
                                  <option key={u.unitKey} value={u.unitKey}>
                                    {u.label} (×{u.baseUnitsEach})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <input
                              type="number"
                              min={1}
                              value={it.quantity}
                              onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                              className="h-9 w-16 rounded-lg border border-gray-200 bg-transparent px-2 text-sm dark:border-gray-700 dark:text-white"
                            />
                          </TableCell>
                          <TableCell>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={it.unitPrice}
                              onChange={(e) => updateItem(idx, "unitPrice", e.target.value)}
                              placeholder="0.00"
                              className="h-9 w-24 rounded-lg border border-gray-200 bg-transparent px-2 text-sm dark:border-gray-700 dark:text-white"
                            />
                          </TableCell>
                          <TableCell>
                            {it.isNewProduct && it.forSale ? (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={it.sellingPrice}
                                onChange={(e) => updateItem(idx, "sellingPrice", e.target.value)}
                                placeholder="POS price"
                                className="h-9 w-28 rounded-lg border border-gray-200 bg-transparent px-2 text-sm dark:border-gray-700 dark:text-white"
                              />
                            ) : !it.isNewProduct && it.productId && forSale ? (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={it.sellingPrice}
                                onChange={(e) => updateItem(idx, "sellingPrice", e.target.value)}
                                placeholder={
                                  detail
                                    ? `Cat. ${catalogRetailPerPurchaseUnit(detail.sellingPrice, units, it.purchaseUnitKey)}`
                                    : "Optional"
                                }
                                title="Retail price for one row of the selected purchase unit (e.g. one box). Stored per smallest stock unit."
                                className="h-9 w-28 rounded-lg border border-gray-200 bg-transparent px-2 text-sm dark:border-gray-700 dark:text-white"
                              />
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              disabled={form.items.length <= 1}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-error-500 hover:bg-error-50 disabled:opacity-30 dark:hover:bg-error-500/10"
                              aria-label="Remove line"
                            >
                              <TrashBinIcon className="h-4 w-4" />
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <Link
                href="/pharmacy/purchases"
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-white/[0.03]"
              >
                Cancel
              </Link>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Create purchase"}
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
