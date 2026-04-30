import {
  clientInvoiceDocumentStyles,
  fetchReceiptLogoAsDataUrl,
  formatReceiptDateOnly,
  receiptLogoImgHtml,
  receiptPrintMastheadExtraLinesHtml,
  invoicePrintFooterContactHtml,
} from "@/lib/receipt-print-theme";
import type { ClientInvoiceLine } from "@/lib/client-invoice-build";

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function refCellForLine(l: ClientInvoiceLine): string {
  if (l.lineKind === "medication" && l.prescriptionId != null) return `#${l.prescriptionId}`;
  if (l.lineKind === "lab_test" && l.labOrderId != null) return `<span class="muted">Lab #${l.labOrderId}</span>`;
  if (l.lineKind === "visit_service" && l.appointmentId != null) {
    return `<span class="muted">Apt #${l.appointmentId}</span>`;
  }
  return "—";
}

function itemDescriptionCell(l: ClientInvoiceLine): string {
  const prefix =
    l.lineKind === "visit_service" ? `<span class="muted">Service · </span>` : "";
  const labPrefix = l.lineKind === "lab_test" ? `<span class="muted">Lab · </span>` : "";
  return `${prefix}${labPrefix}${escapeHtml(l.productName)} <span class="muted">${escapeHtml(l.productCode)}</span>`;
}

/** Browser print for consolidated client invoice (pharmacy, lab, visit lines). */
export async function printConsolidatedInvoice(payload: {
  patient: { patientCode: string; name: string; phone?: string | null; mobile?: string | null };
  generatedAt: string;
  pharmacyLabel?: string;
  dateRangeLabel?: string;
  prescriptions?: { id: number; prescriptionDate: string; doctorName: string; branchName: string }[];
  labOrders?: { id: number; visitDate: string; doctorName: string; branchName: string; totalAmount: number }[];
  appointments?: { id: number; visitDate: string; doctorName: string; branchName: string }[];
  lines: ClientInvoiceLine[];
  subtotal: number;
}): Promise<void> {
  const ref = `INV-${payload.patient.patientCode}-${new Date(payload.generatedAt).getTime()}`;
  const logoDataUrl = await fetchReceiptLogoAsDataUrl();
  const logoInner = receiptLogoImgHtml(logoDataUrl);
  const w = window.open("", "_blank");
  if (!w) return;

  const rows = payload.lines
    .map(
      (l) => `
      <tr>
        <td>${l.prescriptionDate}</td>
        <td>${refCellForLine(l)}</td>
        <td>${escapeHtml(l.doctorName)}</td>
        <td>${itemDescriptionCell(l)}</td>
        <td class="num">${l.quantity}</td>
        <td class="num">$${l.unitPrice.toFixed(2)}</td>
        <td class="num">$${l.lineTotal.toFixed(2)}</td>
        <td>${l.dosage ? escapeHtml(l.dosage) : "—"}</td>
      </tr>`
    )
    .join("");

  const metaBits: string[] = [];
  if (payload.pharmacyLabel) metaBits.push(escapeHtml(payload.pharmacyLabel));
  if (payload.dateRangeLabel) metaBits.push(escapeHtml(payload.dateRangeLabel));

  const printDate = formatReceiptDateOnly(payload.generatedAt);

  const rxCount = payload.prescriptions?.length ?? 0;
  const labCount = payload.labOrders?.length ?? 0;
  const visitCount = payload.appointments?.length ?? 0;
  const scopeParts: string[] = [];
  if (rxCount) scopeParts.push(`${rxCount} prescription${rxCount === 1 ? "" : "s"}`);
  if (labCount) scopeParts.push(`${labCount} lab order${labCount === 1 ? "" : "s"}`);
  if (visitCount) scopeParts.push(`${visitCount} visit${visitCount === 1 ? "" : "s"}`);
  const scopeLine = scopeParts.length ? scopeParts.join(" · ") : "";

  w.document.write(`<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8" />
  <title>Invoice ${escapeHtml(ref)}</title>
  <style>${clientInvoiceDocumentStyles()}</style>
</head><body>
  <div class="doc-wrap">
    <header class="top-header">
      <div class="company-block">
        <p class="company-name">Call a Doctor</p>
        <p class="company-line">Client invoice</p>
        ${receiptPrintMastheadExtraLinesHtml()}
      </div>
      <div class="logo-box" aria-hidden="true">${logoInner}</div>
    </header>

    <div class="title-band">
      <div>
        <h1 class="receipt-title">Invoice</h1>
        <p class="muted">Itemized charges</p>
      </div>
      <div class="meta-bits">
        <div><span class="lbl">Reference:</span>${escapeHtml(ref)}</div>
        <div><span class="lbl">Date:</span>${printDate}</div>
        ${metaBits.map((m) => `<div>${m}</div>`).join("")}
      </div>
    </div>

    <p><strong>${escapeHtml(payload.patient.name)}</strong></p>
    <p class="muted">Client: ${escapeHtml(payload.patient.patientCode)}${
    [payload.patient.phone, payload.patient.mobile].filter(Boolean).length
      ? ` · ${[payload.patient.phone, payload.patient.mobile]
          .filter(Boolean)
          .map((s) => escapeHtml(String(s)))
          .join(" · ")}`
      : ""
  }</p>
    ${scopeLine ? `<p class="muted" style="margin-bottom:12px">${escapeHtml(scopeLine)}</p>` : ""}

    <table class="inv">
      <thead>
        <tr>
          <th>Visit date</th>
          <th>Ref</th>
          <th>Doctor</th>
          <th>Description</th>
          <th class="num">Qty</th>
          <th class="num">Unit</th>
          <th class="num">Line</th>
          <th>Dosage</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="summary-box">Subtotal: $${payload.subtotal.toFixed(2)}</div>

    <div class="footer-note">
      ${invoicePrintFooterContactHtml()}
      <p style="margin-top:10px">Medication lines use the product selling price at print time. Lab and service lines use amounts recorded on the order or visit.</p>
    </div>
  </div>
</body></html>`);

  w.document.close();
  w.focus();
  const schedule = () => {
    w.focus();
    w.print();
  };
  if (logoDataUrl) {
    requestAnimationFrame(() => setTimeout(schedule, 150));
    return;
  }
  setTimeout(schedule, 200);
}
