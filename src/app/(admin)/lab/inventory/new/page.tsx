"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";
import {
  LAB_BASE_UNIT_OPTIONS,
  LAB_BASE_UNIT_OTHER,
  labBaseUnitFromSelect,
  labBaseUnitToSelectState,
} from "@/lib/lab-base-unit-options";

type Branch = { id: number; name: string };

export default function NewLabInventoryItemPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  const { singleAssignedBranchId } = useBranchScope();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");

  const canCreateLabStock = hasPermission("lab.create") || hasPermission("lab.edit");
  const hasPharmacyCatalog = hasPermission("pharmacy.view");

  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [baseUnitSelect, setBaseUnitSelect] = useState("pcs");
  const [baseUnitCustom, setBaseUnitCustom] = useState("");
  const [newSellingPrice, setNewSellingPrice] = useState("");
  const [newInitialQty, setNewInitialQty] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");
  const [pharmQuery, setPharmQuery] = useState("");
  const [pharmHits, setPharmHits] = useState<{ id: number; name: string; code: string; unit: string }[]>([]);

  useEffect(() => {
    authFetch("/api/branches")
      .then(async (r) => {
        if (!r.ok) return;
        const j = await r.json();
        const list = Array.isArray(j) ? j : j.data ?? [];
        if (Array.isArray(list)) setBranches(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (branches.length === 0) return;
    const q = searchParams.get("branchId");
    if (q) {
      const n = Number(q);
      if (Number.isInteger(n) && n > 0 && branches.some((b) => b.id === n)) {
        setBranchId(String(n));
        return;
      }
    }
    setBranchId((prev) => {
      if (prev) return prev;
      if (singleAssignedBranchId) return String(singleAssignedBranchId);
      return String(branches[0].id);
    });
  }, [branches, singleAssignedBranchId, searchParams]);

  useEffect(() => {
    if (!hasPharmacyCatalog || !branchId || pharmQuery.trim().length < 2) {
      setPharmHits([]);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await authFetch(
            `/api/pharmacy/products/search?branchId=${encodeURIComponent(branchId)}&purpose=purchase&limit=15&q=${encodeURIComponent(pharmQuery.trim())}`
          );
          if (!res.ok) {
            setPharmHits([]);
            return;
          }
          const arr = (await res.json()) as unknown;
          setPharmHits(Array.isArray(arr) ? (arr as { id: number; name: string; code: string; unit: string }[]) : []);
        } catch {
          setPharmHits([]);
        }
      })();
    }, 300);
    return () => clearTimeout(t);
  }, [pharmQuery, branchId, hasPharmacyCatalog]);

  if (!hasPermission("lab.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="New lab stock item" />
        <p className="mt-4 text-sm text-gray-500">You do not have permission.</p>
      </div>
    );
  }

  if (!canCreateLabStock) {
    return (
      <div>
        <PageBreadCrumb pageTitle="New lab stock item" />
        <p className="mt-4 text-sm text-gray-500">You need lab create or edit permission to add stock items.</p>
        <Link href="/lab/inventory" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
          Back to lab inventory
        </Link>
      </div>
    );
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="New lab stock item" />

      <div className="mt-6 max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/3">
        <div>
          <Label>Branch *</Label>
          <select
            required
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="mt-1 h-11 w-full max-w-md rounded-lg border border-gray-200 px-3 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          >
            {branches.length === 0 ? (
              <option value="">Loading…</option>
            ) : (
              branches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))
            )}
          </select>
        </div>

        {hasPharmacyCatalog ? (
          <div className="relative mt-6">
            <Label>Prefill from pharmacy catalog (optional)</Label>
            <input
              type="search"
              value={pharmQuery}
              onChange={(e) => setPharmQuery(e.target.value)}
              placeholder="Type to search product name or code…"
              autoComplete="off"
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
            {pharmHits.length > 0 ? (
              <ul
                className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-lg dark:border-gray-600 dark:bg-gray-900"
                role="listbox"
              >
                {pharmHits.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => {
                        setNewCode(String(p.code || "").trim().toUpperCase());
                        setNewName(p.name);
                        const u = labBaseUnitToSelectState(
                          p.unit && String(p.unit).trim() ? String(p.unit).trim() : "pcs"
                        );
                        setBaseUnitSelect(u.select);
                        setBaseUnitCustom(u.custom);
                        setPharmQuery("");
                        setPharmHits([]);
                        setCreateError("");
                      }}
                    >
                      <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{p.code}</span> · {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <form
          className="mt-6 grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!branchId) return;
            setCreateError("");
            setCreateSubmitting(true);
            try {
              const res = await authFetch("/api/lab/inventory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  branchId: Number(branchId),
                  code: newCode.trim(),
                  name: newName.trim(),
                  unit: labBaseUnitFromSelect(baseUnitSelect, baseUnitCustom),
                  sellingPrice: newSellingPrice.trim() === "" ? 0 : Number(newSellingPrice),
                  initialQuantity: newInitialQty.trim() === "" ? 0 : Math.floor(Number(newInitialQty)),
                }),
              });
              const data = await res.json();
              if (!res.ok) {
                setCreateError(typeof data.error === "string" ? data.error : "Failed to create");
                return;
              }
              router.push(`/lab/inventory?branchId=${encodeURIComponent(branchId)}`);
            } catch {
              setCreateError("Failed to create");
            } finally {
              setCreateSubmitting(false);
            }
          }}
        >
          {createError ? (
            <div className="sm:col-span-2 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
              {createError}
            </div>
          ) : null}
          <div>
            <Label>Code *</Label>
            <input
              required
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-3 font-mono text-sm uppercase dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              placeholder="e.g. GLV-KIT"
            />
          </div>
          <div>
            <Label>Name *</Label>
            <input
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              placeholder="Item description"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Base unit</Label>
            <select
              value={baseUnitSelect}
              onChange={(e) => setBaseUnitSelect(e.target.value)}
              className="mt-1 h-11 w-full max-w-md rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            >
              {LAB_BASE_UNIT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              <option value={LAB_BASE_UNIT_OTHER}>Other…</option>
            </select>
            {baseUnitSelect === LAB_BASE_UNIT_OTHER ? (
              <input
                value={baseUnitCustom}
                onChange={(e) => setBaseUnitCustom(e.target.value)}
                className="mt-2 h-11 w-full max-w-md rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                placeholder="Custom unit label"
                maxLength={191}
              />
            ) : null}
            <p className="mt-1 text-[11px] text-gray-500">Smallest stock step; packaging units are set on the list page.</p>
          </div>
          <div>
            <Label>Initial quantity</Label>
            <input
              type="number"
              min={0}
              step={1}
              value={newInitialQty}
              onChange={(e) => setNewInitialQty(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              placeholder="0"
            />
          </div>
          <div>
            <Label>Lab POS price</Label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={newSellingPrice}
              onChange={(e) => setNewSellingPrice(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              placeholder="0.00"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={createSubmitting || !branchId}>
              {createSubmitting ? "Creating…" : "Create lab item"}
            </Button>
            <Link
              href="/lab/inventory"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
