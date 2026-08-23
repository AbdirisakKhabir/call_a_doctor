"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PencilIcon, PlusIcon } from "@/icons";

type AssignedService = {
  id: number;
  name: string;
  color: string | null;
  price: number;
  durationMinutes: number | null;
  isActive: boolean;
  branch: { id: number; name: string } | null;
};

type CategoryDetail = {
  id: number;
  name: string;
  description: string | null;
  services: AssignedService[];
};

export default function ServiceCategoryServicesPage() {
  const params = useParams();
  const idParam = params?.id;
  const categoryId = typeof idParam === "string" ? Number(idParam) : NaN;
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("appointments.edit") || hasPermission("appointments.view");
  const canCreate = hasPermission("appointments.create") || hasPermission("appointments.view");

  const [category, setCategory] = useState<CategoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      setError("Invalid category");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    authFetch(`/api/service-categories/${categoryId}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.status === 404 ? "Category not found" : "Failed to load");
          setCategory(null);
          return;
        }
        const data = (await res.json()) as CategoryDetail;
        setCategory(data);
        setError("");
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle={category ? category.name : "Category services"} />
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/settings/services/categories"
            className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            ← Category list
          </Link>
          {canCreate ? (
            <Link
              href="/settings/services/new"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
            >
              <span className="flex items-center">
                <PlusIcon />
              </span>
              Add service
            </Link>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
        </div>
      ) : error || !category ? (
        <p className="text-sm text-error-600 dark:text-error-400">{error || "Unable to load category."}</p>
      ) : (
        <>
          {category.description ? (
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">{category.description}</p>
          ) : null}
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {category.services.length} service{category.services.length === 1 ? "" : "s"} in this category
          </p>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
            {category.services.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <p className="text-sm text-gray-500">No services assigned to this category yet.</p>
                {canCreate ? (
                  <Link
                    href="/settings/services/new"
                    className="mt-2 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    Create a service and choose this category
                  </Link>
                ) : null}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-transparent! hover:bg-transparent!">
                    <TableCell isHeader>Name</TableCell>
                    <TableCell isHeader>Price</TableCell>
                    <TableCell isHeader>Duration</TableCell>
                    <TableCell isHeader>Branch</TableCell>
                    <TableCell isHeader>Status</TableCell>
                    <TableCell isHeader className="text-right">
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {category.services.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {s.color ? (
                            <span
                              className="h-4 w-4 shrink-0 rounded border border-gray-200 dark:border-gray-600"
                              style={{ backgroundColor: s.color }}
                              aria-hidden
                            />
                          ) : null}
                          <span className="font-medium">{s.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>${s.price.toFixed(2)}</TableCell>
                      <TableCell>{s.durationMinutes ? `${s.durationMinutes} min` : "—"}</TableCell>
                      <TableCell>{s.branch?.name || "All"}</TableCell>
                      <TableCell>
                        <span className={s.isActive ? "text-success-600" : "text-gray-400"}>
                          {s.isActive ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {canEdit ? (
                          <Link
                            href={`/settings/services/${s.id}/edit`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-brand-50 hover:text-brand-500"
                            aria-label="Edit"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}
    </>
  );
}
