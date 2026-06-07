"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type Service = {
  id: number;
  name: string;
  color: string | null;
  description: string | null;
  price: number;
  durationMinutes: number | null;
  branch: { id: number; name: string } | null;
};

export default function ServicesPage() {
  const { hasPermission } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [serviceTotal, setServiceTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);

  const canCreate = hasPermission("appointments.create") || hasPermission("appointments.view");
  const canEdit = hasPermission("appointments.edit") || hasPermission("appointments.view");
  const canDelete = hasPermission("appointments.delete");

  async function loadServices() {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const res = await authFetch(`/api/services?${params}`);
    if (res.ok) {
      const body = await res.json();
      setServices(body.data ?? []);
      setServiceTotal(typeof body.total === "number" ? body.total : 0);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadServices().finally(() => setLoading(false));
  }, [page]);

  async function handleDelete(id: number) {
    if (!confirm("Delete this service?")) return;
    const res = await authFetch(`/api/services/${id}`, { method: "DELETE" });
    if (res.ok) await loadServices();
    else alert((await res.json()).error || "Failed");
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Services" />
        {canCreate && (
          <Link
            href="/settings/services/new"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600"
          >
            <span className="flex items-center">
              <PlusIcon />
            </span>
            Add Service
          </Link>
        )}
      </div>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
          </div>
        ) : serviceTotal === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-gray-500">No services yet.</p>
            {canCreate && (
              <Link
                href="/settings/services/new"
                className="mt-2 inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
              >
                Add Service
              </Link>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>Name</TableCell>
                <TableCell isHeader>Color</TableCell>
                <TableCell isHeader>Price</TableCell>
                <TableCell isHeader>Duration</TableCell>
                <TableCell isHeader>Branch</TableCell>
                <TableCell isHeader className="text-right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>
                    {s.color ? (
                      <span
                        className="inline-flex h-7 min-w-[4.5rem] items-center justify-center rounded border border-gray-200 px-2 text-xs font-mono dark:border-gray-600"
                        style={{ backgroundColor: s.color }}
                        title={s.color}
                      >
                        &nbsp;
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Default</span>
                    )}
                  </TableCell>
                  <TableCell>${s.price.toFixed(2)}</TableCell>
                  <TableCell>{s.durationMinutes ? `${s.durationMinutes} min` : "—"}</TableCell>
                  <TableCell>{s.branch?.name || "All"}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      {canEdit && (
                        <Link
                          href={`/settings/services/${s.id}/edit`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-brand-50 hover:text-brand-500"
                          aria-label="Edit"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Link>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(s.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500"
                          aria-label="Delete"
                        >
                          <TrashBinIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <ListPaginationFooter
          loading={loading}
          total={serviceTotal}
          page={page}
          pageSize={pageSize}
          noun="services"
          onPageChange={setPage}
        />
      </div>
    </>
  );
}
