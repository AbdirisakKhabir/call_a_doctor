import { escapeHtml } from "@/lib/patient-invoice-print";
import type { CareFileInvoicePayload } from "@/lib/care-file";
import {
  clientInvoiceDocumentStyles,
  fetchReceiptLogoAsDataUrl,
  formatReceiptDateOnly,
  receiptLogoImgHtml,
  receiptPrintMastheadExtraLinesHtml,
  invoicePrintFooterContactHtml,
} from "@/lib/receipt-print-theme";

function patientDisplayName(p: CareFileInvoicePayload["patient"]): string {
  const a = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
  return a || p.patientCode;
}

/** Browser print for client file invoice / statement (receipt template). */
export async function printCareFileInvoice(payload: CareFileInvoicePayload): Promise<void> {
  const name = patientDisplayName(payload.patient);
  const ref = escapeHtml(payload.file.fileCode);
  const logoDataUrl = await fetchReceiptLogoAsDataUrl();
  const logoInner = receiptLogoImgHtml(logoDataUrl);
  const w = window.open("", "_blank");
  if (!w) return;

  const branchLine =
    payload.sections.appointments[0]?.branch ??
    payload.sections.pharmacySales[0]?.branch ??
    "Main clinic";

  const apptRows = payload.sections.appointments
    .map(
      (a) => `
    <tr>
      <td>${escapeHtml(a.date)} ${escapeHtml(a.startTime)}</td>
      <td>${escapeHtml(a.branch)}</td>
      <td>${escapeHtml(a.doctor)}</td>
      <td class="num">$${a.totalAmount.toFixed(2)}</td>
    </tr>`
    )
    .join("");

  const labRows = payload.sections.labOrders
    .map(
      (o) => `
    <tr>
      <td>#${o.id}</td>
      <td>${escapeHtml(o.doctor)}</td>
      <td>${o.tests.map((t) => escapeHtml(t.name)).join(", ")}</td>
      <td class="num">$${o.totalAmount.toFixed(2)}</td>
    </tr>`
    )
    .join("");

  const visitRows = payload.sections.visitCards
    .filter((v) => v.amount > 0)
    .map(
      (v) => `
    <tr>
      <td>${escapeHtml(v.label)}</td>
      <td colspan="2" class="muted">${escapeHtml(v.detail)}</td>
      <td class="num">$${v.amount.toFixed(2)}</td>
    </tr>`
    )
    .join("");

  const rxRows = payload.sections.prescriptions
    .map(
      (l) => `
    <tr>
      <td>${escapeHtml(l.prescriptionDate)}</td>
      <td>#${l.prescriptionId}</td>
      <td>${escapeHtml(l.doctorName)}</td>
      <td>${escapeHtml(l.productName)} <span class="muted">${escapeHtml(l.productCode)}</span></td>
      <td class="num">${l.quantity}</td>
      <td class="num">$${l.unitPrice.toFixed(2)}</td>
      <td class="num">$${l.lineTotal.toFixed(2)}</td>
    </tr>`
    )
    .join("");

  const pharmacyBlock = payload.sections.pharmacySales
    .map((sale) => {
      const head = `
      <tr>
        <td colspan="5"><strong>Sale #${sale.id}</strong> · ${formatReceiptDateOnly(sale.saleDate)} · ${escapeHtml(sale.branch)} · ${escapeHtml(sale.paymentMethod)} · <span class="num">$${sale.totalAmount.toFixed(2)}</span></td>
      </tr>`;
      const lines = sale.lines
        .map(
          (ln) => `
      <tr>
        <td class="muted" style="padding-left:16px">${ln.code ? escapeHtml(ln.code) : "—"}</td>
        <td colspan="2">${escapeHtml(ln.label)}</td>
        <td class="num">${ln.quantity}</td>
        <td class="num">$${ln.lineTotal.toFixed(2)}</td>
      </tr>`
        )
        .join("");
      return head + lines;
    })
    .join("");

  const payRows = payload.sections.payments
    .map(
      (p) => `
    <tr>
      <td>${new Date(p.createdAt).toLocaleString()}</td>
      <td>${escapeHtml(p.category)}</td>
      <td class="num">$${p.amount.toFixed(2)}</td>
      <td class="num">$${p.discount.toFixed(2)}</td>
      <td>${p.paymentMethod ? escapeHtml(p.paymentMethod) : "—"}</td>
    </tr>`
    )
    .join("");

  const notesRows = payload.sections.clinicalNotes
    .map(
      (n) => `
    <tr>
      <td>${new Date(n.createdAt).toLocaleString()}</td>
      <td>${escapeHtml(n.type)}</td>
      <td>${escapeHtml(n.doctor)}</td>
      <td>${escapeHtml(n.preview)}</td>
    </tr>`
    )
    .join("");

  const generatedDate = formatReceiptDateOnly(new Date().toISOString());

  w.document.write(`<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8" />
  <title>Client invoice ${ref}</title>
  <style>${clientInvoiceDocumentStyles()}</style>
</head><body>
  <div class="doc-wrap">
    <header class="top-header">
      <div class="company-block">
        <p class="company-name">Call a Doctor</p>
        <p class="company-line">${escapeHtml(branchLine)}</p>
        ${receiptPrintMastheadExtraLinesHtml()}
      </div>
      <div class="logo-box" aria-hidden="true">${logoInner}</div>
    </header>

    <div class="title-band">
      <div>
        <h1 class="receipt-title">Client invoice</h1>
        <p class="muted">Services, laboratory, pharmacy (POS), prescriptions (estimate), and payments on file.</p>
      </div>
      <div class="meta-bits">
        <div><span class="lbl">File:</span>${ref}</div>
        <div><span class="lbl">Status:</span>${escapeHtml(payload.file.status)}</div>
        <div><span class="lbl">Opened:</span>${formatReceiptDateOnly(payload.file.openedAt)}</div>
        <div><span class="lbl">Printed:</span>${generatedDate}</div>
      </div>
    </div>

    <p><strong>${escapeHtml(name)}</strong></p>
    <p class="muted">Client code: ${escapeHtml(payload.patient.patientCode)}${
    [payload.patient.phone, payload.patient.mobile].filter(Boolean).length
      ? ` · ${[payload.patient.phone, payload.patient.mobile]
          .filter(Boolean)
          .map((s) => escapeHtml(String(s)))
          .join(" · ")}`
      : ""
  }</p>

    <h2 class="section">Calendar &amp; services</h2>
    <table class="inv">
      <thead><tr><th>Date</th><th>Branch</th><th>Doctor</th><th class="num">Amount</th></tr></thead>
      <tbody>${apptRows || `<tr><td colspan="4" class="muted">None</td></tr>`}</tbody>
    </table>

    <h2 class="section">Laboratory</h2>
    <table class="inv">
      <thead><tr><th>Order</th><th>Doctor</th><th>Tests</th><th class="num">Amount</th></tr></thead>
      <tbody>${labRows || `<tr><td colspan="4" class="muted">None</td></tr>`}</tbody>
    </table>

    <h2 class="section">Pharmacy sales (POS)</h2>
    <table class="inv">
      <thead><tr><th>Code</th><th colspan="2">Description</th><th class="num">Qty</th><th class="num">Line</th></tr></thead>
      <tbody>${pharmacyBlock || `<tr><td colspan="5" class="muted">None</td></tr>`}</tbody>
    </table>

    <h2 class="section">Visit cards (unpaid on file)</h2>
    <table class="inv">
      <thead><tr><th>Card</th><th colspan="2">Detail</th><th class="num">Due</th></tr></thead>
      <tbody>${visitRows || `<tr><td colspan="4" class="muted">None</td></tr>`}</tbody>
    </table>

    <h2 class="section">Prescriptions (estimated retail)</h2>
    <table class="inv">
      <thead><tr><th>Date</th><th>Rx</th><th>Doctor</th><th>Product</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Line</th></tr></thead>
      <tbody>${rxRows || `<tr><td colspan="7" class="muted">None</td></tr>`}</tbody>
    </table>

    <h2 class="section">Clinical notes (summary)</h2>
    <table class="inv">
      <thead><tr><th>When</th><th>Type</th><th>Doctor</th><th>Preview</th></tr></thead>
      <tbody>${notesRows || `<tr><td colspan="4" class="muted">None</td></tr>`}</tbody>
    </table>

    <h2 class="section">Payments on file</h2>
    <table class="inv">
      <thead><tr><th>When</th><th>Category</th><th class="num">Cash</th><th class="num">Discount</th><th>Method</th></tr></thead>
      <tbody>${payRows || `<tr><td colspan="5" class="muted">None</td></tr>`}</tbody>
    </table>

    <div class="summary-box">
      Charges (incl. Rx estimate &amp; POS): $${payload.totals.charges.toFixed(2)} ·
      Payments: $${payload.totals.payments.toFixed(2)} ·
      Remaining on file: $${payload.totals.remainingOnFile.toFixed(2)}
      <div class="muted" style="margin-top:8px;font-weight:400;font-size:9pt">
        POS: $${payload.totals.pharmacyPos.toFixed(2)} · Labs: $${payload.totals.laboratory.toFixed(2)} · Services: $${payload.totals.appointments.toFixed(2)}
      </div>
    </div>

    <div class="footer-note">
      ${invoicePrintFooterContactHtml()}
      <p style="margin-top:10px">Call a Doctor — ${escapeHtml(branchLine)}</p>
      <p style="margin-top:10px">Prescription lines use current product selling price (estimate). Account balance may include other charges.</p>
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
