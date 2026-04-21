"use client";

import React, { useEffect, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { APPOINTMENT_CALENDAR_SLOT_MINUTES, type AppointmentCalendarSlotMinutes } from "@/lib/appointment-calendar-time";

export default function AppointmentCalendarSettingsPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("appointments.view");
  const canManage = hasPermission("settings.manage");

  const [slotMinutes, setSlotMinutes] = useState<AppointmentCalendarSlotMinutes>(15);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await authFetch("/api/settings/appointment-calendar");
      if (cancelled) return;
      if (res.ok) {
        const data = (await res.json()) as { slotMinutes?: number };
        const n = data.slotMinutes;
        if (n === 15 || n === 30) setSlotMinutes(n);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [canRead]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      const res = await authFetch("/api/settings/appointment-calendar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotMinutes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to save");
        return;
      }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (!canRead) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Appointment calendar" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-500 dark:text-gray-400">You need appointments.view to open this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="Appointment calendar" />
      <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
        Controls the time grid on the appointments calendar and the time dropdowns when booking. Does not change stored appointment lengths—those follow service duration.
      </p>

      {loading ? (
        <div className="mt-8 flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
        </div>
      ) : canManage ? (
        <form onSubmit={handleSave} className="mt-8 max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/3">
          <Label>Time step</Label>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">Each row on the calendar and each option in start/end time lists.</p>
          <div className="flex flex-col gap-3">
            {APPOINTMENT_CALENDAR_SLOT_MINUTES.map((m) => (
              <label key={m} className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700">
                <input
                  type="radio"
                  name="slotMinutes"
                  checked={slotMinutes === m}
                  onChange={() => setSlotMinutes(m)}
                  className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm font-medium text-gray-900 dark:text-white">{m} minutes</span>
              </label>
            ))}
          </div>

          {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
          {saved && <p className="mt-4 text-sm text-green-600 dark:text-green-400">Saved.</p>}

          <div className="mt-6">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-8 max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Current time step: <strong>{slotMinutes} minutes</strong>
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Only users with settings.manage can change this.</p>
        </div>
      )}
    </div>
  );
}
