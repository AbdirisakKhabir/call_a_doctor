import JsBarcode from "jsbarcode";
import { escapeHtml } from "@/lib/patient-invoice-print";

/**
 * Opens a print-friendly window with a CODE128 barcode for shelf labels / POS.
 */
export function printProductBarcodeLabel(payload: {
  productName: string;
  code: string;
  branchName?: string;
}): void {
  const code = payload.code.trim();
  if (!code) return;

  const w = window.open("", "_blank");
  if (!w) return;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, code, {
      format: "CODE128",
      width: 2,
      height: 50,
      displayValue: true,
      fontSize: 14,
      margin: 10,
      background: "#ffffff",
    });
  } catch {
    w.close();
    window.alert("This barcode value cannot be encoded for printing.");
    return;
  }

  const svgHtml = svg.outerHTML;
  const title = escapeHtml(payload.productName);
  const codeEsc = escapeHtml(code);
  const branchLine = payload.branchName
    ? `<p class="branch">${escapeHtml(payload.branchName)}</p>`
    : "";

  w.document.write(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Barcode ${codeEsc}</title>
<style>
  @page { margin: 12mm; }
  body { font-family: system-ui, sans-serif; text-align: center; padding: 24px; color: #111; }
  h1 { font-size: 1rem; font-weight: 600; margin: 0 0 8px; max-width: 100%; word-break: break-word; }
  .branch { font-size: 0.85rem; color: #666; margin: 0 0 12px; }
  .code { font-family: ui-monospace, monospace; font-size: 0.9rem; color: #444; margin-top: 8px; }
  .barcode-wrap { display: inline-block; margin: 12px auto; }
  .hint { font-size: 11px; color: #888; margin-top: 16px; }
  @media print { body { padding: 8px; } }
</style></head><body>
  ${branchLine}
  <h1>${title}</h1>
  <div class="barcode-wrap">${svgHtml}</div>
  <p class="code">${codeEsc}</p>
  <p class="hint">CODE128 — scan at POS</p>
</body></html>`);
  w.document.close();
  w.focus();

  const runPrint = () => {
    w.print();
    w.addEventListener("afterprint", () => w.close(), { once: true });
  };

  if (w.document.readyState === "complete") {
    setTimeout(runPrint, 100);
  } else {
    w.addEventListener("load", () => setTimeout(runPrint, 100), { once: true });
  }
}
