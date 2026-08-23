import { escapeHtml } from "@/lib/patient-invoice-print";
import { groupLabOrderRowsByCategoryAndPanel } from "@/lib/lab-order-group";
import { printHtmlDocument } from "@/lib/print-html-document";
import {
  fetchReceiptLogoAsDataUrl,
  formatReceiptDateOnly,
  receiptLogoImgHtml,
} from "@/lib/receipt-print-theme";

export type ClientHistoryPrintPatient = {
  name: string;
  patientCode: string;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  notes: string | null;
  accountBalance: number;
};

export type ClientHistoryPrintLabOrder = {
  id: number;
  status: string;
  totalAmount: number;
  notes: string | null;
  doctor: { name: string };
  appointment: { appointmentDate: string; startTime: string; branch: { name: string } };
  items: {
    id: number;
    unitPrice: number;
    resultValue: string | null;
    resultUnit: string | null;
    status: string;
    notes: string | null;
    panelParentTest: { name: string } | null;
    labTest: {
      name: string;
      unit: string | null;
      normalRange: string | null;
      code: string | null;
      category: { name: string } | null;
    };
  }[];
};

export type ClientHistoryPrintPrescription = {
  id: number;
  status: string;
  notes: string | null;
  isEmergency: boolean;
  doctor: { name: string };
  appointment: { appointmentDate: string; startTime: string; branch: { name: string } };
  items: {
    id: number;
    quantity: number;
    dosage: string | null;
    instructions: string | null;
    product: { name: string; code: string };
  }[];
};

export type ClientHistoryPrintFormResponse = {
  id: number;
  submittedAt: string;
  form: { title: string };
  appointment: { appointmentDate: string; startTime: string; branch: { name: string } } | null;
  submittedBy: { name: string | null; email: string } | null;
  answers: { id: number; fieldLabel: string; fieldType: string; value: string }[];
};

export type ClientHistoryPrintPayload = {
  patient: ClientHistoryPrintPatient;
  formResponses: ClientHistoryPrintFormResponse[];
  labOrders: ClientHistoryPrintLabOrder[];
  prescriptions: ClientHistoryPrintPrescription[];
  includeForms: boolean;
  includeLabs: boolean;
  includePrescriptions: boolean;
};

function formatVisit(d: string, t: string) {
  return `${formatReceiptDateOnly(d)} · ${t}`;
}

function formatAnswer(fieldType: string, value: string): string {
  if (fieldType === "CHECKBOX") return value === "1" ? "Yes" : "No";
  if (fieldType === "MULTI_CHECK") {
    try {
      const a = JSON.parse(value) as unknown;
      return Array.isArray(a) ? a.join(", ") : value;
    } catch {
      return value;
    }
  }
  return value;
}

function sheet(inner: string): string {
  return `<section class="sheet">${inner}</section>`;
}

function pageHead(title: string, patient: ClientHistoryPrintPatient, logoHtml: string): string {
  return `<header class="masthead">
    ${logoHtml}
    <div>
      <p class="clinic">Call a Doctor</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="who"><strong>${escapeHtml(patient.name)}</strong> · <span class="mono">${escapeHtml(patient.patientCode)}</span></p>
    </div>
  </header>`;
}

function coverHtml(patient: ClientHistoryPrintPatient, logoHtml: string): string {
  const bits: string[] = [];
  if (patient.phone) bits.push(`<div><span>Phone</span>${escapeHtml(patient.phone)}</div>`);
  if (patient.mobile) bits.push(`<div><span>Mobile</span>${escapeHtml(patient.mobile)}</div>`);
  if (patient.email) bits.push(`<div><span>Email</span>${escapeHtml(patient.email)}</div>`);
  if (patient.gender) bits.push(`<div><span>Gender</span>${escapeHtml(patient.gender)}</div>`);
  if (patient.dateOfBirth) {
    bits.push(`<div><span>Date of birth</span>${escapeHtml(new Date(patient.dateOfBirth).toLocaleDateString())}</div>`);
  }
  bits.push(`<div><span>Balance</span>$${patient.accountBalance.toFixed(2)}</div>`);
  const notes = patient.notes?.trim()
    ? `<p class="notes"><strong>Chart notes</strong><br>${escapeHtml(patient.notes.trim())}</p>`
    : "";
  return sheet(`${pageHead("Client history", patient, logoHtml)}
    <p class="printed">Printed ${escapeHtml(new Date().toLocaleString())}</p>
    <div class="facts">${bits.join("")}</div>
    ${notes}
    <p class="hint">Each form, laboratory order, and prescription prints on its own page.</p>`);
}

