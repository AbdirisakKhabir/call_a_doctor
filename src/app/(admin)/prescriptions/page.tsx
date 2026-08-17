"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EllipsisVertical, Eye, Search } from "lucide-react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { DropdownItem } from "@/components/ui/dropdown/DropdownItem";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Prescription = {
  id: number;
  isEmergency?: boolean;
  status: string;
  notes: string | null;
  createdAt: string;
  patient: { id: number; patientCode: string; name: string };
  doctor: { id: number; name: string };
  appointment: {
    id: number;
    appointmentDate: string;
    startTime: string;
    branch?: { id: number; name: string } | null;
  };
  items: {
    id: number;
    quantity: number;
    dosage: string | null;
    instructions: string | null;
    product: { id: number; name: string; code: string; sellingPrice?: number };
  }[];
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatShortDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function medicinesSummary(items: Prescription["items"]): { label: string; title: string } {
  if (items.length === 0) return { label: "—", title: "" };
  const names = items.map((i) => i.product.name);
  const first = names[0];
  if (items.length === 1) return { label: first, title: first };
  return {
    label: `${first} +${items.length - 1}`,
    title: names.join(", "),
  };
}

export default function PrescriptionsPage() {
  const { hasPermission } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const createRequested = searchParams.get("create") === "1";

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [rxTotal, setRxTotal] = useState(0);
  const [rxPage, setRxPage] = useState(1);
  const rxPageSize = 20;
  const [loading, setLoading] = useState(true);
  const [rxListFilter, setRxListFilter] = useState<"all" | "emergency" | "clinic">("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionsMenuId, setActionsMenuId] = useState<number | null>(null);

  const canCreate = hasPermission("prescriptions.create");

  useEffect(() => {
    if (!createRequested) return;
    const q = new URLSearchParams();
    for (const key of ["appointmentId", "patientId", "doctorId", "branchId"] as const) {
      const v = searchParams.get(key);
      if (v) q.set(key, v);
    }
    router.replace(q.size ? `/prescriptions/new?${q.toString()}` : "/prescriptions/new");
  }, [createRequested, router, searchParams]);

  const fetchPrescriptionsPage = useCallback(
    async (page: number, search: string) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(rxPageSize),
      });
      if (rxListFilter === "emergency") params.set("emergency", "yes");
      if (rxListFilter === "clinic") params.set("emergency", "no");
      if (search) params.set("search", search);
      const pRes = await authFetch(`/api/prescriptions?${params}`);
      if (!pRes.ok) return;
      const body = await pRes.json();
      if (Array.isArray(body)) {
        setPrescriptions(body);
        setRxTotal(body.length);
      } else {
        setPrescriptions(body.data ?? []);
        setRxTotal(typeof body.total === "number" ? body.total : 0);
      }
    },
    [rxListFilter]
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearchQuery(searchInput.trim().slice(0, 120));
    }, 320);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const prevSearchRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevSearchRef.current === null) {
      prevSearchRef.current = searchQuery;
      return;
    }
    if (prevSearchRef.current !== searchQuery) {
      prevSearchRef.current = searchQuery;
      setRxPage(1);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (createRequested) return;
    setLoading(true);
    fetchPrescriptionsPage(rxPage, searchQuery).finally(() => setLoading(false));
  }, [rxPage, rxListFilter, searchQuery, fetchPrescriptionsPage, createRequested]);

  if (!hasPermission("prescriptions.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Prescriptions" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  if (createRequested) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Write prescription" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">Opening the prescription page…</p>
      </div>
    );
  }

  const emptyBecauseSearch = Boolean(searchQuery) || rxListFilter !== "all";

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <PageBreadCrumb pageTitle="Prescriptions & medications" />
          <p className="mt-1 max-w-2xl text-xs text-gray-500 dark:text-gray-400">
            All recorded client prescriptions. Open Show to see medicines, dose, and how to take them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={rxListFilter}
            onChange={(e) => {
              setRxListFilter(e.target.value as "all" | "emergency" | "clinic");
              setRxPage(1);
            }}
            className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            aria-label="Filter prescriptions"
          >
            <option value="all">All prescriptions</option>
            <option value="emergency">Emergency only</option>
            <option value="clinic">Clinic visits only</option>
          </select>
          {hasPermission("pharmacy.view") && (
            <Link
              href="/finance/client-invoice"
              className="inline-flex h-10 items-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Client invoice
            </Link>
          )}
          {canCreate && (
            <Link
              href="/prescriptions/new"
              className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-brand-600"
            >
              New prescription
            </Link>
          )}
        </div>
      </div>

      <div className="mb-5 max-w-xl">
        <Label htmlFor="rx-list-search">Search prescriptions</Label>
        <div className="relative mt-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            aria-hidden
          />
          <Input
            id="rx-list-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Client name or code, doctor, medicine, Rx #…"
            autoComplete="off"
            className="pl-10"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center text-gray-600 dark:text-gray-400">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500 dark:border-gray-600" />
            <p className="text-sm">Loading prescriptions…</p>
          </div>
        ) : prescriptions.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {emptyBecauseSearch ? "No matching prescriptions." : "No prescriptions yet."}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {emptyBecauseSearch
                ? "Try a different name, client code, doctor, medicine, or prescription number."
                : "Open a calendar booking and choose Create prescription."}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader className="whitespace-nowrap">
                  Rx
                </TableCell>
                <TableCell isHeader className="whitespace-nowrap">
                  Recorded
                </TableCell>
                <TableCell isHeader>Client</TableCell>
                <TableCell isHeader>Doctor</TableCell>
                <TableCell isHeader className="whitespace-nowrap">
                  Visit
                </TableCell>
                <TableCell isHeader>Medicines</TableCell>
                <TableCell isHeader className="whitespace-nowrap">
                  Type
                </TableCell>
                <TableCell isHeader className="whitespace-nowrap">
                  Status
                </TableCell>
                <TableCell isHeader className="min-w-18 whitespace-nowrap text-right align-middle">
                  Actions
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prescriptions.map((rx) => {
                const meds = medicinesSummary(rx.items);
                return (
                  <TableRow key={rx.id}>
                    <TableCell className="font-mono text-sm text-gray-900 dark:text-white">#{rx.id}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                      {formatShortDateTime(rx.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-gray-900 dark:text-white">{rx.patient.name}</div>
                      <div className="font-mono text-xs text-gray-500">{rx.patient.patientCode}</div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-700 dark:text-gray-300">{rx.doctor.name}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                      {formatDate(rx.appointment.appointmentDate)} · {rx.appointment.startTime}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <div className="truncate text-sm text-gray-900 dark:text-white" title={meds.title}>
                        {meds.label}
                      </div>
                      <div className="text-xs text-gray-500">
                        {rx.items.length} {rx.items.length === 1 ? "medicine" : "medicines"}
                      </div>
                    </TableCell>
                    <TableCell>
                      {rx.isEmergency ? (
                        <span className="inline-block rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                          Emergency
                        </span>
                      ) : (
                        <span className="inline-block rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          Clinic
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium capitalize ${
                          rx.status === "dispensed"
                            ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                            : rx.status === "cancelled"
                              ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                              : "bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"
                        }`}
                      >
                        {rx.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right align-middle overflow-visible">
                      <div className="relative inline-flex justify-end">
                        <button
                          type="button"
                          className="dropdown-toggle inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                          aria-expanded={actionsMenuId === rx.id}
                          aria-haspopup="menu"
                          aria-label={`Actions for prescription ${rx.id}`}
                          onClick={() => setActionsMenuId((cur) => (cur === rx.id ? null : rx.id))}
                        >
                          <EllipsisVertical className="h-5 w-5" aria-hidden />
                        </button>
                        <Dropdown
                          isOpen={actionsMenuId === rx.id}
                          onClose={() => setActionsMenuId(null)}
                          className="min-w-44 py-1"
                        >
                          <DropdownItem
                            tag="a"
                            href={`/prescriptions/${rx.id}/view`}
                            onItemClick={() => setActionsMenuId(null)}
                          >
                            <span className="inline-flex items-center gap-2">
                              <Eye className="h-4 w-4" aria-hidden />
                              Show
                            </span>
                          </DropdownItem>
                        </Dropdown>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {!loading && rxTotal > 0 ? (
          <ListPaginationFooter
            loading={loading}
            total={rxTotal}
            page={rxPage}
            pageSize={rxPageSize}
            noun="prescriptions"
            onPageChange={setRxPage}
          />
        ) : null}
      </div>
    </>
  );
}
