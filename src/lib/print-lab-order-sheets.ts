import {
  receiptLogoImgHtml,
  formatReceiptDateOnly,
  pharmacyA5PosReceiptStyles,
  receiptPrintMastheadExtraLinesHtml,
  receiptPrintA5FooterContactHtml,
} from "@/lib/receipt-print-theme";
import { groupLabOrderRowsByCategoryAndPanel } from "@/lib/lab-order-group";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  items: LabOrderPrintItem[];
};

function renderCategoryBlocks(
  items: LabOrderPrintItem[],
  mode: "request" | "answer"
): string {
  const grouped = groupLabOrderRowsByCategoryAndPanel(items);
  const parts: string[] = [];
  for (const { categoryName: catName, segments } of grouped) {
    parts.push(`<h2 class="lab-section-h2">${escapeHtml(catName)}</h2>`);
    for (const seg of segments) {
      if (seg.panelLabel) {
        parts.push(`<p class="lab-panel-label">Panel: ${escapeHtml(seg.panelLabel)}</p>`);
      }
      if (mode === "request") {
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
      } else {
        parts.push(`<table class="lab-sheet-table lab-answer"><thead><tr>
          <th>#</th><th>Test</th><th>Normal</th><th>Unit</th><th>Result</th><th>R. unit</th><th>Notes</th>
        </tr></thead><tbody>`);
        for (const r of seg.rows) {
          parts.push(`<tr>
            <td class="num">${r.lineNo}</td>
            <td>${escapeHtml(r.testName)}</td>
            <td class="muted small">${escapeHtml(r.normalRange)}</td>
            <td class="small">${escapeHtml(r.unit)}</td>
            <td class="write-cell">${escapeHtml(r.resultValue ?? "")}</td>
            <td class="write-cell small">${escapeHtml(r.resultUnit ?? "")}</td>
            <td class="write-cell small">${escapeHtml(r.notes ?? "")}</td>
          </tr>`);
        }
        parts.push(`</tbody></table>`);
      }
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
      ${receiptPrintA5FooterContactHtml(branchLine1)}
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

export function printLabRequestSheet(payload: LabOrderPrintPayload): void {
  const blocks = renderCategoryBlocks(payload.items, "request");
  openLabSheetPrintWindow(`Lab request #${payload.orderId}`, "Lab request", payload, blocks, {
    minimalFooterAndMeta: true,
  });
}

export function printLabAnswerSheet(payload: LabOrderPrintPayload): void {
  const blocks = renderCategoryBlocks(payload.items, "answer");
  openLabSheetPrintWindow(`Lab answer #${payload.orderId}`, "Lab answer sheet", payload, blocks, {
    minimalFooterAndMeta: true,
  });
}
