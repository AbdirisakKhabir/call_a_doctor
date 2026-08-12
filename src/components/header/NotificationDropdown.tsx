"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type PendingLabOrder = {
  id: number;
  patientName: string;
  patientCode: string;
  createdAt: string;
  pendingItems: number;
  totalItems: number;
};

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function badgeLabel(count: number): string {
  if (count > 99) return "99+";
  return String(count);
}

export default function NotificationDropdown() {
  const { hasPermission } = useAuth();
  const canViewLab = hasPermission("lab.view");
  const [isOpen, setIsOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [orders, setOrders] = useState<PendingLabOrder[]>([]);
  const [loading, setLoading] = useState(false);

  const loadPending = useCallback(async () => {
    if (!canViewLab) {
      setCount(0);
      setOrders([]);
      return;
    }
    setLoading(true);
    try {
      const res = await authFetch("/api/lab/notifications/pending");
      if (!res.ok) return;
      const data = (await res.json()) as { count?: number; orders?: PendingLabOrder[] };
      setCount(typeof data.count === "number" ? data.count : 0);
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [canViewLab]);

  useEffect(() => {
    void loadPending();
    const interval = setInterval(() => void loadPending(), 60_000);
    const onFocus = () => void loadPending();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadPending]);

  function toggleDropdown() {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) void loadPending();
      return next;
    });
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  if (!canViewLab) return null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={count > 0 ? `${count} pending lab orders` : "Notifications"}
        className="relative dropdown-toggle flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={toggleDropdown}
      >
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-error-500 px-1 text-[10px] font-semibold leading-none text-white">
            {badgeLabel(count)}
          </span>
        ) : null}
        <svg
          className="fill-current"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
            fill="currentColor"
          />
        </svg>
      </button>
      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute -right-[240px] mt-[17px] flex max-h-[480px] w-[350px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:w-[361px] lg:right-0"
      >
        <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-700">
          <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Notifications</h5>
          <button
            type="button"
            onClick={closeDropdown}
            className="dropdown-toggle text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Close notifications"
          >
            <svg className="fill-current" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>

        {count > 0 ? (
          <p className="mb-2 px-1 text-xs text-gray-500 dark:text-gray-400">
            {count} lab {count === 1 ? "order" : "orders"} awaiting results
          </p>
        ) : null}

        <ul className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
          {loading && orders.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</li>
          ) : count === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No pending lab orders. All caught up.
            </li>
          ) : (
            orders.map((order) => (
              <li key={order.id}>
                <DropdownItem
                  tag="a"
                  href={`/lab/orders/${order.id}/results`}
                  onItemClick={closeDropdown}
                  className="flex gap-3 rounded-lg border-b border-gray-100 px-4 py-3 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-white/5"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                    <FlaskConical className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-theme-sm font-medium text-gray-800 dark:text-white/90">
                      Lab order #{order.id}
                    </span>
                    <span className="mt-0.5 block truncate text-theme-sm text-gray-600 dark:text-gray-300">
                      {order.patientName}{" "}
                      <span className="text-gray-400 dark:text-gray-500">({order.patientCode})</span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-theme-xs text-gray-500 dark:text-gray-400">
                      <span>
                        {order.pendingItems}/{order.totalItems} tests pending
                      </span>
                      <span className="h-1 w-1 rounded-full bg-gray-400" aria-hidden />
                      <span>{formatRelativeTime(order.createdAt)}</span>
                    </span>
                  </span>
                </DropdownItem>
              </li>
            ))
          )}
        </ul>

        {count > 0 ? (
          <Link
            href="/lab/orders?status=pending"
            onClick={closeDropdown}
            className="mt-3 block rounded-lg border border-gray-300 bg-white px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            View all pending labs ({count})
          </Link>
        ) : null}
      </Dropdown>
    </div>
  );
}
