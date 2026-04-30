"use client";

import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";

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
  await Swal.fire({
    icon: blocked ? "warning" : "error",
    title: blocked ? "Time not available" : genericTitle,
    text: message,
    confirmButtonText: "OK",
  });
}

/** SweetAlert2 confirm before cancelling a booking (replaces window.confirm). */
export async function confirmCancelAppointment(): Promise<boolean> {
  const res = await Swal.fire({
    icon: "warning",
    title: "Cancel this booking?",
    html: "Its time will be <strong>free</strong> for a new booking. Cancelled visits are listed on the <strong>Cancelled bookings</strong> page (Calendar menu). The booking record stays for your records.",
    showCancelButton: true,
    confirmButtonText: "Yes, cancel",
    cancelButtonText: "Keep booking",
    focusCancel: true,
    reverseButtons: true,
  });
  return res.isConfirmed;
}
