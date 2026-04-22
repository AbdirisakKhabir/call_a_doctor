import { escapeHtml } from "@/lib/patient-invoice-print";
import type { CareFileInvoicePayload } from "@/lib/care-file";

function patientDisplayName(p: CareFileInvoicePayload["patient"]): string {
  const a = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
  return a || p.patientCode;
}

/** Browser print for client file invoice / statement. */
export function printCareFileInvoice(payload: CareFileInvoicePayload) {
  const name = patientDisplayName(payload.patient);
  const ref = `${payload.file.fileCode}`;
  const w = window.open("", "_blank");
  if (!w) return;

  const apptRows = payload.sections.appointments
    .map(
      (a) => `
    <tr>
      <td>${a.date} ${escapeHtml(a.startTime)}</td>
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

  w.document.write(`<!DOCTYPE html>
<html><head><title>Client file ${escapeHtml(ref)}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; max-width: 960px; margin: 0 auto; color: #111; }
  h1 { font-size: 1.25rem; margin: 0 0 4px; }
  h2 { font-size: 1rem; margin: 24px 0 8px; }
  .muted { color: #666; font-size: 0.85em; }
  .meta { font-size: 0.9rem; color: #444; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 8px; }
  th, td { border-bottom: 1px solid #ddd; padding: 8px 6px; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; font-weight: 600; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .total { margin-top: 12px; text-align: right; font-size: 1.05rem; font-weight: 700; }
  @media print { body { padding: 12px; } }
</style></head><body>
  <h1>Client file — ${escapeHtml(payload.file.fileCode)}</h1>
  <p class="meta">Status: ${escapeHtml(payload.file.status)} · Opened ${new Date(payload.file.openedAt).toLocaleString()}</p>
  <p><strong>${escapeHtml(name)}</strong> (${escapeHtml(payload.patient.patientCode)})${
    [payload.patient.phone, payload.patient.mobile].filter(Boolean).length
      ? ` · ${[payload.patient.phone, payload.patient.mobile]
          .filter(Boolean)
          .map((s) => escapeHtml(String(s)))
          .join(" · ")}`
      : ""
  }</p>

  <h2>Calendar</h2>
  <table>
    <thead><tr><th>Date</th><th>Branch</th><th>Doctor</th><th class="num">Amount</th></tr></thead>
    <tbody>${apptRows || `<tr><td colspan="4" class="muted">None</td></tr>`}</tbody>
  </table>

  <h2>Laboratory</h2>
  <table>
    <thead><tr><th>Order</th><th>Doctor</th><th>Tests</th><th class="num">Amount</th></tr></thead>
    <tbody>${labRows || `<tr><td colspan="4" class="muted">None</td></tr>`}</tbody>
  </table>

  <h2>Visit cards (unpaid fee on file)</h2>
  <table>
    <thead><tr><th>Card</th><th colspan="2">Detail</th><th class="num">Due</th></tr></thead>
    <tbody>${visitRows || `<tr><td colspan="4" class="muted">None</td></tr>`}</tbody>
  </table>

  <h2>Prescriptions (estimated retail)</h2>
  <table>
    <thead><tr><th>Date</th><th>Rx</th><th>Doctor</th><th>Product</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Line</th></tr></thead>
    <tbody>${rxRows || `<tr><td colspan="7" class="muted">None</td></tr>`}</tbody>
  </table>

  <h2>Clinical notes (summary)</h2>
  <table>
    <thead><tr><th>When</th><th>Type</th><th>Doctor</th><th>Preview</th></tr></thead>
    <tbody>${notesRows || `<tr><td colspan="4" class="muted">None</td></tr>`}</tbody>
  </table>

  <h2>Payments on file</h2>
  <table>
    <thead><tr><th>When</th><th>Category</th><th class="num">Cash</th><th class="num">Discount</th><th>Method</th></tr></thead>
    <tbody>${payRows || `<tr><td colspan="5" class="muted">None</td></tr>`}</tbody>
  </table>

  <p class="total">
    Charges (incl. Rx estimate): $${payload.totals.charges.toFixed(2)} ·
    Payments recorded on file: $${payload.totals.payments.toFixed(2)} ·
    Remaining on file: $${payload.totals.remainingOnFile.toFixed(2)}
  </p>
  <p class="muted" style="margin-top:16px;font-size:0.8rem">
    Prescription lines use current product selling price (estimate). Client account balance may include other charges.
  </p>
</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}
