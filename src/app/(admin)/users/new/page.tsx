"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import UserForm, { type UserFormValues } from "@/components/users/UserForm";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function NewUserPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  if (!hasPermission("users.create")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Add user" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            You do not have permission to create users.
          </p>
        </div>
      </div>
    );
  }

  async function handleSubmit(values: UserFormValues) {
    setSubmitError("");
    setSubmitting(true);
    try {
      const res = await authFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          name: values.name || undefined,
          roleId: Number(values.roleId),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Failed to create user");
        return;
      }
      router.push("/users");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="Add user" />
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Create a staff account and assign a role to control sidebar pages and permissions.
      </p>
      <div className="mt-6">
        <UserForm
          mode="create"
          initialValues={{ email: "", password: "", name: "", roleId: "" }}
          submitLabel="Create user"
          submitting={submitting}
          submitError={submitError}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
