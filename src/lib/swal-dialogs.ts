"use client";

import Swal from "sweetalert2";

export type SwalConfirmOptions = {
  title?: string;
  text?: string;
  html?: string;
  icon?: "warning" | "question" | "info";
  confirmButtonText?: string;
  cancelButtonText?: string;
};

const defaultConfirm = {
  showCancelButton: true,
  focusCancel: true,
  reverseButtons: true,
  cancelButtonText: "Cancel",
  confirmButtonText: "OK",
} as const;

/** Destructive delete confirmation (SweetAlert2). */
export async function confirmDelete(options: SwalConfirmOptions = {}): Promise<boolean> {
  const res = await Swal.fire({
    ...defaultConfirm,
    icon: options.icon ?? "warning",
    title: options.title ?? "Delete?",
    text: options.text,
    html: options.html,
    confirmButtonText: options.confirmButtonText ?? "Yes, delete",
    cancelButtonText: options.cancelButtonText ?? "Cancel",
    confirmButtonColor: "#dc2626",
  });
  return res.isConfirmed;
}

/** General yes/no confirmation (SweetAlert2). */
export async function confirmAction(options: SwalConfirmOptions): Promise<boolean> {
  const res = await Swal.fire({
    ...defaultConfirm,
    icon: options.icon ?? "question",
    title: options.title ?? "Are you sure?",
    text: options.text,
    html: options.html,
    confirmButtonText: options.confirmButtonText ?? "Yes",
    cancelButtonText: options.cancelButtonText ?? "Cancel",
  });
  return res.isConfirmed;
}

export async function showErrorAlert(message: string, title = "Something went wrong"): Promise<void> {
  await Swal.fire({
    icon: "error",
    title,
    text: message,
    confirmButtonText: "OK",
  });
}

export async function showSuccessAlert(message: string, title = "Success"): Promise<void> {
  await Swal.fire({
    icon: "success",
    title,
    text: message,
    confirmButtonText: "OK",
  });
}

export async function showWarningAlert(message: string, title = "Notice"): Promise<void> {
  await Swal.fire({
    icon: "warning",
    title,
    text: message,
    confirmButtonText: "OK",
  });
}

export async function showInfoAlert(message: string, title = "Info"): Promise<void> {
  await Swal.fire({
    icon: "info",
    title,
    text: message,
    confirmButtonText: "OK",
  });
}
