/**
 * Shared brand, logo loading, and print CSS for receipt-style documents
 * (sale receipt, purchase receipt, client invoice, care file statement).
 */

export const RECEIPT_LOGO_PUBLIC_PATH = "/logo/call-a-doctor.png";

/** Brand palette (matches globals.css brand-900 / brand-50). */
export const RECEIPT_BRAND = "#2b5532";
export const RECEIPT_BRAND_TINT = "#e3f5e7";

/** Call center short code — shown on printed invoices and receipts. */
export const CLINIC_CALL_CENTER = "3250";

/** Merchant / wallet numbers for client payments (receipts and invoices). */
export const CLINIC_MERCHANT_NUMBERS: ReadonlyArray<{ label: string; number: string }> = [
  { label: "Zaad", number: "454299" },
  { label: "Edahab", number: "718509" },
  { label: "Premier wallet", number: "119413" },
];

/** Clinic contact numbers (receipts and invoices). */
export const CLINIC_CONTACT_NUMBERS: ReadonlyArray<{ label: string; number: string }> = [
  { label: "Call 1", number: "0637980007" },
  { label: "Call 2", number: "0638239366" },
  { label: "Main WhatsApp", number: "0637833687" },
];

/** Lines under branch name on A5 POS-style receipts (uses `.company-line`). */
export function receiptPrintMastheadExtraLinesHtml(): string {
  return `<p class="company-line">Call center: ${CLINIC_CALL_CENTER}</p>`;
}

/**
 * Footer contact block for A5 receipts (`.contact-block` / `.contact-title` styles).
 * @param branchLineEscaped Branch or location line, already HTML-escaped.
 */
export function receiptPrintA5FooterContactHtml(branchLineEscaped: string): string {
  const merchants = CLINIC_MERCHANT_NUMBERS.map(
    (m) => `<p>${m.label}: <strong>${m.number}</strong></p>`
  ).join("");
  const contacts = CLINIC_CONTACT_NUMBERS.map(
    (c) => `<p>${c.label}: <strong>${c.number}</strong></p>`
  ).join("");
  return `
      <div class="contact-block">
        <p class="contact-title">Merchant payment numbers</p>
        ${merchants}
        <p class="contact-title" style="margin-top:10px">Contact</p>
        ${contacts}
        <p class="contact-title" style="margin-top:10px">Location</p>
        <p>Call a Doctor — ${branchLineEscaped}</p>
      </div>`;
}

/**
 * Contact and payment lines for A4-style invoices (`.footer-note` / `.contact-title`).
 */
export function invoicePrintFooterContactHtml(): string {
  const merchants = CLINIC_MERCHANT_NUMBERS.map(
    (m) => `<p>${m.label}: <strong>${m.number}</strong></p>`
  ).join("");
  const contacts = CLINIC_CONTACT_NUMBERS.map(
    (c) => `<p>${c.label}: <strong>${c.number}</strong></p>`
  ).join("");
  return `
      <p class="contact-title">Call center: ${CLINIC_CALL_CENTER}</p>
      <p class="contact-title" style="margin-top:10px">Merchant payment numbers</p>
      ${merchants}
      <p class="contact-title" style="margin-top:10px">Contact</p>
      ${contacts}`;
}