function formHtml(r: ClientHistoryPrintFormResponse, patient: ClientHistoryPrintPatient, logoHtml: string): string {
  const by = r.submittedBy?.name || r.submittedBy?.email || "—";
  const visit = r.appointment
    ? `${formatVisit(r.appointment.appointmentDate, r.appointment.startTime)} · ${escapeHtml(r.appointment.branch.name)}`
    : "Not linked to a visit";
  const rows = r.answers
    .map(
      (a) => `<tr><th>${escapeHtml(a.fieldLabel)}</th><td>${escapeHtml(formatAnswer(a.fieldType, a.value))}</td></tr>`
    )
    .join("");
  return sheet(`${pageHead("Clinic form", patient, logoHtml)}
    <h2>${escapeHtml(r.form.title)}</h2>
    <p class="meta">${escapeHtml(formatReceiptDateOnly(r.submittedAt))} · ${escapeHtml(by)} · ${visit}</p>
    <table class="qa">${rows || `<tr><td colspan="2">No answers</td></tr>`}</table>`);
}

function labHtml(order: ClientHistoryPrintLabOrder, patient: ClientHistoryPrintPatient, logoHtml: string): string {
  const groupedRows = order.items.map((item, index) => ({
    categoryName: item.labTest.category?.name ?? "Uncategorized",
    panelLabel: item.panelParentTest?.name ?? null,
    lineNo: index + 1,
    testName: item.labTest.name,
    code: item.labTest.code,
    normalRange: item.labTest.normalRange?.trim() ? item.labTest.normalRange : "—",
    unit: item.labTest.unit?.trim() ? item.labTest.unit : "—",
    unitPrice: item.unitPrice,
    resultValue: item.resultValue,
    resultUnit: item.resultUnit,
    status: item.status,
    lineNotes: item.notes,
  }));
  const grouped = groupLabOrderRowsByCategoryAndPanel(groupedRows);
  const blocks: string[] = [];
  for (const { categoryName, segments } of grouped) {
    const segs = segments
      .map((seg) => {
        const panel = seg.panelLabel ? `<p class="panel">Panel: ${escapeHtml(seg.panelLabel)}</p>` : "";
        const tr = seg.rows
          .map((r) => {
            const result = r.resultValue
              ? `${escapeHtml(r.resultValue)}${r.resultUnit ? ` ${escapeHtml(r.resultUnit)}` : ""}`
              : "—";
            return `<tr>
              <td class="num">${r.lineNo}</td>
              <td>${escapeHtml(r.testName)}${r.code ? `<div class="muted mono">${escapeHtml(r.code)}</div>` : ""}</td>
              <td>${escapeHtml(r.normalRange)}</td>
              <td>${escapeHtml(r.unit)}</td>
              <td class="num">$${r.unitPrice.toFixed(2)}</td>
              <td>${result}<div class="muted">${escapeHtml(r.status)}</div></td>
              <td>${escapeHtml(r.lineNotes?.trim() || "—")}</td>
            </tr>`;
          })
          .join("");
        return `${panel}<table>
          <thead><tr><th>#</th><th>Test</th><th>Ref. range</th><th>Unit</th><th>Fee</th><th>Result</th><th>Notes</th></tr></thead>
          <tbody>${tr}</tbody>
        </table>`;
      })
      .join("");
    blocks.push(`<h3>${escapeHtml(categoryName)}</h3>${segs}`);
  }
  const notes = order.notes?.trim()
    ? `<p class="notes"><strong>Order notes</strong><br>${escapeHtml(order.notes.trim())}</p>`
    : "";
  return sheet(`${pageHead("Laboratory", patient, logoHtml)}
    <h2>Lab request #${String(order.id).padStart(6, "0")}</h2>
    <p class="meta">${escapeHtml(formatVisit(order.appointment.appointmentDate, order.appointment.startTime))}
      · ${escapeHtml(order.appointment.branch.name)} · Dr. ${escapeHtml(order.doctor.name)}
      · ${escapeHtml(order.status)} · $${(order.totalAmount ?? 0).toFixed(2)}</p>
    ${notes}
    ${blocks.join("") || "<p>No tests</p>"}`);
}

