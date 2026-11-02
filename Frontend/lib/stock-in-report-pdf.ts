/**
 * Stock In report PDF (from GET /purchases/export).
 * Three layouts:
 *  - bills:   every supplier bill with all its products, grouped by day
 *  - lines:   one row per product received (landscape register)
 *  - summary: totals per product for the period
 * Cells wrap instead of overflowing, and table headers repeat on every page.
 */
import { prepareLogoForPdf } from "@/lib/stock-in-receipt-pdf";

export type StockInExportLine = {
  id: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  code: string | null;
  barcode: string | null;
  unit: string | null;
  quantity: number;
  cost_price: number;
  sale_price: number;
  value: number;
};

export type StockInExportBill = {
  bill_group_id: string;
  anchor_id: string;
  purchase_date: string;
  created_at: string;
  invoice_ref: string | null;
  supplier: string;
  branch: string;
  recorded_by: string | null;
  delivery_status: string | null;
  payment_mode: "CASH" | "CREDIT" | "MIX" | null;
  paid_amount: number;
  credit_amount: number;
  line_count: number;
  quantity: number;
  value: number;
  lines: StockInExportLine[];
};

export type StockInReportLayout = "bills" | "lines" | "summary";

export type StockInReportOptions = {
  layout: StockInReportLayout;
  bills: StockInExportBill[];
  periodLabel: string;
  /** e.g. ["Supplier: Zubair Sakhar", "Branch: Bahadurabad"] */
  filterLabels?: string[];
  orderLabel: string;
  logoDataUri?: string;
  filename: string;
};

type Doc = InstanceType<typeof import("jspdf").jsPDF>;

type Column = {
  header: string;
  width: number; // weight
  align?: "left" | "right" | "center";
  bold?: boolean;
};

const INK: [number, number, number] = [15, 23, 42];
const MUTED: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [226, 232, 240];
const SOFT: [number, number, number] = [248, 250, 252];
const ACCENT: [number, number, number] = [5, 150, 105];

export function formatMoney(n: number) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatQty(n: number) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function billReference(bill: Pick<StockInExportBill, "invoice_ref" | "anchor_id">) {
  return (bill.invoice_ref || "").trim() || `SI-${bill.anchor_id.slice(0, 8).toUpperCase()}`;
}

export function paymentLabel(bill: StockInExportBill) {
  if (bill.payment_mode === "CASH") return "Paid (cash)";
  if (bill.payment_mode === "CREDIT") return "Credit";
  if (bill.payment_mode === "MIX") {
    return `Part paid ${formatMoney(bill.paid_amount)} · due ${formatMoney(bill.credit_amount)}`;
  }
  return "—";
}

/** Local calendar day, used to group bills by their business date. */
export function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

class ReportWriter {
  doc: Doc;
  pageW: number;
  pageH: number;
  margin = 12;
  y = 0;
  /** Redrawn after every page break while a table is open. */
  private repeatHeader: (() => void) | null = null;

  constructor(doc: Doc) {
    this.doc = doc;
    this.pageW = doc.internal.pageSize.getWidth();
    this.pageH = doc.internal.pageSize.getHeight();
    this.y = this.margin;
  }

  get usable() {
    return this.pageW - this.margin * 2;
  }

  get bottom() {
    return this.pageH - 14;
  }

  newPage() {
    this.doc.addPage();
    this.y = this.margin;
    this.repeatHeader?.();
  }

  ensure(height: number) {
    if (this.y + height > this.bottom) this.newPage();
  }

  setFont(size: number, style: "normal" | "bold" = "normal", color = INK) {
    this.doc.setFont("helvetica", style);
    this.doc.setFontSize(size);
    this.doc.setTextColor(color[0], color[1], color[2]);
  }

  widths(columns: Column[]) {
    const total = columns.reduce((s, c) => s + c.width, 0);
    return columns.map((c) => (c.width / total) * this.usable);
  }

