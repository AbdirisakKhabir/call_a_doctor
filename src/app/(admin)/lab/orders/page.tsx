"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type LabOrderItem = {
  id: number;
  unitPrice: number;
  resultValue: string | null;
  resultUnit: string | null;
  status: string;
  panelParentTestId: number | null;
  panelParentTest: { id: number; name: string } | null;
  labTest: { id: number; name: string; unit: string | null; normalRange: string | null; price: number };
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
  items: LabOrderItem[];
};

type OrderDisplayRow =
  | { kind: "panel"; name: string; panelItems: LabOrderItem[] }
  | { kind: "test"; item: LabOrderItem };

function buildOrderDisplayRows(items: LabOrderItem[]): OrderDisplayRow[] {
  const emittedPanelIds = new Set<number>();
  const rows: OrderDisplayRow[] = [];
  for (const item of items) {
    const pid = item.panelParentTestId;
    if (pid != null) {
      if (emittedPanelIds.has(pid)) continue;
      emittedPanelIds.add(pid);
      const panelItems = items.filter((i) => i.panelParentTestId === pid);
      const name = item.panelParentTest?.name ?? "Panel";
      rows.push({ kind: "panel", name, panelItems });
    } else {
      rows.push({ kind: "test", item });
    }
  }
  return rows;
}

function panelResultSummary(panelItems: LabOrderItem[]): string {
  const done = panelItems.filter((i) => i.status === "completed").length;
  if (done === 0) return "—";
  if (done === panelItems.length) return "Complete";
  return `${done}/${panelItems.length} recorded`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
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

  async function loadOrders() {
    const params = new URLSearchParams({ page: String(orderPage), pageSize: String(orderPageSize) });
    const oRes = await authFetch(`/api/lab/orders?${params}`);
    if (oRes.ok) {
      const body = await oRes.json();
      setOrders(body.data ?? []);
      setOrderTotal(typeof body.total === "number" ? body.total : 0);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadOrders().finally(() => setLoading(false));
  }, [orderPage]);

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

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 dark:border-gray-800 dark:bg-white/3">
          <div className="flex flex-col items-center justify-center gap-3 text-center text-gray-600 dark:text-gray-400">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600 dark:border-gray-600 dark:border-t-gray-300" />
            <p className="text-sm">Loading…</p>
          </div>
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 dark:border-gray-800 dark:bg-white/3">
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">No lab orders yet.</p>
          <p className="mt-1 text-center text-xs text-gray-500 dark:text-gray-500">Create orders from the calendar.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/2"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{order.patient.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {order.patient.patientCode} · Dr. {order.doctor.name}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/lab/orders/${order.id}/results`}
                    className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    {canRecord ? "Enter results" : "View results"}
                  </Link>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(order.appointment.appointmentDate)} · {order.appointment.startTime}
                  </span>
                  <span className="text-sm tabular-nums text-gray-700 dark:text-gray-300">
                    ${(order.totalAmount ?? 0).toFixed(2)}
                  </span>
                  <span
                    className={`text-sm capitalize ${
                      order.status === "completed" ? "text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    {order.status}
                  </span>
                </div>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900/50 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Test / panel</th>
                    <th className="px-4 py-2 font-medium">Reference</th>
                    <th className="px-4 py-2 text-right font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {buildOrderDisplayRows(order.items).map((row) =>
                    row.kind === "panel" ? (
                      <tr
                        key={`panel-${row.panelItems[0]?.panelParentTestId ?? row.name}-${order.id}`}
                        className="dark:bg-white/1"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 dark:text-white">{row.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Panel</p>
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">—</td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                          {panelResultSummary(row.panelItems)}
                        </td>
                      </tr>
                    ) : (
                      <tr key={row.item.id} className="dark:bg-white/1">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{row.item.labTest.name}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                          {row.item.labTest.normalRange?.trim() ? row.item.labTest.normalRange : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                          {row.item.resultValue || "—"}{" "}
                          {row.item.resultUnit && row.item.resultValue ? row.item.resultUnit : ""}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          ))}
          <ListPaginationFooter
            loading={loading}
            total={orderTotal}
            page={orderPage}
            pageSize={orderPageSize}
            noun="orders"
            onPageChange={setOrderPage}
          />
        </div>
      )}
    </>
  );
}
