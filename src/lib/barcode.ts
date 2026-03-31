/** Suggested unique barcode value for new products (stored in `Product.code`). */
export function suggestBarcodeValue(): string {
  const t = Date.now().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const r = Math.floor(Math.random() * 1e6)
    .toString()
    .padStart(6, "0");
  return `B${t}${r}`.slice(0, 24);
}
