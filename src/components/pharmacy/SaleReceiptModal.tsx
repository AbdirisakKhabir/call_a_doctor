"use client";

import React, { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import { authFetch } from "@/lib/api";
import {
  printSaleReceipt,
  saleApiDetailToPrintPayload,
  customerLabelForReceiptPrint,
  formatReceiptDateOnly,
  getReceiptLogoAbsoluteUrl,
  type SaleApiDetailForReceipt,
} from "@/lib/print-sale-receipt";
import {
  CLINIC_CALL_CENTER,
  CLINIC_CONTACT_NUMBERS,
  CLINIC_MERCHANT_NUMBERS,
} from "@/lib/receipt-print-theme";

type Props = {
  saleId: number | null;
  open: boolean;
  onClose: () => void;
  /** e.g. "Booking saved" when showing right after appointment create */
  bannerTitle?: string | null;
};

export async function printSaleReceiptById(saleId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await authFetch(`/api/pharmacy/sales/${saleId}`);
  const data = await res.json();
  if (!res.ok) {
    return { ok: false, error: typeof data.error === "string" ? data.error : "Could not load sale" };
  }
  await printSaleReceipt(saleApiDetailToPrintPayload(data as SaleApiDetailForReceipt));
  return { ok: true };
}

export default function SaleReceiptModal({ saleId, open, onClose, bannerTitle }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<SaleApiDetailForReceipt | null>(null);

  useEffect(() => {
    if (!open || !saleId) {
      setDetail(null);
      setError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    setDetail(null);
    void authFetch(`/api/pharmacy/sales/${saleId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Could not load sale");
        }
        if (!cancelled) setDetail(data as SaleApiDetailForReceipt);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, saleId]);

  const handlePrint = useCallback(() => {
    if (!detail) return;
    void printSaleReceipt(saleApiDetailToPrintPayload(detail));
  }, [detail]);

  if (!open || saleId == null) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[min(90dvh,780px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-receipt-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div>
            {bannerTitle ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                {bannerTitle}
              </p>
            ) : null}
            <h2 id="sale-receipt-modal-title" className="text-lg font-semibold">
              {detail ? `Receipt · Sale #${detail.id}` : "Receipt"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
            </div>
          ) : error ? (
            <p className="text-sm text-error-600 dark:text-error-400">{error}</p>
          ) : detail ? (
            <div className="space-y-0 border border-gray-200 bg-white p-4 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100">
              <div className="grid grid-cols-[1fr_auto] gap-3 border-b-2 border-brand-900 pb-4 dark:border-brand-700">
                <div className="min-w-0">
                  <p className="text-base font-bold text-brand-900 dark:text-brand-400">Call a Doctor</p>
                  <p className="text-[11px] text-gray-700 dark:text-gray-300">{detail.branch?.name ?? "Main clinic"}</p>
                  <p className="text-[11px] text-gray-700 dark:text-gray-300">
                    Call center: {CLINIC_CALL_CENTER}
                  </p>
                </div>
                <div className="flex h-30 w-30 shrink-0 items-center justify-center">
                  <img
                    src={getReceiptLogoAbsoluteUrl()}
                    alt="Call a Doctor"
                    width={120}
                    height={120}
                    className="max-h-28 max-w-28 object-contain"
                    loading="eager"
                    decoding="async"
                    onError={(e) => {
                      const el = e.currentTarget;
                      if (!el.src.includes("/images/logo/logo.svg")) {
                        el.src = `${typeof window !== "undefined" ? window.location.origin : ""}/images/logo/logo.svg`;
                      }
                    }}
                  />
                </div>
              </div>

              <div className="flex justify-end pb-4 pt-3">
                <div className="text-right">
                  <h3 className="text-xl font-bold uppercase tracking-wide text-brand-900 dark:text-brand-400">Receipt</h3>
                  <div className="mt-2 space-y-0.5 text-xs">
                    <p>
                      <span className="font-semibold text-brand-900 dark:text-brand-400">Receipt #: </span>
                      {String(detail.id).padStart(7, "0")}
                    </p>
                    <p>
                      <span className="font-semibold text-brand-900 dark:text-brand-400">Receipt date: </span>
                      {formatReceiptDateOnly(detail.saleDate)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pb-4">
                <p className="text-xs font-bold text-brand-900 dark:text-brand-400">Billed To</p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {customerLabelForReceiptPrint(detail)}
                </p>
                <p className="mt-0.5 text-[11px] text-gray-600 dark:text-gray-400">
                  Payment: {detail.paymentMethod}
                  {detail.depositTransaction?.id ? (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                      Deposited
                    </span>
                  ) : null}
                </p>
                {detail.createdBy?.name ? (
                  <p className="mt-1 text-[11px] text-gray-500">Recorded by {detail.createdBy.name}</p>
                ) : null}
              </div>

              {detail.customerType === "outreach" && detail.outreachOnCredit ? (
                <p className="pb-2 text-xs text-amber-700 dark:text-amber-400">On credit</p>
              ) : null}

              {detail.items && detail.items.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[320px] border-collapse text-left text-xs">
                      <thead>
                        <tr className="bg-brand-900 text-white dark:bg-brand-800">
                          <th className="px-2 py-2 font-bold uppercase tracking-wide">Qty</th>
                          <th className="px-2 py-2 font-bold uppercase tracking-wide">Description</th>
                          <th className="px-2 py-2 text-right font-bold uppercase tracking-wide">Unit Price</th>
                          <th className="px-2 py-2 text-right font-bold uppercase tracking-wide">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.items.map((line, idx) => {
                          const label =
                            line.service?.name ??
                            (line.product
                              ? `${line.product.name} ${line.product.code ? `(${line.product.code})` : ""}`.trim()
                              : "Line item");
                          return (
                            <tr key={idx} className="border-b border-gray-200 dark:border-gray-800">
                              <td className="whitespace-nowrap px-2 py-2 tabular-nums">
                                {line.quantity}
                                {line.saleUnit && line.saleUnit !== "pcs" ? ` ${line.saleUnit}` : ""}
                              </td>
                              <td className="px-2 py-2">
                                <span className="font-medium text-gray-900 dark:text-white">{label}</span>
                                {line.service ? (
                                  <span className="ml-1 text-[10px] text-gray-500 dark:text-gray-400">Service</span>
                                ) : null}
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums">${line.unitPrice.toFixed(2)}</td>
                              <td className="px-2 py-2 text-right font-semibold tabular-nums">
                                ${line.totalAmount.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="h-0.5 bg-brand-900 dark:bg-brand-700" aria-hidden />
                </>
              ) : (
                <p className="py-4 text-center text-gray-500">No line items on this sale.</p>
              )}

              <div className="ml-auto w-full max-w-[240px] space-y-1 py-3 text-xs">
                {detail.items && detail.items.length > 0 ? (
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Subtotal</span>
                    <span className="tabular-nums">
                      ${detail.items.reduce((s, it) => s + it.totalAmount, 0).toFixed(2)}
                    </span>
                  </div>
                ) : null}
                {(detail.discount ?? 0) > 0 ? (
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Discount</span>
                    <span className="tabular-nums">−${(detail.discount ?? 0).toFixed(2)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between border-t-2 border-b-2 border-brand-900 bg-brand-50 px-3 py-2 text-sm font-bold text-brand-900 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                  <span>Total (USD)</span>
                  <span className="tabular-nums">${detail.totalAmount.toFixed(2)}</span>
                </div>
              </div>

              <div className="mt-4 space-y-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <p className="text-xs font-bold text-brand-900 dark:text-brand-400">Notes</p>
                {detail.notes && String(detail.notes).trim() ? (
                  <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">
                    {detail.notes}
                  </p>
                ) : (
                  <p className="text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">
                    Thank you for choosing Call a Doctor. Please retain this receipt for your records. For service or
                    billing questions, use the clinic contact below.
                  </p>
                )}
                <div className="text-[11px] leading-relaxed text-gray-700 dark:text-gray-300">
                  <p className="font-bold text-brand-900 dark:text-brand-400">Merchant payment numbers</p>
                  <ul className="mt-1 list-none space-y-0.5">
                    {CLINIC_MERCHANT_NUMBERS.map((m) => (
                      <li key={m.label}>
                        {m.label}: <strong>{m.number}</strong>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 font-bold text-brand-900 dark:text-brand-400">Contact</p>
                  <ul className="mt-1 list-none space-y-0.5">
                    {CLINIC_CONTACT_NUMBERS.map((c) => (
                      <li key={c.label}>
                        {c.label}: <strong>{c.number}</strong>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2">
                    Call a Doctor — <span className="font-medium">{detail.branch?.name ?? "Main clinic"}</span>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No data.</p>
          )}
        </div>
        <div className="flex shrink-0 gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-700">
          <Button type="button" className="flex-1" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button type="button" className="flex-1" size="sm" onClick={handlePrint} disabled={!detail || loading}>
            Print receipt
          </Button>
        </div>
      </div>
    </div>
  );
}
