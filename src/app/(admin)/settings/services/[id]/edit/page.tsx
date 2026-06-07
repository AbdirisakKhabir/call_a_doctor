"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import ServiceForm, { type ServiceFormValues } from "../../ServiceForm";

type Branch = { id: number; name: string };

type ServiceApi = {
  id: number;
  name: string;
  color: string | null;
  description: string | null;
  price: number;
  durationMinutes: number | null;
  branch: { id: number; name: string } | null;
};

function toFormValues(s: ServiceApi): ServiceFormValues {
  return {
    name: s.name,
    description: s.description ?? "",
    price: String(s.price),
    durationMinutes: s.durationMinutes != null ? String(s.durationMinutes) : "",
    branchId: s.branch ? String(s.branch.id) : "",
    color: s.color ?? "",
  };
}

export default function EditServicePage() {
  const router = useRouter();
  const params = useParams();
  const idParam = params.id;
  const serviceId = typeof idParam === "string" ? Number(idParam) : NaN;

  const { hasPermission } = useAuth();
  const canEdit = hasPermission("appointments.edit") || hasPermission("appointments.view");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [initial, setInitial] = useState<ServiceFormValues | null>(null);
  const [initialDisposableBranchId, setInitialDisposableBranchId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!Number.isInteger(serviceId)) {
      setLoadError("Invalid service");
      setLoading(false);
      return;
    }
    (async () => {
      const [brRes, svcRes] = await Promise.all([
        authFetch("/api/branches"),
        authFetch(`/api/services/${serviceId}`),
      ]);
      if (cancelled) return;
      let branchList: Branch[] = [];
      if (brRes.ok) {
        const data = await brRes.json();
        if (Array.isArray(data)) {
          branchList = data;
          setBranches(data);
        }
      }
      if (!svcRes.ok) {
        setLoadError(svcRes.status === 404 ? "Service not found" : "Failed to load");
        setLoading(false);
        return;
      }
      const s = (await svcRes.json()) as ServiceApi;
      setInitial(toFormValues(s));
      setInitialDisposableBranchId(s.branch ? String(s.branch.id) : branchList[0] ? String(branchList[0].id) : "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  if (!canEdit) {
    return (
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">You do not have permission to edit services.</p>
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

  if (loadError || !initial) {
    return (
      <div>
        <p className="text-sm text-error-600 dark:text-error-400">{loadError || "Unable to load service."}</p>
      </div>
    );
  }

  return (
    <ServiceForm
      title="Update service details."
      breadcrumbTitle="Edit service"
      backHref="/settings/services"
      branches={branches}
      initialValues={initial}
      serviceId={serviceId}
      initialDisposableBranchId={initialDisposableBranchId}
      canManageDisposables={canEdit}
      submitLabel="Save changes"
      onSubmit={async (form) => {
        const res = await authFetch(`/api/services/${serviceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) return { error: data.error || "Failed to save" };
        router.push("/settings/services");
        router.refresh();
      }}
    />
  );
}
