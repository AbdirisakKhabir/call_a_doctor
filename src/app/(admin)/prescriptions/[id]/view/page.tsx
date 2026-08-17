"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { MAIN_LOGO_PATH } from "@/lib/brand-logos";
import { parseAllergiesInfectionsFromNotes } from "@/lib/patient-allergies-notes";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PrescriptionDetail = {
  id: number;
  status: string;
  notes: string | null;
  isEmergency?: boolean;
  createdAt: string;
  patient: {
    id: number;
    patientCode: string;
    name: string;
    gender?: string | null;
    age?: number | null;
    dateOfBirth?: string | null;
    notes?: string | null;
    phone?: string | null;
  };
  doctor: { id: number; name: string; specialty?: string | null };
  createdBy?: { id: number; name: string | null } | null;
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
    dispensedQty: number | null;
    product: {
      id: number;
      name: string;
      code: string;
      unit?: string | null;
      sellingPrice?: number | null;
    };
  }[];
};

function formatVisitDate(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function patientAgeLabel(p: PrescriptionDetail["patient"]): string {
  if (p.age != null && Number.isFinite(p.age) && p.age >= 0 && p.age < 150) {
    return `${Math.floor(p.age)} yrs`;
  }
  if (p.dateOfBirth) {
    const d = new Date(p.dateOfBirth);
    if (!Number.isNaN(d.getTime())) {
      const yrs = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      if (yrs >= 0 && yrs < 150) return `${yrs} yrs`;
    }
  }
  return "—";
}

function statusClasses(status: string) {
  if (status === "dispensed") {
    return "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
  }
  if (status === "cancelled") {
    return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  }
  return "bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200";
}

export default function PrescriptionViewPage() {
  const params = useParams();
  const rxId = Number(params.id);
  const { hasPermission } = useAuth();
  const canView = hasPermission("prescriptions.view");

  const [rx, setRx] = useState<PrescriptionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!Number.isInteger(rxId) || rxId <= 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await authFetch(`/api/prescriptions/${rxId}`);
      if (!res.ok) {
        if (!cancelled) {
          setRx(null);
          setLoading(false);
        }
        return;
      }
      const data = (await res.json()) as PrescriptionDetail;
      if (!cancelled) {
        setRx(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rxId]);

  const allergy = useMemo(() => parseAllergiesInfectionsFromNotes(rx?.patient?.notes), [rx?.patient?.notes]);

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Prescription" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-gray-600 dark:text-gray-400">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500 dark:border-gray-600" />
        <p className="text-sm">Loading prescription…</p>
      </div>
    );
  }

  if (!rx) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Prescription" />
        <p className="mt-6 text-sm text-gray-600 dark:text-gray-400">Prescription not found.</p>
        <Link href="/prescriptions" className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          Back to prescriptions
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-col gap-4 print:hidden sm:flex-row sm:items-start sm:justify-between">
        <PageBreadCrumb pageTitle={`Prescription · #${rx.id}`} />
        <div className="flex flex-wrap gap-2">
          <Link href="/prescriptions">
            <Button variant="outline" size="sm">
              Back to prescriptions
            </Button>
          </Link>
          <Button size="sm" onClick={() => window.print()}>
            <span className="inline-flex items-center gap-2">
              <Printer className="h-4 w-4" aria-hidden />
              Print
            </span>
          </Button>
        </div>
      </div>

      <article className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/3">
        <header className="relative overflow-hidden border-b border-brand-200/70 bg-gradient-to-br from-brand-50 via-white to-white px-6 py-7 dark:border-brand-500/20 dark:from-brand-500/10 dark:via-transparent dark:to-transparent sm:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
                <Image src={MAIN_LOGO_PATH} alt="Call a Doctor" width={48} height={48} className="object-contain" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700 dark:text-brand-400">
                  Client prescription
                </p>
                <h1 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{rx.patient.name}</h1>
                <p className="mt-0.5 font-mono text-sm text-gray-500 dark:text-gray-400">{rx.patient.patientCode}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold tabular-nums text-gray-700 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-700">
                Rx #{rx.id}
              </span>
              {rx.isEmergency ? (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                  Emergency
                </span>
              ) : (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-700">
                  Clinic visit
                </span>
              )}
              <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusClasses(rx.status)}`}>
                {rx.status}
              </span>
            </div>
          </div>
        </header>

        <section className="grid gap-3 border-b border-gray-100 px-6 py-5 dark:border-gray-800 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
          <MetaCell label="Sex" value={rx.patient.gender || "—"} />
          <MetaCell label="Age" value={patientAgeLabel(rx.patient)} />
          <MetaCell label="Phone" value={rx.patient.phone || "—"} />
          <MetaCell
            label="Doctor"
            value={rx.doctor.specialty ? `${rx.doctor.name} · ${rx.doctor.specialty}` : rx.doctor.name}
          />
          <MetaCell
            label="Visit"
            value={`${formatVisitDate(rx.appointment.appointmentDate)} · ${rx.appointment.startTime}`}
          />
          <MetaCell label="Branch" value={rx.appointment.branch?.name || "—"} />
          <MetaCell label="Recorded" value={formatDateTime(rx.createdAt)} />
          <MetaCell label="Recorded by" value={rx.createdBy?.name || "—"} />
        </section>

        {allergy.selection === "yes" ? (
          <div className="border-b border-amber-100 bg-amber-50 px-6 py-4 dark:border-amber-900/40 dark:bg-amber-950/30 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
              Allergies / infections on file
            </p>
            <p className="mt-1 text-sm text-amber-950 dark:text-amber-100">
              {allergy.detail || "Recorded as yes — check the chart before dispensing."}
            </p>
          </div>
        ) : null}

        {rx.notes ? (
          <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-800 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Pharmacy notes
            </p>
            <p className="mt-1 text-sm leading-relaxed text-gray-800 dark:text-gray-200">{rx.notes}</p>
          </div>
        ) : null}

        <div className="px-4 py-5 sm:px-6">
          <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Medicines recorded ({rx.items.length})
          </p>
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader className="w-10">
                  #
                </TableCell>
                <TableCell isHeader>Medicine</TableCell>
                <TableCell isHeader className="text-right whitespace-nowrap">
                  Qty
                </TableCell>
                <TableCell isHeader>Dose / strength</TableCell>
                <TableCell isHeader>How to take</TableCell>
                <TableCell isHeader className="text-right whitespace-nowrap">
                  Dispensed
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rx.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-500">
                    No medicines recorded on this prescription.
                  </TableCell>
                </TableRow>
              ) : (
                rx.items.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell className="tabular-nums text-gray-500">{index + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium text-gray-900 dark:text-white">{item.product.name}</div>
                      <div className="font-mono text-xs text-gray-500">
                        {item.product.code}
                        {item.product.unit ? ` · ${item.product.unit}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                    <TableCell>{item.dosage?.trim() || "—"}</TableCell>
                    <TableCell className="max-w-xs">{item.instructions?.trim() || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.dispensedQty ?? 0}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </article>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}
