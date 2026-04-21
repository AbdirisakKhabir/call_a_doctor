"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import DateField from "@/components/form/DateField";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import ProductBarcodeLabel from "@/components/pharmacy/ProductBarcodeLabel";
import { suggestBarcodeValue } from "@/lib/barcode";
import { computeBaseQuantityFromPackagingLines } from "@/lib/product-quantity-lines";

type Product = {
  id: number;
  name: string;
  code: string;
  branchId?: number;
  saleUnits?: { unitKey: string; label: string; baseUnitsEach: number }[];
};

type Category = { id: number; name: string };

export default function EditInventoryProductPage() {
  const params = useParams();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const rawId = params?.id;
  const productId = typeof rawId === "string" ? Number(rawId) : NaN;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({
    name: "",
    code: "",
    costPrice: "",
    sellingPrice: "",
    quantity: "",
    unit: "pcs",
    categoryId: "",
    forSale: true,
    internalPurpose: "general" as "laboratory" | "cleaning" | "general",
    expiryDate: "",
  });
  const [useMixedStock, setUseMixedStock] = useState(false);
  const [stockLines, setStockLines] = useState<{ unitKey: string; qty: string }[]>([{ unitKey: "base", qty: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canEdit = hasPermission("pharmacy.edit");

  useEffect(() => {
    if (!Number.isInteger(productId) || productId <= 0) {
      setLoading(false);
      setLoadError("Invalid product.");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const res = await authFetch(`/api/pharmacy/products/${productId}`);
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setLoadError(data.error || "Product not found");
          return;
        }
        if (cancelled) return;
        const p = data as Product & {
          costPrice: number;
          sellingPrice: number;
          quantity: number;
          unit: string;
          forSale: boolean;
          internalPurpose: string | null;
          expiryDate: string | null;
          category: { id: number; name: string } | null;
        };
        setEditingProduct(p);
        setForm({
          name: p.name,
          code: p.code,
          costPrice: String(p.costPrice),
          sellingPrice: String(p.sellingPrice),
          quantity: String(p.quantity),
          unit: p.unit,
          categoryId: p.category?.id ? String(p.category.id) : "",
          forSale: p.forSale,
          internalPurpose:
            (p.internalPurpose === "laboratory" || p.internalPurpose === "cleaning" ? p.internalPurpose : "general") as
              | "laboratory"
              | "cleaning"
              | "general",
          expiryDate: p.expiryDate ? p.expiryDate.slice(0, 10) : "",
        });
        setUseMixedStock(false);
        const units = p.saleUnits ?? [];
        const baseKey = units.find((u) => u.unitKey === "base")?.unitKey ?? units[0]?.unitKey ?? "base";
        setStockLines([{ unitKey: baseKey, qty: String(p.quantity) }]);

        const bid = p.branchId;
        if (bid != null) {
          const cRes = await authFetch(`/api/pharmacy/categories?branchId=${encodeURIComponent(String(bid))}`);
          if (!cancelled && cRes.ok) setCategories(await cRes.json());
        }
      } catch {
        if (!cancelled) setLoadError("Failed to load product");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const mixedStockBasePreview = useMemo(() => {
    if (!useMixedStock || !editingProduct?.saleUnits?.length) return null;
    const lines = stockLines
      .map((l) => ({ unitKey: l.unitKey, quantity: Math.floor(Number(l.qty) || 0) }))
      .filter((l) => l.quantity > 0);
    if (!lines.length) return { ok: true as const, base: 0 };
    return computeBaseQuantityFromPackagingLines(lines, editingProduct.saleUnits);
  }, [useMixedStock, editingProduct, stockLines]);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingProduct || !canEdit) return;
    setError("");
    setSubmitting(true);
    try {
      const units = editingProduct.saleUnits ?? [];
      const canMixed = units.length > 1;

      let quantityPayload: { quantity?: number; quantityLines?: { unitKey: string; quantity: number }[] };
      if (useMixedStock && canMixed) {
        const lines = stockLines
          .map((l) => ({ unitKey: l.unitKey, quantity: Math.floor(Number(l.qty) || 0) }))
          .filter((l) => l.quantity > 0);
        if (lines.length === 0) {
          setError("Enter at least one line with a quantity, or turn off “Multiple units”.");
          setSubmitting(false);
          return;
        }
        const conv = computeBaseQuantityFromPackagingLines(lines, units);
        if (!conv.ok) {
          setError(conv.error);
          setSubmitting(false);
          return;
        }
        quantityPayload = { quantityLines: lines };
      } else {
        quantityPayload = { quantity: Math.max(0, Math.floor(Number(form.quantity) || 0)) };
      }

      const res = await authFetch(`/api/pharmacy/products/${editingProduct.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          costPrice: Number(form.costPrice) || 0,
          sellingPrice: form.forSale ? Number(form.sellingPrice) || 0 : 0,
          ...quantityPayload,
          unit: form.unit,
          categoryId: form.categoryId ? Number(form.categoryId) : null,
          forSale: form.forSale,
          internalPurpose: form.forSale ? null : form.internalPurpose,
          expiryDate: form.expiryDate.trim() ? form.expiryDate : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update");
        return;
      }
      router.push("/pharmacy/inventory");
    } finally {
      setSubmitting(false);
    }
  }

  if (!hasPermission("pharmacy.view")) {
    return (
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">You do not have permission.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
      </div>
    );
  }

  if (loadError || !editingProduct) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-error-600 dark:text-error-400">{loadError || "Product not found."}</p>
        <Link href="/pharmacy/inventory" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          ← Back to Inventory
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/pharmacy/inventory" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          ← Back to Inventory
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">Edit product</h1>
        <p className="mt-1 font-mono text-sm text-gray-500 dark:text-gray-400">{editingProduct.code}</p>
      </div>

      {!canEdit ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">You do not have permission to edit inventory.</p>
      ) : (
        <form onSubmit={handleUpdate} className="mx-auto max-w-md space-y-4">
          {error && (
            <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
              {error}
            </div>
          )}
          <div>
            <Label>Stock type *</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, forSale: true }))}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  form.forSale ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                For sale
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, forSale: false }))}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  !form.forSale ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                Internal
              </button>
            </div>
            {!form.forSale && (
              <select
                value={form.internalPurpose}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    internalPurpose: e.target.value as "laboratory" | "cleaning" | "general",
                  }))
                }
                className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
              >
                <option value="laboratory">Laboratory</option>
                <option value="cleaning">Cleaning</option>
                <option value="general">General</option>
              </select>
            )}
          </div>
          <div>
            <Label>Name *</Label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Label>Barcode *</Label>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, code: suggestBarcodeValue() }))}
                className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                Generate new barcode
              </button>
            </div>
            <input
              required
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 font-mono text-sm dark:border-gray-700 dark:text-white"
              autoComplete="off"
              placeholder="Unique per branch (scan at POS)"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Printed on labels; USB scanners read this value at POS. CODE128 is used for the label preview.
            </p>
            <div className="mt-3">
              <ProductBarcodeLabel value={form.code} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Cost Price</Label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.costPrice}
                onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
              />
            </div>
            <div>
              <Label>Selling Price</Label>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={!form.forSale}
                value={form.forSale ? form.sellingPrice : "0"}
                onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))}
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm disabled:opacity-60 dark:border-gray-700 dark:text-white"
              />
            </div>
          </div>
          <div>
            <Label>Quantity (base pieces on hand)</Label>
            {editingProduct.saleUnits && editingProduct.saleUnits.length > 1 ? (
              <div className="space-y-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={useMixedStock}
                    onChange={(e) => setUseMixedStock(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  <span>Enter using multiple units (e.g. boxes and loose pieces)</span>
                </label>
                {useMixedStock ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                    <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">
                      Each row is a count in that packaging. Totals convert to base pieces using your sale units.
                    </p>
                    <ul className="space-y-2">
                      {stockLines.map((line, idx) => (
                        <li key={idx} className="flex flex-wrap items-center gap-2">
                          <select
                            value={line.unitKey}
                            onChange={(e) => {
                              const v = e.target.value;
                              setStockLines((rows) => rows.map((r, i) => (i === idx ? { ...r, unitKey: v } : r)));
                            }}
                            className="h-10 min-w-32 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                          >
                            {editingProduct.saleUnits!.map((u) => (
                              <option key={u.unitKey} value={u.unitKey}>
                                {u.label} ({u.baseUnitsEach} pcs each)
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="0"
                            value={line.qty}
                            onChange={(e) => {
                              const v = e.target.value;
                              setStockLines((rows) => rows.map((r, i) => (i === idx ? { ...r, qty: v } : r)));
                            }}
                            className="h-10 w-24 rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => setStockLines((rows) => rows.filter((_, i) => i !== idx))}
                            disabled={stockLines.length <= 1}
                            className="text-xs text-error-600 hover:underline disabled:opacity-40 dark:text-error-400"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() =>
                        setStockLines((rows) => [
                          ...rows,
                          {
                            unitKey:
                              editingProduct.saleUnits!.find((u) => u.unitKey === "base")?.unitKey ??
                              editingProduct.saleUnits![0].unitKey,
                            qty: "",
                          },
                        ])
                      }
                      className="mt-2 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                    >
                      + Add line
                    </button>
                    {mixedStockBasePreview && (
                      <p className="mt-2 text-sm font-medium text-gray-800 dark:text-gray-200">
                        {mixedStockBasePreview.ok
                          ? `Total in base pieces: ${mixedStockBasePreview.base}`
                          : mixedStockBasePreview.error}
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <input
                      type="number"
                      min="0"
                      value={form.quantity}
                      onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                      className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Single total in base pieces. Turn on “multiple units” to split by packaging.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <>
                <input
                  type="number"
                  min="0"
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Inventory is tracked in base pieces (pcs). Add sale units on the product to enter mixed packagings.
                </p>
              </>
            )}
          </div>
          <div>
            <Label>Category</Label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <DateField
              id="inventory-expiry-edit"
              label="Expiry date"
              value={form.expiryDate}
              onChange={(v) => setForm((f) => ({ ...f, expiryDate: v }))}
              appendToBody
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Optional. Clear the field and save to remove.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <Link
              href="/pharmacy/inventory"
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-white/3"
            >
              Cancel
            </Link>
            <Button type="submit" disabled={submitting} size="sm">
              {submitting ? "Saving…" : "Update"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