  drawTableHeader(columns: Column[], fill = INK) {
    const widths = this.widths(columns);
    const h = 7;
    this.doc.setFillColor(fill[0], fill[1], fill[2]);
    this.doc.rect(this.margin, this.y, this.usable, h, "F");
    this.setFont(7, "bold", [255, 255, 255]);
    let x = this.margin;
    columns.forEach((c, i) => {
      this.cellText(c.header, x, widths[i], this.y + 4.7, c.align);
      x += widths[i];
    });
    this.y += h;
  }

  cellText(text: string | string[], x: number, w: number, y: number, align: Column["align"] = "left") {
    const pad = 1.8;
    if (align === "right") this.doc.text(text, x + w - pad, y, { align: "right" });
    else if (align === "center") this.doc.text(text, x + w / 2, y, { align: "center" });
    else this.doc.text(text, x + pad, y);
  }

  /** Starts a table: header now, and again at the top of every new page. */
  beginTable(columns: Column[], continuedLabel?: string) {
    this.drawTableHeader(columns);
    this.repeatHeader = () => {
      if (continuedLabel) {
        this.setFont(7, "bold", MUTED);
        this.doc.text(`${continuedLabel} (continued)`, this.margin, this.y + 3);
        this.y += 5;
      }
      this.drawTableHeader(columns);
    };
  }

  endTable() {
    this.repeatHeader = null;
  }

  /** One wrapped row; returns its height. */
  row(columns: Column[], cells: string[], opts: { zebra?: boolean; fill?: [number, number, number]; size?: number; bold?: boolean } = {}) {
    const widths = this.widths(columns);
    const size = opts.size ?? 7.5;
    const lineH = size * 0.42;
    this.doc.setFontSize(size);
    const wrapped = cells.map((cell, i) => this.doc.splitTextToSize(cell || "", widths[i] - 3.6) as string[]);
    const lines = Math.max(1, ...wrapped.map((w) => w.length));
    const h = Math.max(6.4, lines * lineH + 3.2);
    this.ensure(h);

    const fill = opts.fill ?? (opts.zebra ? SOFT : null);
    if (fill) {
      this.doc.setFillColor(fill[0], fill[1], fill[2]);
      this.doc.rect(this.margin, this.y, this.usable, h, "F");
    }
    this.doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    this.doc.setLineWidth(0.15);
    this.doc.line(this.margin, this.y + h, this.margin + this.usable, this.y + h);

    let x = this.margin;
    columns.forEach((c, i) => {
      this.setFont(size, opts.bold || c.bold ? "bold" : "normal", INK);
      this.cellText(wrapped[i], x, widths[i], this.y + 2.2 + lineH * 0.85, c.align);
      x += widths[i];
    });
    this.y += h;
    return h;
  }
}

