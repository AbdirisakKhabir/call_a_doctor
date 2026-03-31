"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/api";

export type PosProductPayload = {
  id: number;
  name: string;
  code: string;
  imageUrl: string | null;
  sellingPrice: number;
  quantity: number;
  unit: string;
  boxesPerCarton: number | null;
  pcsPerBox: number | null;
  expiryDate: string | null;
};

/**
 * Reads `?scan=` from the URL (e.g. from Inventory “Ring up at POS”), loads the product, then strips the query.
 */
export function PosBarcodeUrlHandler({
  branchId,
  mainTab,
  checkoutModalOpen,
  editOpen,
  onProduct,
  onNotFound,
}: {
  branchId: string;
  mainTab: "checkout" | "sales";
  checkoutModalOpen: boolean;
  editOpen: boolean;
  onProduct: (p: PosProductPayload) => void;
  onNotFound?: () => void;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const lastHandled = useRef<string | null>(null);

  useEffect(() => {
    if (!searchParams.get("scan")?.trim()) {
      lastHandled.current = null;
    }
  }, [searchParams]);

  useEffect(() => {
    if (mainTab !== "checkout" || checkoutModalOpen || editOpen || !branchId) return;
    const scan = searchParams.get("scan")?.trim();
    if (!scan) return;
    const key = `${branchId}:${scan}`;
    if (lastHandled.current === key) return;

    let cancelled = false;
    (async () => {
      const res = await authFetch(
        `/api/pharmacy/products/by-barcode?branchId=${encodeURIComponent(branchId)}&code=${encodeURIComponent(scan)}`
      );
      const data = await res.json();
      if (cancelled) return;
      lastHandled.current = key;
      if (res.ok && data?.id) {
        onProduct(data as PosProductPayload);
      } else {
        onNotFound?.();
      }
      router.replace("/pharmacy/pos", { scroll: false });
    })();

    return () => {
      cancelled = true;
    };
  }, [branchId, mainTab, checkoutModalOpen, editOpen, searchParams, router, onProduct, onNotFound]);

  return null;
}

/**
 * HID barcode readers act as a keyboard: digits/symbols + Enter. Captures when focus is not in a text field.
 */
export function PosBarcodeKeyboardCapture({
  enabled,
  onScan,
}: {
  enabled: boolean;
  onScan: (code: string) => void;
}) {
  const bufRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const clearBuf = () => {
      bufRef.current = "";
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === "TEXTAREA" || tag === "SELECT") return;
        if (tag === "INPUT") {
          const id = (t as HTMLInputElement).id;
          if (id === "pos-product-search") return;
          return;
        }
      }

      if (e.key === "Enter") {
        const code = bufRef.current.trim();
        bufRef.current = "";
        if (timerRef.current) clearTimeout(timerRef.current);
        if (code.length >= 2) onScan(code);
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        bufRef.current += e.key;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(clearBuf, 100);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, onScan]);

  return null;
}
