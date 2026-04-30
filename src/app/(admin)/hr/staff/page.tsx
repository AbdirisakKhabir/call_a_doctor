"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { DropdownItem } from "@/components/ui/dropdown/DropdownItem";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatWorkingDaysLabel } from "@/lib/hr-staff";
import { MoreDotIcon, PlusIcon } from "@/icons";

type Row = {
  id: number;
  name: string;
  phone: string;
  title: string;
  hireDate: string;
  workingDays: string;
  workingHours: string;
  salaryAmount: number | null;
  cvUrl: string | null;
  photoUrl: string | null;
  isActive: boolean;
};

export default function HrStaffListPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("hr.view");
  const canCreate = hasPermission("hr.create");
  const canEdit = hasPermission("hr.edit");
  const canDelete = hasPermission("hr.delete");

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionsMenuId, setActionsMenuId] = useState<number | null>(null);

  async function load() {
    const res = await authFetch("/api/hr/staff");
    if (res.ok) setRows(await res.json());
  }

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [canView]);

  async function handleDelete(id: number, name: string) {
    if (!canDelete) return;
    if (!confirm(`Remove staff record for “${name}”?`)) return;
    const res = await authFetch(`/api/hr/staff/${id}`, { method: "DELETE" });
    if (res.ok) await load();
    else {
      const j = await res.json();
      alert(typeof j.error === "string" ? j.error : "Delete failed");
    }
  }

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Human Resources — Staff" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">You do not have permission to view HR staff.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Human Resources — Staff" />
        {canCreate ? (
          <Link href="/hr/staff/new">
            <Button size="sm">
              <PlusIcon className="mr-1.5 h-4 w-4" />
              Register staff
            </Button>
          </Link>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No staff records yet.{canCreate ? " Register a staff member to get started." : ""}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell isHeader>Photo</TableCell>
                <TableCell isHeader>Name</TableCell>
                <TableCell isHeader>Title</TableCell>
                <TableCell isHeader>Phone</TableCell>
                <TableCell isHeader>Hire date</TableCell>
                <TableCell isHeader>Working days</TableCell>
                <TableCell isHeader>Hours</TableCell>
                <TableCell isHeader>Salary</TableCell>
                <TableCell isHeader>CV</TableCell>
                <TableCell isHeader>Status</TableCell>
                <TableCell isHeader className="text-right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="w-14">
                    <Link href={`/hr/staff/${r.id}`} className="block">
                      {r.photoUrl ? (
                        <img
                          src={r.photoUrl}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover ring-1 ring-gray-200 dark:ring-gray-600"
                        />
                      ) : (
                        <span
                          className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                          aria-hidden
                        >
                          {r.name.trim().charAt(0).toUpperCase() || "?"}
                        </span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium text-gray-900 dark:text-white">
                    <Link href={`/hr/staff/${r.id}`} className="hover:text-brand-600 hover:underline dark:hover:text-brand-400">
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell>{r.title}</TableCell>
                  <TableCell>{r.phone}</TableCell>
                  <TableCell>{new Date(r.hireDate).toLocaleDateString()}</TableCell>
                  <TableCell className="max-w-[200px] text-sm">{formatWorkingDaysLabel(r.workingDays)}</TableCell>
                  <TableCell>{r.workingHours}</TableCell>
                  <TableCell>{r.salaryAmount != null ? `$${r.salaryAmount.toFixed(2)}` : "—"}</TableCell>
                  <TableCell>
                    {r.cvUrl ? (
                      <a
                        href={r.cvUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                      >
                        PDF
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {r.isActive ? (
                      <span className="text-xs font-medium text-green-700 dark:text-green-400">Active</span>
                    ) : (
                      <span className="text-xs text-gray-500">Inactive</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right align-middle overflow-visible">
                    <div className="relative inline-flex justify-end">
                      <button
                        type="button"
                        className="dropdown-toggle inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        aria-expanded={actionsMenuId === r.id}
                        aria-haspopup="menu"
                        aria-label={`Actions for ${r.name}`}
                        onClick={() => setActionsMenuId((cur) => (cur === r.id ? null : r.id))}
                      >
                        <MoreDotIcon className="h-5 w-5" aria-hidden />
                      </button>
                      <Dropdown
                        isOpen={actionsMenuId === r.id}
                        onClose={() => setActionsMenuId(null)}
                        className="min-w-44 py-1"
                      >
                        <DropdownItem tag="a" href={`/hr/staff/${r.id}`} onItemClick={() => setActionsMenuId(null)}>
                          View profile
                        </DropdownItem>
                        {canEdit ? (
                          <DropdownItem
                            tag="a"
                            href={`/hr/staff/${r.id}/edit`}
                            onItemClick={() => setActionsMenuId(null)}
                          >
                            Edit
                          </DropdownItem>
                        ) : null}
                        {canDelete ? (
                          <DropdownItem
                            tag="button"
                            className="text-error-600 hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-500/10"
                            onClick={() => {
                              setActionsMenuId(null);
                              void handleDelete(r.id, r.name);
                            }}
                          >
                            Delete
                          </DropdownItem>
                        ) : null}
                      </Dropdown>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
