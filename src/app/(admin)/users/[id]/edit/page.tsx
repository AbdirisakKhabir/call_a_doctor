"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import UserForm, { type UserFormValues } from "@/components/users/UserForm";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type UserDetail = {
  id: number;
  email: string;
  name: string | null;
  roleId: number;
  isActive: boolean;
};

export default function EditUserPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id ? Number(params.id) : NaN;
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("users.edit");

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!Number.isInteger(userId)) {
      setLoadError("Invalid user");
      setLoading(false);
      return;
    }
    setLoading(true);
    authFetch(`/api/users/${userId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.error || "Failed to load user");
          setUser(null);
          return;
        }
        setUser(data as UserDetail);
        setLoadError("");
      })
      .catch(() => setLoadError("Failed to load user"))
      .finally(() => setLoading(false));
  }, [userId]);

  if (!canEdit) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Edit user" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            You do not have permission to edit users.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Edit user" />
        <div className="mt-6 flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
        </div>
      </div>
    );
  }

  if (loadError || !user) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Edit user" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-10 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-error-600 dark:text-error-400">{loadError || "User not found"}</p>
          <Link
            href="/users"
            className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Back to users
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(values: UserFormValues) {
    setSubmitError("");
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        email: values.email,
        name: values.name || undefined,
        roleId: Number(values.roleId),
        isActive: values.isActive,
      };
      if (values.password) body.password = values.password;

      const res = await authFetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Failed to update user");
        return;
      }
      router.push("/users");
    } finally {
      setSubmitting(false);
    }
  }

  const initialValues: UserFormValues = {
    email: user.email,
    password: "",
    name: user.name ?? "",
    roleId: String(user.roleId),
    isActive: user.isActive,
  };

  return (
    <div>
      <PageBreadCrumb pageTitle={`Edit user: ${user.name || user.email}`} />
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Update account details and change the assigned role.
      </p>
      <div className="mt-6">
        <UserForm
          mode="edit"
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
