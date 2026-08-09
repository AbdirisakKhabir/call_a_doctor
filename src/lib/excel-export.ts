import ExcelJS from "exceljs";

type CellValue = string | number | boolean | Date | null | undefined;

export type ExcelSheetInput = {
  name: string;
  /** Row objects; column headers are taken from the first row's keys (or `columns` when set). */
  rows: Record<string, CellValue>[];
  /** Explicit column order/headers. Defaults to Object.keys of the first row. */
  columns?: string[];
};

/**
 * Build an .xlsx workbook in the browser and trigger a download.
 * Used instead of the unmaintained community `xlsx` (SheetJS) package.
 */
export async function downloadExcelWorkbook(filename: string, sheets: ExcelSheetInput[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Call a Doctor";
  workbook.created = new Date();

  for (const sheet of sheets) {
    const safeName = sheet.name.replace(/[\\/*?[\]:]/g, "-").slice(0, 31) || "Sheet";
    const worksheet = workbook.addWorksheet(safeName);
    const columns =
      sheet.columns ??
      (sheet.rows[0] ? Object.keys(sheet.rows[0]) : []);

    if (columns.length === 0) continue;

    worksheet.columns = columns.map((header) => ({
      header,
      key: header,
      width: Math.min(40, Math.max(12, header.length + 2)),
    }));

    for (const row of sheet.rows) {
      worksheet.addRow(columns.map((key) => row[key] ?? ""));
    }

    worksheet.getRow(1).font = { bold: true };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
