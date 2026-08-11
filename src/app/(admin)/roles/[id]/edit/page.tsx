"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import RolePermissionsForm, { type RoleFormValues } from "@/components/roles/RolePermissionsForm";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type RoleDetail = {
  id: number;
  name: string;
  description: string | null;
  permissions: { id: number; name: string }[];
  userCount?: number;
};

export default function EditRolePage() {
  const params = useParams();
  const router = useRouter();
  const roleId = params.id ? Number(params.id) : NaN;
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("roles.edit");

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<RoleDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!Number.isInteger(roleId)) {
      setLoadError("Invalid role");
      setLoading(false);
      return;
    }
    setLoading(true);
    authFetch(`/api/roles/${roleId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.error || "Failed to load role");
          setRole(null);
          return;
        }
        setRole(data as RoleDetail);
        setLoadError("");
      })
      .catch(() => setLoadError("Failed to load role"))
      .finally(() => setLoading(false));
  }, [roleId]);

  if (!canEdit) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Edit role" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            You do not have permission to edit roles.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Edit role" />
        <div className="mt-6 flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
        </div>
      </div>
    );
  }

  if (loadError || !role) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Edit role" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-10 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-error-600 dark:text-error-400">{loadError || "Role not found"}</p>
          <Link
            href="/roles"
            className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Back to roles
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(values: RoleFormValues) {
    setSubmitError("");
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/roles/${roleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          description: values.description || undefined,
          permissionIds: values.permissionIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Failed to update role");
        return;
      }
      router.push("/roles");
    } finally {
      setSubmitting(false);
    }
  }

  const initialValues: RoleFormValues = {
    name: role.name,
    description: role.description ?? "",
    permissionIds: role.permissions.map((p) => p.id),
  };

  return (
    <div>
      <PageBreadCrumb pageTitle={`Edit role: ${role.name}`} />
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Update role details and page access. Changes apply to all users assigned this role.
      </p>
      <div className="mt-6">
        <RolePermissionsForm
          initialValues={initialValues}
          submitLabel="Save changes"
          submitting={submitting}
          submitError={submitError}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