/** Day/month/year for document headers (e.g. 28/4/2026). */
export function formatReceiptDateOnly(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

export function getReceiptLogoAbsoluteUrl(): string {
  if (typeof window === "undefined") return RECEIPT_LOGO_PUBLIC_PATH;
  return `${window.location.origin}${RECEIPT_LOGO_PUBLIC_PATH}`;
}

export async function fetchReceiptLogoAsDataUrl(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(`${window.location.origin}${RECEIPT_LOGO_PUBLIC_PATH}`, {
      credentials: "same-origin",
      cache: "force-cache",
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onloadend = () => resolve(typeof fr.result === "string" ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Logo <img> inner HTML for print windows (data URL preferred). */
export function receiptLogoImgHtml(logoDataUrl: string | null, width = 120, height = 120): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const fallback = origin ? `${origin}${RECEIPT_LOGO_PUBLIC_PATH}` : RECEIPT_LOGO_PUBLIC_PATH;
  return logoDataUrl
    ? `<img src="${logoDataUrl}" alt="" width="${width}" height="${height}" />`
    : `<img src="${fallback}" alt="" width="${width}" height="${height}" />`;
}

/**
 * A4-friendly styles aligned with the pharmacy receipt template (brand header rows, masthead).
 */
export function clientInvoiceDocumentStyles(): string {
  return `
    @page {
      size: A4 portrait;
      margin: 12mm 14mm 14mm 14mm;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    :root {
      --brand: ${RECEIPT_BRAND};
      --brand-tint: ${RECEIPT_BRAND_TINT};
    }
    body {
      font-family: Arial, Helvetica, "Liberation Sans", sans-serif;
      font-size: 9.5pt;
      line-height: 1.45;
      color: #101828;
    }
    .doc-wrap {
      max-width: 180mm;
      margin: 0 auto;
    }
    .top-header {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px 16px;
      align-items: start;
      padding-bottom: 14px;
      border-bottom: 2px solid var(--brand);
      margin-bottom: 16px;
    }
    .company-name {
      margin: 0 0 4px 0;
      font-size: 12pt;
      font-weight: 700;
      color: var(--brand);
    }
    .company-line {
      margin: 0 0 2px 0;
      font-size: 8.5pt;
      color: #344054;
    }
    .logo-box {
      width: 34mm;
      min-height: 28mm;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      background: transparent;
    }
    .logo-box img {
      max-width: 120px;
      max-height: 120px;
      width: auto;
      height: auto;
      object-fit: contain;
    }
    .title-band {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 16px;
    }
    .receipt-title {
      margin: 0;
      font-size: 16pt;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--brand);
      text-transform: uppercase;
    }
    .meta-bits {
      text-align: right;
      font-size: 9pt;
      color: #101828;
    }
    .meta-bits div { margin-bottom: 3px; }
    .meta-bits .lbl {
      font-weight: 600;
      color: var(--brand);
      margin-right: 6px;
    }
    h2.section {
      margin: 18px 0 8px 0;
      font-size: 10pt;
      font-weight: 700;
      color: var(--brand);
    }
    table.inv {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      margin-bottom: 4px;
    }
    table.inv thead th {
      text-align: left;
      font-weight: 700;
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: #ffffff;
      background: var(--brand);
      padding: 8px 6px;
      border: none;
    }
    table.inv thead th.num { text-align: right; }
    table.inv td {
      padding: 7px 6px;
      border-bottom: 1px solid #e4e7ec;
      vertical-align: top;
    }
    table.inv td.num {
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    table.inv tbody tr:last-child td { border-bottom: none; }
    .muted { color: #667085; font-size: 8.5pt; }
    .summary-box {
      margin-top: 16px;
      padding: 12px 14px;
      background: var(--brand-tint);
      border-top: 2px solid var(--brand);
      border-bottom: 2px solid var(--brand);
      font-size: 10.5pt;
      font-weight: 700;
      color: var(--brand);
    }
    .footer-note {
      margin-top: 20px;
      padding-top: 12px;
      border-top: 1px solid #e4e7ec;
      font-size: 8.5pt;
      color: #475467;
      line-height: 1.5;
    }
    .footer-note .contact-title {
      font-weight: 700;
      color: var(--brand);
      margin-bottom: 4px;
    }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  `;
}

/** A5 portrait POS-style receipt (sale receipt, purchase receipt): shared layout and table styles. */
export function pharmacyA5PosReceiptStyles(): string {
  return `
    @page {
      size: A5 portrait;
      margin: 10mm 12mm 12mm 12mm;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    :root {
      --brand: ${RECEIPT_BRAND};
      --brand-tint: ${RECEIPT_BRAND_TINT};
    }
    body {
      font-family: Arial, Helvetica, "Liberation Sans", sans-serif;
      font-size: 9.5pt;
      line-height: 1.45;
      color: #101828;
    }
    .sheet {
      max-width: 124mm;
      margin: 0 auto;
      min-height: 186mm;
      display: flex;
      flex-direction: column;
    }
    .top-header {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px 16px;
      align-items: start;
      padding-bottom: 14px;
      border-bottom: 2px solid var(--brand);
      margin-bottom: 14px;
    }
    .company-name {
      margin: 0 0 4px 0;
      font-size: 12pt;
      font-weight: 700;
      color: var(--brand);
    }
    .company-line {
      margin: 0 0 2px 0;
      font-size: 8.5pt;
      color: #344054;
    }
    .logo-box {
      width: 34mm;
      min-height: 32mm;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px;
      background: transparent;
    }
    .logo-box img {
      max-width: 120px;
      max-height: 120px;
      width: auto;
      height: auto;
      object-fit: contain;
    }
    .title-band {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 16px;
    }
    .title-right {
      text-align: right;
    }
    .receipt-title {
      margin: 0 0 8px 0;
      font-size: 18pt;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--brand);
      text-transform: uppercase;
    }
    .meta-lines {
      font-size: 9pt;
      color: #101828;
    }
    .meta-lines div {
      margin-bottom: 3px;
    }
    .meta-lines .lbl {
      font-weight: 600;
      color: var(--brand);
      margin-right: 6px;
    }
    .billed {
      margin-bottom: 14px;
    }
    .billed h2 {
      margin: 0 0 6px 0;
      font-size: 10pt;
      font-weight: 700;
      color: var(--brand);
    }
    .billed-name {
      margin: 0 0 3px 0;
      font-size: 9.5pt;
      font-weight: 600;
      color: #101828;
    }
    .billed-extra {
      margin: 0;
      font-size: 8.5pt;
      color: #475467;
    }
    table.items {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      margin-bottom: 0;
    }
    table.items thead th {
      text-align: left;
      font-weight: 700;
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: #ffffff;
      background: var(--brand);
      padding: 8px 6px;
      border: none;
    }
    table.items thead th.num {
      text-align: right;
    }
    table.items td {
      padding: 8px 6px;
      border-bottom: 1px solid #e4e7ec;
      vertical-align: top;
    }
    table.items td.qty {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    table.items td.desc {
      color: #101828;
    }
    table.items td.num {
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    table.items td.strong {
      font-weight: 700;
    }
    table.items tbody tr:last-child td {
      border-bottom: none;
    }
    .table-rule {
      height: 2px;
      background: var(--brand);
      margin: 0 0 10px 0;
    }
    .totals {
      margin-left: auto;
      width: 72%;
      max-width: 240px;
      font-size: 9.5pt;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 5px 0;
      gap: 12px;
      color: #101828;
    }
    .totals-row .lbl {
      color: #344054;
    }
    .totals-grand {
      margin-top: 4px;
      padding: 10px 12px;
      background: var(--brand-tint);
      border-top: 2px solid var(--brand);
      border-bottom: 2px solid var(--brand);
      font-weight: 700;
      font-size: 10.5pt;
      color: var(--brand);
    }
    .totals-grand .lbl {
      font-weight: 700;
      color: var(--brand);
    }
    .footer-spacer {
      flex: 1;
      min-height: 8mm;
    }
    .footer {
      margin-top: auto;
      padding-top: 14px;
      border-top: 1px solid #e4e7ec;
    }
    .notes-heading {
      margin: 0 0 6px 0;
      font-size: 9.5pt;
      font-weight: 700;
      color: var(--brand);
    }
    .notes-body {
      margin: 0 0 10px 0;
      font-size: 8.5pt;
      line-height: 1.5;
      color: #475467;
    }
    .contact-block {
      font-size: 8.5pt;
      color: #344054;
      line-height: 1.5;
    }
    .contact-block .contact-title {
      margin: 0 0 4px 0;
      font-weight: 700;
      color: var(--brand);
    }
    .contact-block p {
      margin: 0 0 2px 0;
    }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  `;
}
