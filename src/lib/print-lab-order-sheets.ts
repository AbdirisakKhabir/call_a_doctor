import {
  formatReceiptDateOnly,
  RECEIPT_LOGO_PUBLIC_PATH,
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
    .lab-report-doc {
      max-width: 190mm;
      margin: 0 auto;
      position: relative;
      min-height: calc(297mm - 28mm);
      padding-bottom: 22mm;
    }
    .lab-header-logo {
      text-align: center;
      margin: 0 0 8mm 0;
      padding-top: 1mm;
      border-bottom: 2px solid #23b99a;
    }
    .lab-header-logo img {
      width: 140px;
      height: auto;
      display: inline-block;
      margin: 0 auto 6px auto;
    }
    .lab-report-title {
      text-align: center;
      font-size: 11pt;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
      text-decoration: underline;
      margin: 0 0 10mm 0;
      border: none;
      padding: 0;
    }
    .lab-report-meta {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 4mm;
      font-size: 9.5pt;
    }
    .lab-report-meta td {
      padding: 2px 6px;
      vertical-align: top;
      border-bottom: 1px solid #c8c8c8;
    }
    .lab-report-meta .lab-meta-key {
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0;
      white-space: nowrap;
      width: 92px;
      color: #000;
      border-right: 1px solid #c8c8c8;
      padding-left: 4px;
    }
    .lab-report-meta .lab-meta-val { font-weight: 600; color: #000; }
    .lab-report-meta .lab-meta-name { text-transform: uppercase; letter-spacing: 0.02em; }
    .lab-report-order-notes {
      margin: 8px 0 12px 0;
      padding: 6px 8px;
      border: 1px solid #000;
      font-size: 8.8pt;
      line-height: 1.4;
      background: #f7f7f7;
    }
    .lab-report-order-notes strong {
      text-transform: uppercase;
      font-size: 8.5pt;
      letter-spacing: 0.05em;
    }
    h2.lab-report-section {
      margin: 12px 0 0 0;
      font-size: 0;
      line-height: 0;
      height: 0;
      font-weight: 700;
      color: #000;
      text-transform: capitalize;
    }
    table.lab-report-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10mm;
      font-size: 9pt;
    }
    table.lab-report-table th,
    table.lab-report-table td {
      border: 1px solid #000;
      padding: 3px 6px;
      vertical-align: top;
      text-align: center;
    }
    table.lab-report-table thead th {
      font-weight: 700;
      text-transform: none;
      font-size: 8.9pt;
      letter-spacing: 0;
      background: #bed8ad;
      color: #000;
    }
    table.lab-report-table thead .test-col-head {
      background: #fff;
      border-top-color: #fff;
      border-left-color: #fff;
      border-right-color: #000;
      font-size: 0;
      line-height: 0;
      padding: 0;
    }
    table.lab-report-table thead .section-head {
      text-align: left;
      font-style: italic;
      font-size: 11pt;
      padding: 2px 10px;
      background: #bed8ad;
    }
    th.col-result, td.col-result,
    th.col-unit, td.col-unit {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    td.col-test {
      font-style: italic;
      width: 33%;
      text-align: center;
    }
    td.col-result { width: 25%; font-weight: 700; }
    td.col-unit { width: 25%; font-weight: 700; }
    td.col-range { width: 27%; font-weight: 700; }
    td.col-range { white-space: normal; }
    .lab-report-by {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 10mm;
      margin: 0;
      padding: 0;
      border: none;
      font-size: 9pt;
      font-weight: 400;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .lab-report-by .by-name {
      display: inline-block;
      min-width: 120px;
      margin-left: 6px;
      border-bottom: 1px solid #6e8ccf;
      padding-bottom: 1px;
      text-transform: none;
    }
    .lab-watermark {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 0;
      opacity: 0.08;
    }
    .lab-watermark img {
      width: 320px;
      height: auto;
    }
    .lab-content {
      position: relative;
      z-index: 1;
      padding-bottom: 20mm;
    }
    .lab-page-no {
      position: absolute;
      right: 0;
      bottom: 1mm;
      font-size: 10pt;
    }
    .lab-page-no::before {
      content: counter(page);
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
        <th class="section-head" colspan="4">${escapeHtml(sectionTitle)}</th>
      </tr><tr>
        <th class="test-col-head"></th>
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

function renderLabRequestReportBody(items: LabOrderPrintItem[]): string {
  const grouped = groupLabOrderRowsByCategoryAndPanel(items);
  const parts: string[] = [];
  for (const { categoryName: catName, segments } of grouped) {
    for (const seg of segments) {
      const sectionTitle = seg.panelLabel ? `${catName}(${seg.panelLabel})` : catName;
      parts.push(`<h2 class="lab-report-section">${escapeHtml(sectionTitle)}</h2>`);
      parts.push(`<table class="lab-report-table"><thead><tr>
        <th class="section-head" colspan="4">${escapeHtml(sectionTitle)}</th>
      </tr><tr>
        <th class="test-col-head"></th>
        <th class="col-result">Result</th>
        <th class="col-unit">Units</th>
        <th class="col-range">Normal Range</th>
      </tr></thead><tbody>`);
      for (const r of seg.rows) {
        const unitShown = (r.unit ?? "").trim() || "—";
        const rangeShown = (r.normalRange ?? "").trim() || "—";
        parts.push(`<tr>
          <td class="col-test">${escapeHtml(r.testName)}</td>
          <td class="col-result">&nbsp;</td>
          <td class="col-unit">${escapeHtml(unitShown)}</td>
          <td class="col-range">${rangeShown === "—" ? "—" : escapeHtmlMultiline(rangeShown)}</td>
        </tr>`);
      }
      parts.push(`</tbody></table>`);
    }
  }
  return parts.join("\n");
}

function openLabClinicalReportWindow(
  title: string,
  reportTitle: string,
  payload: LabOrderPrintPayload,
  bodyInnerHtml: string
): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const dateStr = formatReceiptDateOnly(payload.documentDate);
  const reported =
    payload.reportedByName && payload.reportedByName.trim()
      ? escapeHtml(payload.reportedByName.trim())
      : "—";
  const orderNotesBlock =
    payload.orderNotes && String(payload.orderNotes).trim()
      ? `<div class="lab-report-order-notes"><strong>Order notes</strong> · ${escapeHtml(String(payload.orderNotes).trim())}</div>`
      : "";
  const logoSrc = `${window.location.origin}${RECEIPT_LOGO_PUBLIC_PATH}`;

  printWindow.document.open();
  printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${labClinicalReportCss()}</style>
</head>
<body>
  <div class="lab-report-doc">
    <div class="lab-watermark"><img src="${logoSrc}" alt="" width="140" height="140" /></div>
    <div class="lab-content">
    <div class="lab-header-logo"><img id="lab-header-logo-img" src="${logoSrc}" alt="Call a Doctor" width="140" height="140" /></div>
    <h1 class="lab-report-title">${escapeHtml(reportTitle)}</h1>
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
    ${bodyInnerHtml}
    <p class="lab-report-by">REPORTED BY:<span class="by-name">${reported}</span></p>
    <div class="lab-page-no" aria-hidden="true"></div>
    </div>
  </div>
</body>
</html>`);
  printWindow.document.close();

  const headerLogo = printWindow.document.getElementById("lab-header-logo-img") as HTMLImageElement | null;
  const startPrint = () => {
    printWindow.focus();
    printWindow.addEventListener(
      "afterprint",
      () => {
        printWindow.close();
      },
      { once: true }
    );
    printWindow.print();
  };

  if (headerLogo && !headerLogo.complete) {
    const timeoutId = window.setTimeout(startPrint, 600);
    headerLogo.addEventListener(
      "load",
      () => {
        window.clearTimeout(timeoutId);
        startPrint();
      },
      { once: true }
    );
    headerLogo.addEventListener(
      "error",
      () => {
        window.clearTimeout(timeoutId);
        startPrint();
      },
      { once: true }
    );
    return;
  }

  startPrint();
}

function openLabAnswerClinicalReportWindow(payload: LabOrderPrintPayload): void {
  const bodyInner = renderLabAnswerReportBody(payload.items);
  openLabClinicalReportWindow(
    `Laboratory report #${payload.orderId}`,
    "Laboratory report",
    payload,
    bodyInner
  );
}

export function printLabRequestSheet(payload: LabOrderPrintPayload): void {
  const bodyInner = renderLabRequestReportBody(payload.items);
  openLabClinicalReportWindow(
    `Laboratory request #${payload.orderId}`,
    "Laboratory request",
    payload,
    bodyInner
  );
}

export function printLabAnswerSheet(payload: LabOrderPrintPayload): void {
  openLabAnswerClinicalReportWindow(payload);
}
