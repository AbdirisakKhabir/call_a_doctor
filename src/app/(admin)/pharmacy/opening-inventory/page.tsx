"use client";

import React, { useEffect, useState, useRef } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import DateField from "@/components/form/DateField";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PlusIcon } from "@/icons";
import Image from "next/image";
import ProductBarcodeLabel from "@/components/pharmacy/ProductBarcodeLabel";
import { suggestBarcodeValue } from "@/lib/barcode";
import ProductSaleUnitsEditor, {
  defaultProductSaleUnitRows,
  saleUnitRowsToPayload,
  syncBaseSaleUnitLabel,
  validateSaleUnitRowsClient,
  type ProductSaleUnitRow,
} from "@/components/pharmacy/ProductSaleUnitsEditor";

type Category = { id: number; name: string };
type Branch = { id: number; name: string };

export default function OpeningInventoryPage() {
  const { hasPermission } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: "",
    code: "",
    description: "",
    costPrice: "",
    sellingPrice: "",
    quantity: "",
    unit: "pcs",
    categoryId: "",
    forSale: true,
    internalPurpose: "general" as "laboratory" | "cleaning" | "general",
    expiryDate: "",
  });
  const [saleUnitRows, setSaleUnitRows] = useState<ProductSaleUnitRow[]>(() => defaultProductSaleUnitRows("pcs"));

  const canManageSettings = hasPermission("settings.manage");

  useEffect(() => {
    let cancelled = false;
    async function loadBranches() {
      const url = canManageSettings ? "/api/branches?all=true" : "/api/branches";
      const res = await authFetch(url);
      if (!res.ok || cancelled) return;
      const data: Branch[] = await res.json();
      setBranches(data);
      setBranchId((prev) => {
        if (prev && data.some((b) => String(b.id) === prev)) return prev;
        return data[0] ? String(data[0].id) : "";
      });
    }
    loadBranches();
    return () => {
      cancelled = true;
    };
  }, [canManageSettings]);

  useEffect(() => {
    if (!branchId) {
      setCategories([]);
      return;
    }
    let cancelled = false;
    authFetch(`/api/pharmacy/categories?branchId=${encodeURIComponent(branchId)}`)
      .then((r) => (r.ok ? r.json() : Promise.resolve([])))
      .then((data) => {
        if (!cancelled) setCategories(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    setForm((f) => ({ ...f, categoryId: "" }));
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  useEffect(() => {
    setSaleUnitRows((rows) => syncBaseSaleUnitLabel(rows, form.unit));
  }, [form.unit]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    } else {
      setImageFile(null);
      setImagePreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      let imageUrl: string | null = null;
      let imagePublicId: string | null = null;

      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        fd.append("folder", "clinic/pharmacy/products");
        const uploadRes = await authFetch("/api/upload", {
          method: "POST",
          body: fd,
        });
        if (!uploadRes.ok) {
          const d = await uploadRes.json();
          setError(d.error || "Image upload failed");
          return;
        }
        const uploadData = await uploadRes.json();
        imageUrl = uploadData.url;
        imagePublicId = uploadData.publicId;
      }

      if (!branchId) {
        setError("Select a branch.");
        return;
      }

      const unitsCheck = validateSaleUnitRowsClient(saleUnitRows);
      if (!unitsCheck.ok) {
        setError(unitsCheck.error);
        return;
      }

      const res = await authFetch("/api/pharmacy/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: Number(branchId),
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          description: form.description.trim() || null,
          imageUrl,
          imagePublicId,
          costPrice: Number(form.costPrice) || 0,
          sellingPrice: form.forSale ? Number(form.sellingPrice) || 0 : 0,
          quantity: Math.max(0, Math.floor(Number(form.quantity) || 0)),
          unit: form.unit,
          categoryId: form.categoryId ? Number(form.categoryId) : null,
          forSale: form.forSale,
          internalPurpose: form.forSale ? undefined : form.internalPurpose,
          expiryDate: form.expiryDate.trim() ? form.expiryDate : undefined,
          saleUnits: saleUnitRowsToPayload(saleUnitRows),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add product");
        return;
      }
      setForm({
        name: "",
        code: "",
        description: "",
        costPrice: "",
        sellingPrice: "",
        quantity: "",
        unit: "pcs",
        categoryId: "",
        forSale: true,
        internalPurpose: "general",
        expiryDate: "",
      });
      setSaleUnitRows(defaultProductSaleUnitRows("pcs"));
      setImageFile(null);
      setImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setSubmitting(false);
    }
  };

  if (!hasPermission("pharmacy.view") && !hasPermission("pharmacy.create")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Opening Inventory" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="Opening Inventory" />
      <div className="mt-6 max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/3">
        <h2 className="mb-6 text-lg font-semibold text-gray-800 dark:text-white/90">Add Product to Opening Inventory</h2>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          Retail items appear on POS. Internal supplies (lab, cleaning) are tracked separately and use the Internal usage screen to deduct stock. Stock is added for the branch you select below.
        </p>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label>Branch *</Label>
            <select
              required
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              disabled={branches.length <= 1}
              className="mt-1.5 h-11 w-full max-w-md rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            >
              {branches.length === 0 ? (
                <option value="">No branches available</option>
              ) : (
                branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))
              )}
            </select>
          </div>
          {error && (
            <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">{error}</div>
          )}
          <div>
            <Label>Inventory type *</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, forSale: true }))}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  form.forSale
                    ? "bg-brand-500 text-white"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                For sale (retail / POS)
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, forSale: false }))}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  !form.forSale
                    ? "bg-brand-500 text-white"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                Internal (not for sale)
              </button>
            </div>
            {!form.forSale && (
              <div className="mt-3">
                <Label className="text-xs">Purpose *</Label>
                <select
                  value={form.internalPurpose}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      internalPurpose: e.target.value as "laboratory" | "cleaning" | "general",
                    }))
                  }
                  className="mt-1 h-11 w-full max-w-md rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                >
                  <option value="laboratory">Laboratory</option>
                  <option value="cleaning">Cleaning</option>
                  <option value="general">General / other</option>
                </select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <Label>Product Name *</Label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Paracetamol 500mg"
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white dark:placeholder:text-gray-500"
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
                  Generate barcode
                </button>
              </div>
              <input
                required
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="Unique per branch — scanned at POS"
                className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 font-mono text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white dark:placeholder:text-gray-500"
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Saved in uppercase. Preview uses CODE128 for printing labels.
              </p>
              <div className="mt-3 max-w-md">
                <ProductBarcodeLabel value={form.code} />
              </div>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Product description"
              rows={2}
              className="h-20 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white dark:placeholder:text-gray-500"
            />
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex flex-col items-start gap-2">
              <Label>Product Image</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
                id="product-image"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 text-gray-400 transition-colors hover:border-brand-400 hover:text-brand-500 dark:border-gray-700 dark:bg-gray-800"
              >
                {imagePreview ? (
                  <Image src={imagePreview} alt="Preview" width={96} height={96} className="h-full w-full rounded-2xl object-cover" />
                ) : (
                  <PlusIcon className="h-8 w-8" />
                )}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div>
              <Label>Cost Price *</Label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={form.costPrice}
                onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                placeholder="0.00"
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white dark:placeholder:text-gray-500"
              />
            </div>
            <div>
              <Label>{form.forSale ? "Selling Price *" : "Selling (N/A)"}</Label>
              <input
                type="number"
                step="0.01"
                min="0"
                required={form.forSale}
                disabled={!form.forSale}
                value={form.forSale ? form.sellingPrice : "0"}
                onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))}
                placeholder="0.00"
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-white dark:placeholder:text-gray-500"
              />
            </div>
            <div>
              <Label>Initial quantity (pieces) *</Label>
              <input
                type="number"
                min="0"
                required
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                placeholder="0"
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white dark:placeholder:text-gray-500"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Stock is tracked in pieces (pcs).
          </p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <Label>Base unit preset</Label>
              <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                Stored on the product record; the <strong className="font-medium">base</strong> packaging row below uses this for its label.
              </p>
              <select
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white"
              >
                <option value="pcs">Pieces</option>
                <option value="box">Box</option>
                <option value="bottle">Bottle</option>
                <option value="pack">Pack</option>
                <option value="strip">Strip</option>
                <option value="ml">ml</option>
              </select>
            </div>
            <div>
              <Label>Category</Label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={String(c.id)}> {c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
            <Label className="mb-3 text-sm">POS &amp; purchase packaging</Label>
            <ProductSaleUnitsEditor rows={saleUnitRows} onChange={setSaleUnitRows} disabled={submitting} />
          </div>
          <div>
            <DateField
              id="opening-expiry"
              label="Expiry date"
              value={form.expiryDate}
              onChange={(v) => setForm((f) => ({ ...f, expiryDate: v }))}
              appendToBody
              className="max-w-md"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Optional (e.g. batch expiry for medicines).</p>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="submit" disabled={submitting} size="sm">
              {submitting ? "Adding..." : "Add Product"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