async function drawReportHeader(
  w: ReportWriter,
  opts: StockInReportOptions,
  title: string,
) {
  const { doc, margin } = w;
  doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
  doc.rect(0, 0, w.pageW, 2.5, "F");
  let y = margin;

  let textX = margin;
  if (opts.logoDataUri) {
    try {
      const logo = await prepareLogoForPdf(opts.logoDataUri);
      const img = await loadImage(logo);
      const aspect = img.naturalWidth / img.naturalHeight || 1.6;
      let h = 16;
      let lw = h * aspect;
      if (lw > 40) {
        lw = 40;
        h = lw / aspect;
      }
      doc.addImage(logo, "PNG", margin, y, lw, h);
      textX = margin + lw + 5;
    } catch {
      // no logo
    }
  }

  w.setFont(14, "bold");
  doc.text("MANPASAND GENERAL STORE", textX, y + 6);
  w.setFont(10, "normal", [51, 65, 85]);
  doc.text(title, textX, y + 12);

  w.setFont(7.5, "normal", MUTED);
  doc.text(`Generated ${new Date().toLocaleString()}`, w.pageW - margin, y + 6, { align: "right" });
  doc.text(opts.orderLabel, w.pageW - margin, y + 11, { align: "right" });
  y += 21;

  // Period + filters strip
  doc.setFillColor(SOFT[0], SOFT[1], SOFT[2]);
  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  const filterText = (opts.filterLabels ?? []).join("   ·   ") || "All suppliers · All branches";
  doc.roundedRect(margin, y, w.usable, 11, 1.5, 1.5, "FD");
  w.setFont(6.5, "bold", MUTED);
  doc.text("PERIOD", margin + 3, y + 4.3);
  w.setFont(9, "bold");
  doc.text(opts.periodLabel, margin + 3, y + 8.6);
  w.setFont(7.5, "normal", [51, 65, 85]);
  doc.text(doc.splitTextToSize(filterText, w.usable * 0.55)[0] ?? "", w.pageW - margin - 3, y + 7, { align: "right" });
  y += 15;

  // Summary tiles
  const bills = opts.bills;
  const lineCount = bills.reduce((s, b) => s + b.line_count, 0);
  const qty = bills.reduce((s, b) => s + b.quantity, 0);
  const value = bills.reduce((s, b) => s + b.value, 0);
  const suppliers = new Set(bills.map((b) => b.supplier)).size;
  const tiles: [string, string][] = [
    ["Bills", bills.length.toLocaleString()],
    ["Product lines", lineCount.toLocaleString()],
    ["Suppliers", suppliers.toLocaleString()],
    ["Total quantity", formatQty(qty)],
    ["Total value (Rs)", formatMoney(value)],
  ];
  const gap = 3;
  const tileW = (w.usable - gap * (tiles.length - 1)) / tiles.length;
  tiles.forEach(([label, val], i) => {
    const x = margin + i * (tileW + gap);
    const isTotal = i === tiles.length - 1;
    if (isTotal) doc.setFillColor(INK[0], INK[1], INK[2]);
    else doc.setFillColor(255, 255, 255);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.roundedRect(x, y, tileW, 14, 1.5, 1.5, isTotal ? "F" : "FD");
    w.setFont(6.3, "bold", isTotal ? [203, 213, 225] : MUTED);
    doc.text(label.toUpperCase(), x + 3, y + 5);
    w.setFont(11, "bold", isTotal ? [255, 255, 255] : INK);
    doc.text(val, x + 3, y + 11);
  });
  w.y = y + 20;
}

function drawFooters(w: ReportWriter, label: string) {
  const { doc } = w;
  const count = doc.getNumberOfPages();
  for (let i = 1; i <= count; i++) {
    doc.setPage(i);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.2);
    doc.line(w.margin, w.pageH - 10, w.pageW - w.margin, w.pageH - 10);
    w.setFont(7, "normal", MUTED);
    doc.text(`MANPASAND POS · ${label}`, w.margin, w.pageH - 6);
    doc.text(`Page ${i} of ${count}`, w.pageW - w.margin, w.pageH - 6, { align: "right" });
  }
}

function drawGrandTotal(w: ReportWriter, bills: StockInExportBill[]) {
  const qty = bills.reduce((s, b) => s + b.quantity, 0);
  const value = bills.reduce((s, b) => s + b.value, 0);
  w.ensure(16);
  w.y += 3;
  const boxW = 88;
  const x = w.pageW - w.margin - boxW;
  w.doc.setFillColor(INK[0], INK[1], INK[2]);
  w.doc.roundedRect(x, w.y, boxW, 12, 1.5, 1.5, "F");
  w.setFont(8, "normal", [203, 213, 225]);
  w.doc.text(`${bills.length} bills · qty ${formatQty(qty)}`, x + 4, w.y + 7.6);
  w.setFont(10.5, "bold", [255, 255, 255]);
  w.doc.text(`Rs ${formatMoney(value)}`, x + boxW - 4, w.y + 7.8, { align: "right" });
  w.y += 16;
}

