"use client";

import React, { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type SaleLine = {
  id: number;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  product: { id: number; name: string; code: string };
};

type SaleDetail = {
  id: number;
  branchId: number | null;
  saleDate: string;
  totalAmount: number;
  paymentMethod: string;
  customerType: string;
  outreachTeamId: number | null;
  patient: { name: string; patientCode: string } | null;
  items: SaleLine[];
};

function PharmacySaleReturnsInner() {
  const searchParams = useSearchParams();
  const processedUrlKey = useRef<string | null>(null);
  const { hasPermission } = useAuth();
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [branchId, setBranchId] = useState("");
  const [saleIdInput, setSaleIdInput] = useState("");
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [returnedMap, setReturnedMap] = useState<Record<number, number>>({});
  const [qtyByLine, setQtyByLine] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState("");
  const [loadingSale, setLoadingSale] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canUse = hasPermission("pharmacy.pos");

  useEffect(() => {
    const url = hasPermission("settings.manage") ? "/api/branches?all=true" : "/api/branches";
    authFetch(url).then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setBranches(data);
        setBranchId((prev) => {
          if (prev && data.some((b: { id: number }) => String(b.id) === prev)) return prev;
          return data[0] ? String(data[0].id) : "";
        });
      }
    });
  }, [hasPermission]);

  const loadSale = useCallback(
    async (opts?: { saleId?: string; branchIdForValidate?: string | null }) => {
      setError("");
      setSuccess("");
      const raw = (opts?.saleId ?? saleIdInput).trim();
      const sid = Number(raw);
      if (!Number.isInteger(sid) || sid <= 0) {
        setError("Enter a valid sale number.");
        return;
      }
      const branchForValidate =
        opts?.branchIdForValidate !== undefined ? opts.branchIdForValidate : branchId;
      setLoadingSale(true);
      try {
        const [saleRes, retRes] = await Promise.all([
          authFetch(`/api/pharmacy/sales/${sid}`),
          authFetch(`/api/pharmacy/sale-returns?saleId=${sid}`),
        ]);
        const saleData = await saleRes.json();
        if (!saleRes.ok) {
          setSale(null);
          setError(saleData.error || "Could not load sale");
          return;
        }
        if (saleData.outreachTeamId != null || saleData.customerType === "outreach") {
          setSale(null);
          setError(
            "This sale is an outreach transfer. Use Pharmacy → Outreach return to put stock back on the shelf."
          );
          return;
        }
        if (
          branchForValidate &&
          saleData.branchId != null &&
          String(saleData.branchId) !== String(branchForValidate)
        ) {
          setError("This sale belongs to a different branch. Switch branch or check the sale #.");
          return;
        }
        setSale(saleData as SaleDetail);
        const retJson = retRes.ok ? await retRes.json() : { returnedBySaleItemId: {} };
        setReturnedMap(retJson.returnedBySaleItemId || {});
        const initial: Record<number, number> = {};
        for (const it of (saleData as SaleDetail).items) {
          initial[it.id] = 0;
        }
        setQtyByLine(initial);
      } finally {
        setLoadingSale(false);
      }
    },
    [saleIdInput, branchId]
  );

  useEffect(() => {
    const sid = searchParams.get("saleId")?.trim();
    if (!sid) {
      processedUrlKey.current = null;
      return;
    }
    const bid = searchParams.get("branchId")?.trim() ?? "";
    const key = `${sid}|${bid}`;
    if (processedUrlKey.current === key) return;
    processedUrlKey.current = key;
    if (bid) setBranchId(bid);
    setSaleIdInput(sid);
    void loadSale({ saleId: sid, branchIdForValidate: bid ? bid : null });
  }, [searchParams, loadSale]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!sale) return;
    const items = sale.items
      .map((it) => ({
        saleItemId: it.id,
        quantity: Math.max(0, Math.floor(qtyByLine[it.id] || 0)),
      }))
      .filter((x) => x.quantity > 0);
    if (items.length === 0) {
      setError("Enter quantity to return for at least one line.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch("/api/pharmacy/sale-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: sale.id,
          notes: notes.trim() || null,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to record return");
        return;
      }
      setSuccess(`Return #${data.id} recorded. Shelf stock has been increased.`);
      setNotes("");
      setQtyByLine({});
      await loadSale();
    } finally {
      setSubmitting(false);
    }
  }

  if (!canUse) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Sale returns" />
        <p className="mt-6 text-sm text-gray-500">You do not have permission.</p>
      </div>
    );
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="Pharmacy sale returns" />
      <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
        Return unsold or accepted-return products from a <strong>retail POS sale</strong> back to shelf stock.
        Quantities cannot exceed what was sold minus any earlier returns. Outreach bag transfers are handled
        under Outreach → Return.
      </p>

      <div className="mt-8 max-w-3xl space-y-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/3">
        {error && (
          <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-500/10 dark:text-green-300">
            {success}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-4">
          {branches.length > 1 ? (
            <div>
              <Label>Branch context</Label>
              <select
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setSale(null);
                }}
                className="mt-1 h-11 min-w-[200px] rounded-lg border border-gray-200 bg-white px-4 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex min-w-[240px] flex-1 flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <Label>Sale #</Label>
              <input
                value={saleIdInput}
                onChange={(e) => setSaleIdInput(e.target.value)}
                placeholder="e.g. receipt number from POS"
                className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 font-mono text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <Button type="button" variant="outline" size="sm" className="h-11" onClick={() => loadSale()} disabled={loadingSale}>
              {loadingSale ? "Loading…" : "Load sale"}
            </Button>
          </div>
        </div>

        {sale && (
          <form onSubmit={handleSubmit} className="space-y-4 border-t border-gray-100 pt-6 dark:border-gray-800">
            <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm dark:bg-gray-800/50">
              <p className="font-medium text-gray-900 dark:text-white">
                Sale #{sale.id} · {new Date(sale.saleDate).toLocaleString()}
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                {sale.patient ? `${sale.patient.name} (${sale.patient.patientCode})` : "Walking customer"} ·{" "}
                {sale.paymentMethod} · Total ${sale.totalAmount.toFixed(2)}
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3 text-right">Sold</th>
                    <th className="px-4 py-3 text-right">Already returned</th>
                    <th className="px-4 py-3 text-right">Can return</th>
                    <th className="px-4 py-3 text-right">Return now</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((it) => {
                    const already = returnedMap[it.id] || 0;
                    const canReturn = it.quantity - already;
                    return (
                      <tr key={it.id} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900 dark:text-white">{it.product.name}</span>
                          <span className="ml-2 text-xs text-gray-500">{it.product.code}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">{it.quantity}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">{already}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-brand-600 dark:text-brand-400">
                          {canReturn}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            min={0}
                            max={canReturn}
                            value={qtyByLine[it.id] ?? 0}
                            onChange={(e) =>
                              setQtyByLine((prev) => ({
                                ...prev,
                                [it.id]: Math.min(
                                  canReturn,
                                  Math.max(0, Math.floor(Number(e.target.value) || 0))
                                ),
                              }))
                            }
                            className="h-9 w-20 rounded-lg border border-gray-200 px-2 text-right font-mono dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                            disabled={canReturn <= 0}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div>
              <Label>Notes (optional)</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder="Reason, batch reference, etc."
              />
            </div>

            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Saving…" : "Record return & update inventory"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function PharmacySaleReturnsPage() {
  return (
    <Suspense
      fallback={
        <div>
          <PageBreadCrumb pageTitle="Pharmacy sale returns" />
          <div className="mt-12 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
          </div>
        </div>
      }
    >
      <PharmacySaleReturnsInner />
    </Suspense>
  );
}