function rxHtml(rx: ClientHistoryPrintPrescription, patient: ClientHistoryPrintPatient, logoHtml: string): string {
  const lines = rx.items
    .map(
      (line) => `<tr>
        <td>${escapeHtml(line.product.name)}<div class="muted mono">${escapeHtml(line.product.code)}</div></td>
        <td class="num">${line.quantity}</td>
        <td>${escapeHtml(line.dosage || "—")}</td>
        <td>${escapeHtml(line.instructions || "—")}</td>
      </tr>`
    )
    .join("");
  const notes = rx.notes?.trim()
    ? `<p class="notes"><strong>Notes</strong><br>${escapeHtml(rx.notes.trim())}</p>`
    : "";
  const emergency = rx.isEmergency ? `<span class="badge">Emergency</span>` : "";
  return sheet(`${pageHead("Prescription", patient, logoHtml)}
    <h2>Prescription #${rx.id} ${emergency}</h2>
    <p class="meta">${escapeHtml(formatVisit(rx.appointment.appointmentDate, rx.appointment.startTime))}
      · ${escapeHtml(rx.appointment.branch.name)} · Dr. ${escapeHtml(rx.doctor.name)}
      · ${escapeHtml(rx.status)}</p>
    ${notes}
    <table>
      <thead><tr><th>Medication</th><th>Qty</th><th>Dosage</th><th>Instructions</th></tr></thead>
      <tbody>${lines || `<tr><td colspan="4">No items</td></tr>`}</tbody>
    </table>`);
}

function styles(): string {
  return `
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #111; }
    .sheet {
      break-after: page;
      page-break-after: always;
      min-height: 250mm;
    }
    .sheet:last-child {
      break-after: auto;
      page-break-after: auto;
    }
    .masthead { display: flex; gap: 16px; align-items: center; border-bottom: 2px solid #2b5532; padding-bottom: 10px; margin-bottom: 14px; }
    .masthead img { display: block; }
    .clinic { margin: 0; font-size: 10pt; letter-spacing: 0.08em; text-transform: uppercase; color: #2b5532; }
    h1 { margin: 2px 0 4px; font-size: 16pt; }
    h2 { margin: 0 0 6px; font-size: 13pt; }
    h3 { margin: 14px 0 6px; font-size: 10pt; text-transform: uppercase; letter-spacing: 0.04em; color: #2b5532; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
    .who { margin: 0; font-size: 10pt; }
    .mono { font-family: ui-monospace, Menlo, monospace; }
    .meta, .printed, .hint { color: #444; font-size: 9.5pt; margin: 0 0 12px; }
    .hint { font-style: italic; margin-top: 24px; }
    .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin: 16px 0; }
    .facts span { display: block; font-size: 8pt; text-transform: uppercase; color: #666; }
    .notes { background: #f4f7f4; padding: 8px 10px; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 9.5pt; }
    th, td { border: 1px solid #ccc; padding: 5px 6px; vertical-align: top; text-align: left; }
    thead th { background: #e3f5e7; }
    table.qa th { width: 32%; background: #f6f6f6; font-weight: 600; }
    td.num { text-align: right; font-family: ui-monospace, Menlo, monospace; white-space: nowrap; }
    .muted { color: #666; font-size: 8pt; }
    .panel { margin: 8px 0 4px; font-weight: 600; font-size: 9.5pt; }
    .badge { display: inline-block; margin-left: 8px; font-size: 8pt; text-transform: uppercase; background: #fde68a; padding: 2px 6px; border-radius: 3px; }
  `;
}

export async function printClientHistory(payload: ClientHistoryPrintPayload): Promise<void> {
  const logoDataUrl = await fetchReceiptLogoAsDataUrl();
  const logoHtml = receiptLogoImgHtml(logoDataUrl, 72, 72);
  const parts: string[] = [coverHtml(payload.patient, logoHtml)];
  if (payload.includeForms) {
    for (const r of payload.formResponses) parts.push(formHtml(r, payload.patient, logoHtml));
  }
  if (payload.includeLabs) {
    for (const o of payload.labOrders) parts.push(labHtml(o, payload.patient, logoHtml));
  }
  if (payload.includePrescriptions) {
    for (const rx of payload.prescriptions) parts.push(rxHtml(rx, payload.patient, logoHtml));
  }
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Client history · ${escapeHtml(payload.patient.patientCode)}</title>
  <style>${styles()}</style>
</head>
<body>
${parts.join("\n")}
</body>
</html>`;
  printHtmlDocument(html);
}
