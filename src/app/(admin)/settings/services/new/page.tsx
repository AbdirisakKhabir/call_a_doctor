"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import ServiceForm, { type ServiceFormValues } from "../ServiceForm";

type Branch = { id: number; name: string };

const emptyForm = (branchId: string): ServiceFormValues => ({
  name: "",
  description: "",
  price: "",
  durationMinutes: "",
  branchId,
  color: "",
});

export default function NewServicePage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("appointments.create") || hasPermission("appointments.view");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/branches")
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled && Array.isArray(data)) setBranches(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const defaultBranch = branches[0] ? String(branches[0].id) : "";

  if (!canCreate) {
    return (
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">You do not have permission to create services.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
      </div>
    );
  }

  return (
    <ServiceForm
      title="Create a service for the calendar and billing."
      breadcrumbTitle="New service"
      backHref="/settings/services"
      branches={branches}
      initialValues={emptyForm(defaultBranch)}
      initialDisposableBranchId={defaultBranch}
      canManageDisposables={canCreate}
      submitLabel="Create service"
      onSubmit={async (form, meta) => {
        const body: Record<string, unknown> = {
          name: form.name,
          description: form.description,
          price: form.price,
          durationMinutes: form.durationMinutes,
          branchId: form.branchId,
          color: form.color,
        };
        const list = meta?.initialDisposables;
        if (list && list.length > 0) {
          body.initialDisposables = list.map((d) => ({
            productCode: d.productCode,
            unitsPerService: d.unitsPerService,
            deductionUnitKey: d.deductionUnitKey,
          }));
        }
        const res = await authFetch("/api/services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) return { error: data.error || "Failed to create" };
        router.push("/settings/services");
        router.refresh();
      }}
    />
  );
}
