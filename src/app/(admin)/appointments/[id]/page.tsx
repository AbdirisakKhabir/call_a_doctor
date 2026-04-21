import React from "react";
import AppointmentDetailView from "@/components/appointments/AppointmentDetailView";

type Props = { params: Promise<{ id: string }> };

export default async function AppointmentDetailPage({ params }: Props) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-white/3">
        <p className="text-sm text-gray-600 dark:text-gray-400">Invalid appointment.</p>
      </div>
    );
  }
  return <AppointmentDetailView key={id} appointmentId={n} />;
}