function drawBillsLayout(w: ReportWriter, bills: StockInExportBill[]) {
  const { doc, margin } = w;
  const columns: Column[] = [
    { header: "#", width: 0.45, align: "center" },
    { header: "Product", width: 3.6, bold: true },
    { header: "Code / Barcode", width: 1.7 },
    { header: "Unit", width: 0.8 },
    { header: "Qty", width: 0.9, align: "right" },
    { header: "Cost", width: 1.1, align: "right" },
    { header: "Total", width: 1.3, align: "right" },
  ];

  let currentDay = "";
  bills.forEach((bill, billIdx) => {
    const day = dayKey(bill.purchase_date);
    if (day !== currentDay) {
      currentDay = day;
      const dayBills = bills.filter((b) => dayKey(b.purchase_date) === day);
      const dayValue = dayBills.reduce((s, b) => s + b.value, 0);
      w.ensure(40);
      w.y += 2;
      w.setFont(10, "bold", ACCENT);
      doc.text(dayLabel(bill.purchase_date), margin, w.y + 4);
      w.setFont(8, "normal", MUTED);
      doc.text(
        `${dayBills.length} ${dayBills.length === 1 ? "bill" : "bills"} · Rs ${formatMoney(dayValue)}`,
        w.pageW - margin,
        w.y + 4,
        { align: "right" },
      );
      doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
      doc.setLineWidth(0.4);
      doc.line(margin, w.y + 6, w.pageW - margin, w.y + 6);
      w.y += 9;
    }

    // Keep the bill heading with its table header and first product.
    w.ensure(16 + 7 + 7);
    const ref = billReference(bill);
    doc.setFillColor(SOFT[0], SOFT[1], SOFT[2]);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.2);
    doc.roundedRect(margin, w.y, w.usable, 14, 1.2, 1.2, "FD");
    w.setFont(9, "bold");
    doc.text(`${billIdx + 1}. ${bill.supplier}`, margin + 3, w.y + 5.2);
    w.setFont(9, "bold");
    doc.text(`Rs ${formatMoney(bill.value)}`, w.pageW - margin - 3, w.y + 5.2, { align: "right" });
    w.setFont(7.2, "normal", [71, 85, 105]);
    const meta = [
      `${shortDate(bill.purchase_date)} ${timeLabel(bill.purchase_date)}`,
      `Invoice: ${ref}`,
      `Branch: ${bill.branch}`,
      `Payment: ${paymentLabel(bill)}`,
      `Status: ${(bill.delivery_status || "COMPLETE").toUpperCase()}`,
    ].join("   ·   ");
    doc.text(doc.splitTextToSize(meta, w.usable - 6)[0] ?? "", margin + 3, w.y + 10.8);
    w.y += 15.5;

    w.beginTable(columns, `${billIdx + 1}. ${bill.supplier}`);
    bill.lines.forEach((line, i) => {
      w.row(
        columns,
        [
          String(i + 1),
          line.product_name,
          line.code || line.barcode || "—",
          line.unit || "—",
          formatQty(line.quantity),
          formatMoney(line.cost_price),
          formatMoney(line.value),
        ],
        { zebra: i % 2 === 1 },
      );
    });
    w.row(
      columns,
      [
        "",
        `Bill total · ${bill.line_count} ${bill.line_count === 1 ? "product" : "products"}`,
        "",
        "",
        formatQty(bill.quantity),
        "",
        formatMoney(bill.value),
      ],
      { fill: [236, 253, 245], bold: true },
    );
    w.endTable();
    w.y += 5;
  });

  drawGrandTotal(w, bills);
}

