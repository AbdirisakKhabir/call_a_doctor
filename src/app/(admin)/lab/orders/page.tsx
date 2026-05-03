"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";
import { EyeIcon, PencilIcon } from "@/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type LabOrderListItem = {
  id: number;
  status: string;
};

type LabOrder = {
  id: number;
  totalAmount: number;
  status: string;
  notes: string | null;
  createdAt: string;
  patient: { id: number; patientCode: string; name: string };
  doctor: { id: number; name: string };
  appointment: { id: number; appointmentDate: string; startTime: string };
  items: LabOrderListItem[];
};

function itemProgressSummary(items: LabOrderListItem[]): string {
  const total = items.length;
  if (total === 0) return "—";
  const done = items.filter((i) => i.status === "completed").length;
  if (done === 0) return `0/${total}`;
  if (done === total) return "Complete";
  return `${done}/${total}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatShortDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

export default function LabOrdersPage() {
  const { hasPermission } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderPage, setOrderPage] = useState(1);
  const orderPageSize = 20;
  const [loading, setLoading] = useState(true);

  const canRecord = hasPermission("lab.edit");

  useEffect(() => {
    if (searchParams.get("create") !== "1") return;
    const appointmentId = searchParams.get("appointmentId");
    const patientId = searchParams.get("patientId");
    const doctorId = searchParams.get("doctorId");
    if (appointmentId && patientId && doctorId) {
      router.replace(
        `/lab/orders/new?appointmentId=${encodeURIComponent(appointmentId)}&patientId=${encodeURIComponent(patientId)}&doctorId=${encodeURIComponent(doctorId)}`
      );
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (!hasPermission("lab.view")) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(orderPage), pageSize: String(orderPageSize) });
    authFetch(`/api/lab/orders?${params}`)
      .then((oRes) => (oRes.ok ? oRes.json() : null))
      .then((body) => {
        if (cancelled || !body) return;
        setOrders(body.data ?? []);
        setOrderTotal(typeof body.total === "number" ? body.total : 0);
      })
      .catch(() => {
        if (!cancelled) {
          setOrders([]);
          setOrderTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderPage, hasPermission]);

  if (!hasPermission("lab.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Lab Orders" />
        <div className="mt-6 rounded-lg border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <PageBreadCrumb pageTitle="Lab Orders" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center text-gray-600 dark:text-gray-400">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600 dark:border-gray-600 dark:border-t-gray-300" />
            <p className="text-sm">Loading…</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">No lab orders yet.</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">Create orders from the calendar.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader className="whitespace-nowrap">
                  Order
                </TableCell>
                <TableCell isHeader className="whitespace-nowrap">
                  Placed
                </TableCell>
                <TableCell isHeader>Client</TableCell>
                <TableCell isHeader>Doctor</TableCell>
                <TableCell isHeader className="whitespace-nowrap">
                  Visit
                </TableCell>
                <TableCell isHeader className="text-right whitespace-nowrap">
                  Results
                </TableCell>
                <TableCell isHeader className="whitespace-nowrap">
                  Status
                </TableCell>
                <TableCell isHeader className="text-right whitespace-nowrap">
                  Total
                </TableCell>
                <TableCell isHeader className="min-w-[4.5rem] whitespace-nowrap text-right align-middle">
                  Actions
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const progress = itemProgressSummary(order.items);
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm text-gray-900 dark:text-white">#{order.id}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                      {formatShortDateTime(order.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-gray-900 dark:text-white">{order.patient.name}</div>
                      <div className="font-mono text-xs text-gray-500">{order.patient.patientCode}</div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-700 dark:text-gray-300">{order.doctor.name}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                      {formatDate(order.appointment.appointmentDate)} · {order.appointment.startTime}
                    </TableCell>
                    <TableCell className="text-right text-sm text-gray-700 dark:text-gray-300">{progress}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium capitalize ${
                          order.status === "completed"
                            ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                            : order.status === "cancelled"
                              ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                              : "bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"
                        }`}
                      >
                        {order.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-gray-900 dark:text-white">
                      ${(order.totalAmount ?? 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right align-middle">
                      <Link
                        href={`/lab/orders/${order.id}/results`}
                        className="inline-flex size-10 shrink-0 items-center justify-center overflow-visible rounded-lg border border-gray-200 bg-white p-0 leading-none text-gray-800 shadow-theme-xs hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                        title={canRecord ? "Enter results" : "View results"}
                      >
                        {canRecord ? (
                          <PencilIcon className="block !size-5 max-h-none max-w-none shrink-0 overflow-visible" aria-hidden />
                        ) : (
                          <EyeIcon className="block !size-5 max-h-none max-w-none shrink-0 overflow-visible" aria-hidden />
                        )}
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {!loading && orderTotal > 0 ? (
          <ListPaginationFooter
            loading={loading}
            total={orderTotal}
            page={orderPage}
            pageSize={orderPageSize}
            noun="orders"
            onPageChange={setOrderPage}
          />
        ) : null}
      </div>
    </>
  );
}
