"use client";

import React, { useEffect, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
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
import { useBranchScope } from "@/hooks/useBranchScope";
import { PlusIcon } from "@/icons";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type Purchase = {
  id: number;
  purchaseDate: string;
  totalAmount: number;
  branch: { id: number; name: string } | null;
  supplier: { id: number; name: string };
  createdBy: { name: string | null } | null;
  paymentMethod: {
    id: number;
    name: string;
    account: { id: number; name: string; type: string };
  } | null;
  items: { productId: number; quantity: number; unitPrice: number; totalAmount: number; product: { name: string; code: string } }[];
};

type Supplier = { id: number; name: string };
type Product = {
  id: number;
  name: string;
  code: string;
  costPrice: number;
  forSale: boolean;
  sellingPrice: number;
};
type Branch = { id: number; name: string };
type Category = { id: number; name: string };

type PurchaseLineForm = {
  isNewProduct: boolean;
  productId: string;
  newName: string;
  newCode: string;
  unit: string;
  boxesPerCarton: string;
  pcsPerBox: string;
  forSale: boolean;
  internalPurpose: "laboratory" | "cleaning" | "general";
  sellingPrice: string;
  categoryId: string;
  quantity: string;
  unitPrice: string;
  purchaseUnit: "pcs" | "box" | "carton";
};

const emptyLine = (): PurchaseLineForm => ({
  isNewProduct: false,
  productId: "",
  newName: "",
  newCode: "",
  unit: "pcs",
  boxesPerCarton: "",
  pcsPerBox: "",
  forSale: true,
  internalPurpose: "general",
  sellingPrice: "",
  categoryId: "",
  quantity: "1",
  unitPrice: "",
  purchaseUnit: "pcs",
});

type LedgerPaymentMethod = {
  id: number;
  name: string;
  account: { id: number; name: string; type: string; code: string | null };
};

export default function PurchasesPage() {
  const { hasPermission } = useAuth();
  const { seesAllBranches, hasMultipleAssignedBranches, allBranchesLabel } = useBranchScope();
  const [listBranchFilter, setListBranchFilter] = useState("");
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseTotal, setPurchaseTotal] = useState(0);
  const [purchasePage, setPurchasePage] = useState(1);
  const purchasePageSize = 20;
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<LedgerPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
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

  async function loadPharmacyForBranch(bid: string) {
    if (!bid) return;
    const qs = `?branchId=${encodeURIComponent(bid)}`;
    const [sRes, pRes, cRes] = await Promise.all([
      authFetch(`/api/pharmacy/suppliers${qs}`),
      authFetch(`/api/pharmacy/products${qs}`),
      authFetch(`/api/pharmacy/categories${qs}`),
    ]);
    if (sRes.ok) setSuppliers(await sRes.json());
    if (pRes.ok) setProducts(await pRes.json());
    if (cRes.ok) setCategories(await cRes.json());
  }

  async function loadBranches() {
    const url = hasPermission("settings.manage") ? "/api/branches?all=true" : "/api/branches";
    const res = await authFetch(url);
    if (res.ok) {
      const data: Branch[] = await res.json();
      setBranches(data);
    }
  }

  async function loadPaymentMethods() {
    const res = await authFetch("/api/pharmacy/payment-methods");
    if (res.ok) setPaymentMethods(await res.json());
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([loadBranches(), loadPaymentMethods()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (form.branchId) loadPharmacyForBranch(form.branchId);
  }, [form.branchId]);

  useEffect(() => {
    setPurchasePage(1);
  }, [listBranchFilter]);

  useEffect(() => {
    loadPurchases();
  }, [listBranchFilter, purchasePage]);

  function openAdd() {
    setModal(true);
    setForm({
      branchId: branches[0] ? String(branches[0].id) : "",
      supplierId: suppliers[0] ? String(suppliers[0].id) : "",
      paymentMethodId: paymentMethods[0] ? String(paymentMethods[0].id) : "",
      purchaseDate: new Date().toISOString().slice(0, 10),
      notes: "",
      items: [emptyLine()],
    });
    setError("");
  }

  function addItem() {
    setForm((f) => ({ ...f, items: [...f.items, emptyLine()] }));
  }

  function removeItem(idx: number) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  function updateItem(
    idx: number,
    field: keyof PurchaseLineForm,
    value: string | boolean | PurchaseLineForm["purchaseUnit"]
  ) {
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
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
            purchaseUnit: "pcs" | "box" | "carton";
            sellingPrice?: number;
          }
        | {
            newProduct: {
              name: string;
              code: string;
              unit: string;
              boxesPerCarton?: number | null;
              pcsPerBox?: number | null;
              forSale: boolean;
              internalPurpose?: string;
              sellingPrice: number;
              categoryId: number | null;
            };
            quantity: number;
            unitPrice: number;
            purchaseUnit: "pcs" | "box" | "carton";
          }
      )[] = [];

      for (const it of form.items) {
        const quantity = Math.max(1, Math.floor(Number(it.quantity) || 0));
        const unitPrice = Number(it.unitPrice);
        if (!it.quantity?.trim() || Number.isNaN(unitPrice) || unitPrice < 0) continue;

        const purchaseUnit = it.purchaseUnit ?? "pcs";
        if (it.isNewProduct) {
          const name = it.newName.trim();
          const code = it.newCode.trim();
          if (!name || !code) continue;
          const bpc = it.boxesPerCarton.trim() === "" ? null : Number(it.boxesPerCarton);
          const ppb = it.pcsPerBox.trim() === "" ? null : Number(it.pcsPerBox);
          validItems.push({
            newProduct: {
              name,
              code,
              unit: it.unit.trim() || "pcs",
              ...(bpc != null && Number.isFinite(bpc) && bpc > 0 ? { boxesPerCarton: Math.floor(bpc) } : {}),
              ...(ppb != null && Number.isFinite(ppb) && ppb > 0 ? { pcsPerBox: Math.floor(ppb) } : {}),
              forSale: it.forSale,
              ...(it.forSale ? {} : { internalPurpose: it.internalPurpose }),
              sellingPrice: it.forSale ? Math.max(0, Number(it.sellingPrice) || 0) : 0,
              categoryId: it.categoryId ? Number(it.categoryId) : null,
            },
            quantity,
            unitPrice,
            purchaseUnit,
          });
        } else {
          if (!it.productId) continue;
          const prod = products.find((p) => String(p.id) === it.productId);
          const line: {
            productId: number;
            quantity: number;
            unitPrice: number;
            purchaseUnit: "pcs" | "box" | "carton";
            sellingPrice?: number;
          } = {
            productId: Number(it.productId),
            quantity,
            unitPrice,
            purchaseUnit,
          };
          if (prod?.forSale && it.sellingPrice.trim() !== "") {
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
          supplierId: Number(form.supplierId),
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
      await Promise.all([loadPurchases(), loadPharmacyForBranch(form.branchId)]);
      setModal(false);
    } finally {
      setSubmitting(false);
    }
  }

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
          <Button
            startIcon={<PlusIcon />}
            onClick={() => {
              if (branches.length === 0) {
                alert("No branch is available. Create a branch in Settings and assign your user to it.");
                return;
              }
              if (paymentMethods.length === 0) {
                alert("Add a payment method under Settings → Accounts / Payment methods first.");
                return;
              }
              openAdd();
            }}
            size="sm"
          >
            New Purchase
          </Button>
        )}
      </div>

      {canCreate && !loading && branches.length === 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          No branch is assigned to your account (or none exist yet). Add branches under Settings and assign users to branches before recording purchases.
        </div>
      )}
      {canCreate && !loading && paymentMethods.length === 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          No payment methods found. Under Settings, create finance accounts and payment methods so purchases can be paid from the correct account.
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
            {canCreate && <Button className="mt-2" onClick={openAdd} size="sm">New Purchase</Button>}
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
                  <TableCell className="font-medium">{p.supplier.name}</TableCell>
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

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl my-8 rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold">New Purchase</h2>
              <button type="button" onClick={() => setModal(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {error && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">{error}</div>}
              <div>
                <Label>Payment method *</Label>
                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                  Money is withdrawn from the linked finance account (same as Settings → Payment methods).
                </p>
                <select
                  required
                  value={form.paymentMethodId}
                  onChange={(e) => setForm((f) => ({ ...f, paymentMethodId: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
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
                  <Label>Supplier *</Label>
                  <select required value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))} className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white">
                    <option value="">Select supplier</option>
                    {suppliers.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                  </select>
                </div>
                <DateField
                  id="purchase-date"
                  label="Date *"
                  required
                  value={form.purchaseDate}
                  onChange={(v) => setForm((f) => ({ ...f, purchaseDate: v }))}
                  appendToBody
                />
              </div>
              <div>
                <Label>Notes</Label>
                <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="h-20 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>Items</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>Add Item</Button>
                </div>
                <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                  {form.items.map((it, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-gray-200 p-3 dark:border-gray-700 space-y-3"
                    >
                      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
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
                                      purchaseUnit: row.purchaseUnit,
                                    }
                                  : row
                              ),
                            }));
                          }}
                          className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                        New product (not in catalog yet)
                      </label>

                      {it.isNewProduct ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <Label>Name *</Label>
                            <input
                              value={it.newName}
                              onChange={(e) => updateItem(idx, "newName", e.target.value)}
                              placeholder="Product name"
                              className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
                            />
                          </div>
                          <div>
                            <Label>Code *</Label>
                            <input
                              value={it.newCode}
                              onChange={(e) => updateItem(idx, "newCode", e.target.value.toUpperCase())}
                              placeholder="SKU / code"
                              className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white font-mono"
                            />
                          </div>
                          <div>
                            <Label>Unit</Label>
                            <select
                              value={it.unit}
                              onChange={(e) => updateItem(idx, "unit", e.target.value)}
                              className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
                            >
                              <option value="pcs">pcs</option>
                              <option value="box">box</option>
                              <option value="bottle">bottle</option>
                              <option value="pack">pack</option>
                              <option value="strip">strip</option>
                              <option value="ml">ml</option>
                            </select>
                          </div>
                          <div>
                            <Label>Category</Label>
                            <select
                              value={it.categoryId}
                              onChange={(e) => updateItem(idx, "categoryId", e.target.value)}
                              className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
                            >
                              <option value="">—</option>
                              {categories.map((c) => (
                                <option key={c.id} value={String(c.id)}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
                            <label className="flex cursor-pointer items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={it.forSale}
                                onChange={(e) => updateItem(idx, "forSale", e.target.checked)}
                                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                              />
                              For sale (retail / POS)
                            </label>
                            {!it.forSale && (
                              <select
                                value={it.internalPurpose}
                                onChange={(e) =>
                                  updateItem(
                                    idx,
                                    "internalPurpose",
                                    e.target.value as PurchaseLineForm["internalPurpose"]
                                  )
                                }
                                className="h-10 rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
                              >
                                <option value="laboratory">Laboratory</option>
                                <option value="cleaning">Cleaning</option>
                                <option value="general">General</option>
                              </select>
                            )}
                          </div>
                          {it.forSale && (
                            <div className="sm:col-span-2">
                              <Label>Retail selling price (optional)</Label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={it.sellingPrice}
                                onChange={(e) => updateItem(idx, "sellingPrice", e.target.value)}
                                placeholder="POS price (can set later in inventory)"
                                className="mt-1 h-10 w-full max-w-xs rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
                              />
                            </div>
                          )}
                          <div className="sm:col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div>
                              <Label>Boxes per carton</Label>
                              <input
                                type="number"
                                min="1"
                                value={it.boxesPerCarton}
                                onChange={(e) => updateItem(idx, "boxesPerCarton", e.target.value)}
                                placeholder="Optional — for carton sales"
                                className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
                              />
                            </div>
                            <div>
                              <Label>Pieces per box</Label>
                              <input
                                type="number"
                                min="1"
                                value={it.pcsPerBox}
                                onChange={(e) => updateItem(idx, "pcsPerBox", e.target.value)}
                                placeholder="Optional — for box/carton"
                                className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <select
                            value={it.productId}
                            onChange={(e) => {
                              const id = e.target.value;
                              setForm((f) => ({
                                ...f,
                                items: f.items.map((row, i) =>
                                  i === idx ? { ...row, productId: id, sellingPrice: "" } : row
                                ),
                              }));
                            }}
                            className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
                          >
                            <option value="">Select existing product</option>
                            {products.map((p) => (
                              <option key={p.id} value={String(p.id)}>
                                {p.name} ({p.code}) — cost ${p.costPrice}
                              </option>
                            ))}
                          </select>
                          {(() => {
                            const sel = products.find((p) => String(p.id) === it.productId);
                            if (!sel?.forSale) return null;
                            return (
                              <div>
                                <Label>Retail / POS price (optional)</Label>
                                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                                  Leave blank to keep the current catalog price; enter a price to average with existing stock.
                                </p>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={it.sellingPrice}
                                  onChange={(e) => updateItem(idx, "sellingPrice", e.target.value)}
                                  placeholder={`Current: ${sel.sellingPrice?.toFixed?.(2) ?? "—"}`}
                                  className="mt-1 h-10 w-full max-w-xs rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
                                />
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      <div className="flex flex-wrap items-end gap-2">
                        <div>
                          <Label>Unit *</Label>
                          <select
                            value={it.purchaseUnit}
                            onChange={(e) =>
                              updateItem(
                                idx,
                                "purchaseUnit",
                                e.target.value as PurchaseLineForm["purchaseUnit"]
                              )
                            }
                            className="mt-1 h-10 min-w-[7rem] rounded-lg border border-gray-200 bg-transparent px-2 text-sm dark:border-gray-700 dark:text-white"
                          >
                            <option value="pcs">pcs</option>
                            <option value="box">Box</option>
                            <option value="carton">Carton</option>
                          </select>
                        </div>
                        <div>
                          <Label>Qty *</Label>
                          <input
                            type="number"
                            min="1"
                            value={it.quantity}
                            onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                            className="mt-1 h-10 w-20 rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
                          />
                        </div>
                        <div>
                          <Label>Unit cost *</Label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={it.unitPrice}
                            onChange={(e) => updateItem(idx, "unitPrice", e.target.value)}
                            placeholder="0.00"
                            className="mt-1 h-10 w-28 rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-lg text-error-500 hover:bg-error-50 dark:hover:bg-error-500/10"
                          aria-label="Remove line"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setModal(false)} size="sm">Cancel</Button>
                <Button type="submit" disabled={submitting} size="sm">{submitting ? "Saving..." : "Create Purchase"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
