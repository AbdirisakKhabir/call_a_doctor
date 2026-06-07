"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { authFetch } from "@/lib/api";

type SearchHit = {
  id: number;
  name: string;
  code: string;
  costPrice: number;
  forSale: boolean;
  sellingPrice: number;
};

type Props = {
  branchId: string;
  disabled?: boolean;
  selectedProductId: string;
  /** e.g. "Paracetamol (ABC123)" — from loaded product details */
  selectedSummary: string | null;
  /** Parent is fetching full product after pick */
  loading?: boolean;
  onPick: (productId: string) => void | Promise<void>;
  onClear: () => void;
};

export default function ProductPurchaseSearch({
  branchId,
  disabled,
  selectedProductId,
  selectedSummary,
  loading,
  onPick,
  onClear,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);

  const updateDropdownPosition = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      top: r.bottom + 4,
      left: r.left,
      width: Math.max(260, r.width),
    });
  }, []);

  const runSearch = useCallback(
    async (term: string) => {
      if (!branchId) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const params = new URLSearchParams();
        params.set("branchId", branchId);
        params.set("purpose", "purchase");
        params.set("limit", "25");
        if (term.trim()) params.set("q", term.trim());
        const res = await authFetch(`/api/pharmacy/products/search?${params}`);
        if (res.ok) {
          const data: SearchHit[] = await res.json();
          setResults(Array.isArray(data) ? data : []);
        } else {
          setResults([]);
        }
      } finally {
        setSearching(false);
      }
    },
    [branchId]
  );

  useEffect(() => {
    if (!open || !branchId) return;
    updateDropdownPosition();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(query);
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, query, branchId, runSearch, updateDropdownPosition]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => updateDropdownPosition();
    const onResize = () => updateDropdownPosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, updateDropdownPosition]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const hasSelection = Boolean(selectedProductId && selectedSummary);

  if (loading && !hasSelection) {
    return (
      <div className="flex h-9 min-w-[12rem] items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <span
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-gray-200 border-t-brand-500 dark:border-gray-600 dark:border-t-brand-400"
          aria-hidden
        />
        Loading product…
      </div>
    );
  }

  if (hasSelection) {
    return (
      <div className="flex min-w-[12rem] max-w-md flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200" title={selectedSummary ?? undefined}>
          {loading ? "Loading…" : selectedSummary}
        </span>
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => {
            onClear();
            setQuery("");
            setResults([]);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="shrink-0 text-xs font-medium text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-400"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative min-w-[12rem] max-w-md">
      <input
        ref={inputRef}
        type="search"
        autoComplete="off"
        disabled={disabled || !branchId}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          updateDropdownPosition();
        }}
        placeholder={branchId ? "Search name or code…" : "Select branch first"}
        className="h-9 w-full rounded-lg border border-gray-200 bg-transparent px-2 py-1 text-sm dark:border-gray-700 dark:text-white"
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {searching && (
        <span className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-gray-200 border-t-brand-500 dark:border-gray-600 dark:border-t-brand-400" />
      )}
      {mounted &&
        open &&
        createPortal(
          <ul
            ref={listRef}
            role="listbox"
            className="fixed z-[200] max-h-60 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
            }}
          >
            {results.length === 0 && !searching ? (
              <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No matches</li>
            ) : (
              results.map((h) => (
                <li key={h.id} role="option">
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-white/10"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                      void onPick(String(h.id));
                    }}
                  >
                    <span className="font-medium text-gray-900 dark:text-white">{h.name}</span>
                    <span className="ml-2 font-mono text-xs text-gray-500 dark:text-gray-400">{h.code}</span>
                    {!h.forSale ? (
                      <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">Internal</span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>,
          document.body
        )}
    </div>
  );
}
