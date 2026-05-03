import {
  receiptLogoImgHtml,
  formatReceiptDateOnly,
  pharmacyA5PosReceiptStyles,
  receiptPrintMastheadExtraLinesHtml,
  receiptHeaderPaymentContactBarsHtml,
} from "@/lib/receipt-print-theme";
import { groupLabOrderRowsByCategoryAndPanel } from "@/lib/lab-order-group";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlMultiline(text: string): string {
  if (!text.trim()) return "—";
  return escapeHtml(text).replace(/\r\n/g, "\n").replace(/\n/g, "<br>");
}

function formatSexForReport(s: string | null | undefined): string {
  const t = (s ?? "").trim();
  if (!t) return "—";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function resultCellHtml(r: LabOrderPrintItem): string {
  const rv = (r.resultValue ?? "").trim();
  const n = (r.notes ?? "").trim();
  if (rv && n) return `${escapeHtml(rv)} · ${escapeHtml(n)}`;
  if (rv) return escapeHtml(rv);
  if (n) return escapeHtml(n);
  return "—";
}

export type LabOrderPrintItem = {
  lineNo: number;
  testName: string;
  categoryName: string;
  panelLabel: string | null;
  normalRange: string;
  unit: string;
  unitPrice: number;
  resultValue?: string;
  resultUnit?: string;
  notes?: string;
};

export type LabOrderPrintPayload = {
  orderId: number;
  documentDate: string;
  /** Visit date */
  appointmentDate: string;
  appointmentTime: string;
  branchName: string | null;
  patientName: string;
  patientCode: string;
  doctorName: string;
  orderNotes: string | null;
  /** Demographics for laboratory report header */
  patientSex?: string | null;
  patientAgeLabel?: string | null;
  /** Login user printing / releasing results */
  reportedByName?: string | null;
  items: LabOrderPrintItem[];
};

/** A4 clinical layout matching typical laboratory report PDFs. */
function labClinicalReportCss(): string {
  return `
    @page { size: A4 portrait; margin: 14mm 16mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, "Liberation Sans", sans-serif;
      font-size: 10pt;
      line-height: 1.35;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .lab-report-doc { max-width: 190mm; margin: 0 auto; }
    .lab-report-title {
      text-align: center;
      font-size: 15pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      margin: 0 0 16px 0;
      padding-bottom: 10px;
      border-bottom: 2px solid #000;
    }
    .lab-report-meta {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 6px;
      font-size: 10pt;
    }
    .lab-report-meta td {
      padding: 5px 14px 5px 0;
      vertical-align: top;
    }
    .lab-report-meta .lab-meta-key {
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      white-space: nowrap;
      width: 1%;
      color: #000;
    }
    .lab-report-meta .lab-meta-val { font-weight: 600; color: #000; }
    .lab-report-meta .lab-meta-name { text-transform: uppercase; letter-spacing: 0.02em; }
    .lab-report-order-notes {
      margin: 10px 0 16px 0;
      padding: 8px 10px;
      border: 1px solid #000;
      font-size: 9pt;
      line-height: 1.4;
    }
    .lab-report-order-notes strong {
      text-transform: uppercase;
      font-size: 8.5pt;
      letter-spacing: 0.05em;
    }
    h2.lab-report-section {
      margin: 16px 0 6px 0;
      font-size: 10.5pt;
      font-weight: 700;
      color: #000;
      text-transform: capitalize;
    }
    table.lab-report-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 9.5pt;
    }
    table.lab-report-table th,
    table.lab-report-table td {
      border: 1px solid #000;
      padding: 6px 8px;
      vertical-align: top;
      text-align: left;
    }
    table.lab-report-table thead th {
      font-weight: 700;
      text-transform: uppercase;
      font-size: 8.5pt;
      letter-spacing: 0.07em;
      background: #e8e8e8;
      color: #000;
    }
    th.col-result, td.col-result,
    th.col-unit, td.col-unit {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    td.col-test { font-weight: 600; }
    td.col-range { white-space: normal; }
    .lab-report-by {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 1px solid #000;
      font-size: 10pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  `;
}

function renderLabAnswerReportBody(items: LabOrderPrintItem[]): string {
  const grouped = groupLabOrderRowsByCategoryAndPanel(items);
  const parts: string[] = [];
  for (const { categoryName: catName, segments } of grouped) {
    for (const seg of segments) {
      const sectionTitle = seg.panelLabel ? `${catName}(${seg.panelLabel})` : catName;
      parts.push(`<h2 class="lab-report-section">${escapeHtml(sectionTitle)}</h2>`);
      parts.push(`<table class="lab-report-table"><thead><tr>
        <th class="col-test">Test</th>
        <th class="col-result">Result</th>
        <th class="col-unit">Units</th>
        <th class="col-range">Normal Range</th>
      </tr></thead><tbody>`);
      for (const r of seg.rows) {
        const unitShown = (r.resultUnit ?? "").trim() || (r.unit ?? "").trim() || "—";
        const rangeShown = (r.normalRange ?? "").trim() || "—";
        parts.push(`<tr>
          <td class="col-test">${escapeHtml(r.testName)}</td>
          <td class="col-result">${resultCellHtml(r)}</td>
          <td class="col-unit">${escapeHtml(unitShown)}</td>
          <td class="col-range">${rangeShown === "—" ? "—" : escapeHtmlMultiline(rangeShown)}</td>
        </tr>`);
      }
      parts.push(`</tbody></table>`);
    }
  }
  return parts.join("\n");
}

function renderCategoryBlocks(items: LabOrderPrintItem[]): string {
  const grouped = groupLabOrderRowsByCategoryAndPanel(items);
  const parts: string[] = [];
  for (const { categoryName: catName, segments } of grouped) {
    parts.push(`<h2 class="lab-section-h2">${escapeHtml(catName)}</h2>`);
    for (const seg of segments) {
      if (seg.panelLabel) {
        parts.push(`<p class="lab-panel-label">Panel: ${escapeHtml(seg.panelLabel)}</p>`);
      }
      parts.push(`<table class="lab-sheet-table"><thead><tr>
          <th>#</th><th>Test</th><th>Normal range</th><th>Unit</th><th class="num">Fee</th>
        </tr></thead><tbody>`);
      for (const r of seg.rows) {
        parts.push(`<tr>
            <td class="num">${r.lineNo}</td>
            <td>${escapeHtml(r.testName)}</td>
            <td class="muted">${escapeHtml(r.normalRange)}</td>
            <td>${escapeHtml(r.unit)}</td>
            <td class="num">$${r.unitPrice.toFixed(2)}</td>
          </tr>`);
      }
      parts.push(`</tbody></table>`);
    }
  }
  return parts.join("\n");
}

const labSheetExtraStyles = `
  h2.lab-section-h2 {
    margin: 14px 0 6px 0;
    font-size: 10pt;
    font-weight: 700;
    color: var(--brand);
    border-bottom: 1px solid #e4e7ec;
    padding-bottom: 4px;
  }
  p.lab-panel-label {
    margin: 8px 0 4px 0;
    font-size: 8.5pt;
    font-weight: 600;
    color: #344054;
  }
  table.lab-sheet-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8.5pt;
    margin-bottom: 10px;
  }
  table.lab-sheet-table th, table.lab-sheet-table td {
    border: 1px solid #e4e7ec;
    padding: 5px 4px;
    vertical-align: top;
  }
  table.lab-sheet-table thead th {
    background: var(--brand-tint);
    color: var(--brand);
    font-weight: 700;
    text-align: left;
    font-size: 8pt;
  }
  table.lab-sheet-table th.num, table.lab-sheet-table td.num {
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  table.lab-sheet-table .muted { color: #667085; }
  table.lab-sheet-table .small { font-size: 8pt; }
  table.lab-answer .write-cell { min-height: 1.4em; }
  .title-band.lab-title-center {
    justify-content: center;
  }
  .title-band.lab-title-center .title-wrap {
    width: 100%;
    text-align: center;
  }
  .title-band.lab-title-center .receipt-title {
    margin-bottom: 0;
  }
`;

/**
 * Opens a tab, writes the sheet HTML, and calls print() synchronously in the click stack.
 * No async work before print — otherwise browsers drop user activation and block the print dialog.
 * Logo uses same-origin URL (embedded via receiptLogoImgHtml(null)) so no preload fetch is needed.
 */
function openLabSheetPrintWindow(
  title: string,
  receiptTitle: string,
  payload: LabOrderPrintPayload,
  bodyInnerHtml: string,
  opts?: { minimalFooterAndMeta?: boolean }
): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const minimal = opts?.minimalFooterAndMeta === true;
  const logoImgInner = receiptLogoImgHtml(null);
  const branchLine1 =
    payload.branchName && String(payload.branchName).trim()
      ? escapeHtml(String(payload.branchName).trim())
      : "Main clinic";
  const orderNoDisplay = String(payload.orderId).padStart(6, "0");
  const docDateStr = formatReceiptDateOnly(payload.documentDate);
  const visitStr = `${formatReceiptDateOnly(payload.appointmentDate)} · ${escapeHtml(payload.appointmentTime)}`;
  const notesBlock =
    payload.orderNotes && String(payload.orderNotes).trim()
      ? `<p class="notes-body">${escapeHtml(String(payload.orderNotes).trim())}</p>`
      : "";

  const titleBandHtml = minimal
    ? `<div class="title-band lab-title-center">
      <div class="title-wrap">
        <h1 class="receipt-title">${escapeHtml(receiptTitle)}</h1>
      </div>
    </div>`
    : `<div class="title-band">
      <div class="title-right">
        <h1 class="receipt-title">${escapeHtml(receiptTitle)}</h1>
        <div class="meta-lines">
          <div><span class="lbl">Order #:</span>${orderNoDisplay}</div>
          <div><span class="lbl">Printed:</span>${docDateStr}</div>
          <div><span class="lbl">Visit:</span>${visitStr}</div>
        </div>
      </div>
    </div>`;

  const footerHtml = minimal
    ? ""
    : `<footer class="footer">
      <h3 class="notes-heading">Notes</h3>
      <p class="notes-body">Laboratory use — verify patient ID and order number before releasing results.</p>
    </footer>`;

  printWindow.document.open();
  printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${pharmacyA5PosReceiptStyles()}${labSheetExtraStyles}</style>
</head>
<body>
  <div class="sheet">
    <header class="top-header">
      <div class="company-block">
        <p class="company-name">Call a Doctor</p>
        <p class="company-line">${branchLine1}</p>
        ${receiptPrintMastheadExtraLinesHtml()}
        ${receiptHeaderPaymentContactBarsHtml()}
      </div>
      <div class="logo-box" aria-label="Clinic logo">${logoImgInner}</div>
    </header>
    ${titleBandHtml}
    <section class="billed" aria-label="Client">
      <h2>Client</h2>
      <p class="billed-name">${escapeHtml(payload.patientName)} (${escapeHtml(payload.patientCode)})</p>
      <p class="billed-extra">Doctor: ${escapeHtml(payload.doctorName)}</p>
    </section>
    ${notesBlock ? `<div class="lab-order-notes"><h3 class="notes-heading">Order notes</h3>${notesBlock}</div>` : ""}
    <div class="lab-body">${bodyInnerHtml}</div>
    <div class="footer-spacer"></div>
    ${footerHtml}
  </div>
</body>
</html>`);
  printWindow.document.close();

  printWindow.focus();
  printWindow.addEventListener(
    "afterprint",
    () => {
      printWindow.close();
    },
    { once: true }
  );
  printWindow.print();
}

function openLabAnswerClinicalReportWindow(payload: LabOrderPrintPayload): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const dateStr = formatReceiptDateOnly(payload.documentDate);
  const bodyInner = renderLabAnswerReportBody(payload.items);
  const reported =
    payload.reportedByName && payload.reportedByName.trim()
      ? escapeHtml(payload.reportedByName.trim())
      : "—";
  const orderNotesBlock =
    payload.orderNotes && String(payload.orderNotes).trim()
      ? `<div class="lab-report-order-notes"><strong>Order notes</strong> · ${escapeHtml(String(payload.orderNotes).trim())}</div>`
      : "";

  printWindow.document.open();
  printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(`Laboratory report #${payload.orderId}`)}</title>
  <style>${labClinicalReportCss()}</style>
</head>
<body>
  <div class="lab-report-doc">
    <h1 class="lab-report-title">Laboratory report</h1>
    <table class="lab-report-meta" aria-label="Patient details">
      <tr>
        <td class="lab-meta-key">Patient name</td>
        <td class="lab-meta-val lab-meta-name">${escapeHtml(payload.patientName).toUpperCase()}</td>
      </tr>
      <tr>
        <td class="lab-meta-key">Sex</td>
        <td class="lab-meta-val">${escapeHtml(formatSexForReport(payload.patientSex))}</td>
      </tr>
      <tr>
        <td class="lab-meta-key">Age</td>
        <td class="lab-meta-val">${escapeHtml(payload.patientAgeLabel ?? "—")}</td>
      </tr>
      <tr>
        <td class="lab-meta-key">Lab ID</td>
        <td class="lab-meta-val">${escapeHtml(String(payload.orderId))}</td>
      </tr>
      <tr>
        <td class="lab-meta-key">Date</td>
        <td class="lab-meta-val">${escapeHtml(dateStr)}</td>
      </tr>
      <tr>
        <td class="lab-meta-key">Referring doctor</td>
        <td class="lab-meta-val">${escapeHtml(payload.doctorName)}</td>
      </tr>
    </table>
    ${orderNotesBlock}
    ${bodyInner}
    <p class="lab-report-by">REPORTED BY: ${reported}</p>
  </div>
</body>
</html>`);
  printWindow.document.close();

  printWindow.focus();
  printWindow.addEventListener(
    "afterprint",
    () => {
      printWindow.close();
    },
    { once: true }
  );
  printWindow.print();
}

export function printLabRequestSheet(payload: LabOrderPrintPayload): void {
  const blocks = renderCategoryBlocks(payload.items);
  openLabSheetPrintWindow(`Lab request #${payload.orderId}`, "Lab request", payload, blocks, {
    minimalFooterAndMeta: true,
  });
}

export function printLabAnswerSheet(payload: LabOrderPrintPayload): void {
  openLabAnswerClinicalReportWindow(payload);
}
