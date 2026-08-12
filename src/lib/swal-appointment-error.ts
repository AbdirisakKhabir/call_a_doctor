"use client";

import { confirmAction, showErrorAlert, showWarningAlert } from "@/lib/swal-dialogs";

/** Server copy from `getAppointmentBlockMessage` — used to pick dialog styling */
export function isAppointmentScheduleBlockedMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("overlaps blocked") ||
    m.includes("not allowed on this date") ||
    m.includes("bookings are not allowed")
  );
}

/**
 * SweetAlert2 for appointment API errors (blocked hours / holiday / other).
 */
export async function showSwalForAppointmentError(
  message: string,
  genericTitle = "Could not save booking"
): Promise<void> {
  const blocked = isAppointmentScheduleBlockedMessage(message);
  if (blocked) {
    await showWarningAlert(message, "Time not available");
  } else {
    await showErrorAlert(message, genericTitle);
  }
}

/** SweetAlert2 confirm before cancelling a booking (replaces window.confirm). */
export async function confirmCancelAppointment(): Promise<boolean> {
  return confirmAction({
    icon: "warning",
    title: "Cancel this booking?",
    html: "Its time will be <strong>free</strong> for a new booking. Cancelled visits are listed on the <strong>Cancelled bookings</strong> page (Calendar menu). The booking record stays for your records.",
    confirmButtonText: "Yes, cancel",
    cancelButtonText: "Keep booking",
  });
}
