"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { authFetch } from "@/lib/api";
import { printCareFileInvoice } from "@/lib/care-file-print";
import type { CareFileInvoicePayload } from "@/lib/care-file";

type ListRow = {
  id: number;
  fileCode: string;
  title: string | null;
  status: string;
  openedAt: string;
  closedAt: string | null;
  invoicedAt: string | null;
  notes: string | null;
  totals: {
    charges: number;
    payments: number;
    remainingOnFile: number;
  };
};

export default function PatientCareFilesPage() {
  const params = useParams();
  const patientId = Number(params.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [patientLabel, setPatientLabel] = useState("");
  const [files, setFiles] = useState<ListRow[]>([]);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!Number.isInteger(patientId)) return;
    let cancelled = false;
    setLoading(true);
    authFetch(`/api/patients/${patientId}/care-files`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load");
        if (cancelled) return;
        const name =
          json.patient?.name ||
          [json.patient?.firstName, json.patient?.lastName].filter(Boolean).join(" ").trim();
        setPatientLabel(name ? `${name} (${json.patient?.patientCode ?? ""})` : "");
        setFiles(Array.isArray(json.files) ? json.files : []);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  async function startNewFile() {
    if (!Number.isInteger(patientId)) return;
    setStarting(true);
    setError("");
    try {
      const res = await authFetch(`/api/patients/${patientId}/care-files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      await authFetch(`/api/patients/${patientId}/care-files`)
        .then((r) => r.json())
        .then((j) => {
          setFiles(Array.isArray(j.files) ? j.files : []);
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setStarting(false);
    }
  }

  async function printFile(fileId: number) {
    const res = await authFetch(`/api/patients/${patientId}/care-files/${fileId}/invoice`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Could not load invoice");
      return;
    }
    await printCareFileInvoice(json as CareFileInvoicePayload);
  }

  async function markInvoiced(fileId: number) {
    const res = await authFetch(`/api/patients/${patientId}/care-files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markInvoiced: true }),
    });
    if (!res.ok) {
      const j = await res.json();
      setError(j.error || "Update failed");
      return;
    }
    const list = await authFetch(`/api/patients/${patientId}/care-files`).then((r) => r.json());
    setFiles(Array.isArray(list.files) ? list.files : []);
  }

  async function closeFile(fileId: number) {
    const res = await authFetch(`/api/patients/${patientId}/care-files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    if (!res.ok) {
      const j = await res.json();
      setError(j.error || "Update failed");
      return;
    }
    const list = await authFetch(`/api/patients/${patientId}/care-files`).then((r) => r.json());
    setFiles(Array.isArray(list.files) ? list.files : []);
  }

  if (!Number.isInteger(patientId)) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Client files" />
        <p className="mt-4 text-sm text-gray-500">Invalid client.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Client files" />
        <div className="flex flex-wrap gap-4">
          <Link
            href={`/patients/${patientId}/work-progress`}
            className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Work progress
          </Link>
          <Link
            href={`/patients/${patientId}/history`}
            className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            ← Client history
          </Link>
        </div>
      </div>

      {patientLabel && (
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">{patientLabel}</p>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-900/50 dark:bg-error-500/10 dark:text-error-300">
          {error}
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={startNewFile} disabled={starting || loading}>
          {starting ? "Starting…" : "Start new client file"}
        </Button>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          New calendar bookings and visit cards attach to the open file (or open one automatically). Starting new here closes
          any other open file for this client.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/40">
          <table className="min-w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">File</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Charges</th>
                <th className="px-4 py-3 text-right font-semibold">Payments</th>
                <th className="px-4 py-3 text-right font-semibold">Remaining</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No client files yet. They are created when you add the first booking from the calendar or add a visit card.
                  </td>
                </tr>
              ) : (
                files.map((f) => (
                  <tr key={f.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="px-4 py-3 font-mono text-xs">{f.fileCode}</td>
                    <td className="px-4 py-3 capitalize">{f.status}</td>
                    <td className="px-4 py-3 text-right tabular-nums">${f.totals.charges.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">${f.totals.payments.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      ${f.totals.remainingOnFile.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => printFile(f.id)}>
                          Print
                        </Button>
                        {f.status === "open" && (
                          <>
                            <Button type="button" variant="outline" size="sm" onClick={() => markInvoiced(f.id)}>
                              Mark invoiced
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => closeFile(f.id)}>
                              Close file
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