function drawLinesLayout(w: ReportWriter, bills: StockInExportBill[]) {
  const columns: Column[] = [
    { header: "#", width: 0.5, align: "center" },
    { header: "Date", width: 1.35 },
    { header: "Invoice", width: 1.3 },
    { header: "Supplier", width: 1.8 },
    { header: "Branch", width: 1.3 },
    { header: "Product", width: 3.2, bold: true },
    { header: "Code", width: 1.3 },
    { header: "Unit", width: 0.7 },
    { header: "Qty", width: 0.8, align: "right" },
    { header: "Cost", width: 0.95, align: "right" },
    { header: "Value", width: 1.1, align: "right" },
  ];
  w.beginTable(columns);
  let n = 0;
  bills.forEach((bill) => {
    const ref = billReference(bill);
    bill.lines.forEach((line) => {
      n += 1;
      w.row(
        columns,
        [
          String(n),
          `${shortDate(bill.purchase_date)}\n${timeLabel(bill.purchase_date)}`,
          ref,
          bill.supplier,
          bill.branch,
          line.product_name,
          line.code || line.barcode || "—",
          line.unit || "—",
          formatQty(line.quantity),
          formatMoney(line.cost_price),
          formatMoney(line.value),
        ],
        { zebra: n % 2 === 0, size: 7 },
      );
    });
  });
  const qty = bills.reduce((s, b) => s + b.quantity, 0);
  const value = bills.reduce((s, b) => s + b.value, 0);
  w.row(
    columns,
    ["", "", "", "", "", `Total · ${n} lines`, "", "", formatQty(qty), "", formatMoney(value)],
    { fill: [236, 253, 245], bold: true, size: 7.5 },
  );
  w.endTable();
}

export function summarizeByProduct(bills: StockInExportBill[]) {
  const map = new Map<
    string,
    { name: string; code: string; unit: string; bills: Set<string>; qty: number; value: number; lastCost: number }
  >();
  bills.forEach((bill) =>
    bill.lines.forEach((line) => {
      const key = line.product_id;
      const row =
        map.get(key) ||
        { name: line.product_name, code: line.code || line.barcode || "—", unit: line.unit || "—", bills: new Set<string>(), qty: 0, value: 0, lastCost: 0 };
      row.bills.add(bill.bill_group_id);
      row.qty += line.quantity;
      row.value += line.value;
      row.lastCost = line.cost_price;
      map.set(key, row);
    }),
  );
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function drawSummaryLayout(w: ReportWriter, bills: StockInExportBill[]) {
  const columns: Column[] = [
    { header: "#", width: 0.45, align: "center" },
    { header: "Product", width: 3.4, bold: true },
    { header: "Code", width: 1.3 },
    { header: "Unit", width: 0.75 },
    { header: "Bills", width: 0.65, align: "right" },
    { header: "Qty received", width: 1.1, align: "right" },
    { header: "Avg cost", width: 1, align: "right" },
    { header: "Value", width: 1.2, align: "right" },
  ];
  const rows = summarizeByProduct(bills);
  w.beginTable(columns);
  rows.forEach((r, i) => {
    w.row(
      columns,
      [
        String(i + 1),
        r.name,
        r.code,
        r.unit,
        String(r.bills.size),
        formatQty(r.qty),
        formatMoney(r.qty > 0 ? r.value / r.qty : 0),
        formatMoney(r.value),
      ],
      { zebra: i % 2 === 1 },
    );
  });
  const qty = rows.reduce((s, r) => s + r.qty, 0);
  const value = rows.reduce((s, r) => s + r.value, 0);
  w.row(
    columns,
    ["", `Total · ${rows.length} products`, "", "", "", formatQty(qty), "", formatMoney(value)],
    { fill: [236, 253, 245], bold: true },
  );
  w.endTable();
}

const TITLES: Record<StockInReportLayout, string> = {
  bills: "Stock In Report · Bill-wise detail",
  lines: "Stock In Register · Product lines",
  summary: "Stock In Summary · By product",
};

export async function downloadStockInReportPdf(opts: StockInReportOptions): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: opts.layout === "lines" ? "landscape" : "portrait",
  });
  const w = new ReportWriter(doc);
  await drawReportHeader(w, opts, TITLES[opts.layout]);

  if (opts.bills.length === 0) {
    w.setFont(10, "normal", MUTED);
    doc.text("No Stock In found for this period.", w.pageW / 2, w.y + 20, { align: "center" });
  } else if (opts.layout === "bills") {
    drawBillsLayout(w, opts.bills);
  } else if (opts.layout === "lines") {
    drawLinesLayout(w, opts.bills);
  } else {
    drawSummaryLayout(w, opts.bills);
  }

  drawFooters(w, TITLES[opts.layout]);
  doc.save(opts.filename.endsWith(".pdf") ? opts.filename : `${opts.filename}.pdf`);
}
