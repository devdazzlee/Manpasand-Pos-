import { format } from "date-fns";

/**
 * Daily business report (dashboard "Export Report").
 *
 * Pure renderer: it receives a data snapshot and draws it — it never reads
 * React state or calls the API. The caller fetches fresh data for the chosen
 * scope first, so the PDF always matches the branch it is labelled with.
 *
 * Visual language matches the other Manpasand reports (gold / cream / ink).
 */

type RGB = [number, number, number];
const GOLD: RGB = [166, 124, 46];
const GOLD_SOFT: RGB = [245, 236, 218];
const INK: RGB = [42, 32, 18];
const MUTED: RGB = [120, 100, 72];
const CREAM: RGB = [252, 248, 242];
const LINE: RGB = [232, 220, 196];
const WHITE: RGB = [255, 255, 255];
const GREEN: RGB = [22, 128, 61];
const RED: RGB = [185, 28, 28];
const AMBER: RGB = [180, 83, 9];

export interface DashboardReportData {
  scope: { branchId: string | null; label: string };
  stats: {
    totalCustomers: number;
    newCustomersToday: number;
    lowStockCount: number;
    lowStockProducts: Array<{
      current_quantity: number;
      product: { name: string; sku: string };
      branch: { name: string } | null;
    }>;
    todaySales: Array<{
      sale_number: string;
      total_amount: string | number;
      status: string;
      created_at: string;
      branch: { name: string } | null;
    }>;
    todaySalesCount: number;
    todaySalesTotal: number;
    paymentBreakdown: Array<{ method: string; total: number; count: number }>;
    avgOrderValue: number;
    itemsSoldToday: number;
    discountToday: number;
    taxToday: number;
    todayRefundsCount?: number;
    todayRefundsTotal?: number;
    todayNetRevenue?: number;
  };
  topProducts: Array<{
    name: string;
    sku: string;
    category: string;
    quantity_sold: number;
    order_count: number;
    price: number;
    topBranch: { name: string } | null;
  }>;
  /** Window the top products were ranked over, e.g. "Last 30 days". */
  topProductsPeriod?: string;
  preparedBy?: string | null;
}

/** Rows beyond this are summarised so a busy day can't produce a 40-page PDF. */
const MAX_TABLE_ROWS = 60;

const money = (value: number | string) =>
  `Rs ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (value: number | string) =>
  Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const titleCase = (s: string) =>
  (s || "").toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const loadLogo = async (): Promise<{ data: string; aspect: number } | null> => {
  try {
    const res = await fetch("/logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
    if (!data) return null;
    const aspect = await new Promise<number>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth / img.naturalHeight || 2.6);
      img.onerror = () => resolve(2.6);
      img.src = data;
    });
    return { data, aspect };
  } catch {
    return null;
  }
};

type Col = { label: string; weight: number; right?: boolean };

export async function downloadDashboardReportPdf(input: DashboardReportData): Promise<string> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const usable = pageW - margin * 2;
  const bottom = pageH - 18;
  const generatedAt = new Date();
  const { stats, topProducts, scope } = input;
  const allBranches = !scope.branchId;
  const logo = await loadLogo();
  let y = 0;

  const setText = (color: RGB, size: number, style: "normal" | "bold" | "italic" = "normal") => {
    doc.setTextColor(...color);
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
  };
  const clip = (text: string, maxW: number) => {
    let value = text || "—";
    if (doc.getTextWidth(value) <= maxW) return value;
    while (value.length > 1 && doc.getTextWidth(`${value}…`) > maxW) value = value.slice(0, -1);
    return `${value}…`;
  };

  /* ------------------------------ page chrome ------------------------------ */

  const drawRunningHeader = () => {
    // Compact header for continuation pages.
    doc.setFillColor(...CREAM);
    doc.rect(0, 0, pageW, 14, "F");
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.6);
    doc.line(0, 14, pageW, 14);
    setText(INK, 9, "bold");
    doc.text("Daily Business Report", margin, 9);
    setText(MUTED, 8);
    doc.text(`${scope.label}  ·  ${format(generatedAt, "dd MMM yyyy")}`, pageW - margin, 9, { align: "right" });
    y = 22;
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > bottom) {
      doc.addPage();
      drawRunningHeader();
    }
  };

  /* --------------------------------- header -------------------------------- */

  const headerH = 40;
  doc.setFillColor(...CREAM);
  doc.rect(0, 0, pageW, headerH, "F");
  doc.setFillColor(...GOLD);
  doc.rect(0, headerH, pageW, 1.2, "F");

  let titleX = margin;
  if (logo) {
    const h = 16;
    const w = Math.min(h * logo.aspect, 44);
    try {
      doc.addImage(logo.data, "PNG", margin, (headerH - w / logo.aspect) / 2, w, w / logo.aspect);
      titleX = margin + w + 6;
    } catch {
      // logo is decorative — continue without it
    }
  }
  setText(GOLD, 8, "bold");
  doc.text("MANPASAND", titleX, 15);
  setText(INK, 17, "bold");
  doc.text("Daily Business Report", titleX, 23);
  setText(MUTED, 9);
  doc.text(format(generatedAt, "EEEE, dd MMMM yyyy"), titleX, 29.5);

  // Scope pill (top-right) — the single most important label on the page.
  setText(WHITE, 9, "bold");
  const pillText = scope.label.toUpperCase();
  const pillW = doc.getTextWidth(pillText) + 10;
  const pillX = pageW - margin - pillW;
  doc.setFillColor(...(allBranches ? INK : GOLD));
  doc.roundedRect(pillX, 11, pillW, 8, 4, 4, "F");
  doc.text(pillText, pillX + pillW / 2, 16.4, { align: "center" });
  setText(MUTED, 7.5);
  doc.text(allBranches ? "Scope: all branches combined" : "Scope: this branch only", pageW - margin, 25, { align: "right" });
  doc.text(`Generated ${format(generatedAt, "dd MMM yyyy, hh:mm a")}`, pageW - margin, 30, { align: "right" });
  if (input.preparedBy) doc.text(`Prepared by ${input.preparedBy}`, pageW - margin, 35, { align: "right" });

  y = headerH + 10;

  /* ------------------------------- KPI tiles ------------------------------- */

  const refunds = Number(stats.todayRefundsTotal || 0);
  const net = stats.todayNetRevenue ?? Number(stats.todaySalesTotal || 0) - refunds;
  const kpis: Array<{ label: string; value: string; sub: string; accent: RGB; hero?: boolean }> = [
    { label: "NET REVENUE", value: money(net), sub: "Sales minus refunds", accent: GREEN, hero: true },
    { label: "GROSS SALES", value: money(stats.todaySalesTotal), sub: `${stats.todaySalesCount} transactions`, accent: GOLD },
    { label: "REFUNDS", value: money(refunds), sub: `${stats.todayRefundsCount || 0} returns`, accent: RED },
    { label: "AVG ORDER", value: money(stats.avgOrderValue), sub: "Per transaction", accent: GOLD },
    { label: "ITEMS SOLD", value: qty(stats.itemsSoldToday), sub: "Units today", accent: GOLD },
    { label: "DISCOUNTS", value: money(stats.discountToday), sub: "Given today", accent: AMBER },
    { label: "CUSTOMERS", value: qty(stats.totalCustomers), sub: `+${stats.newCustomersToday} new today`, accent: GOLD },
    { label: "LOW STOCK", value: qty(stats.lowStockCount), sub: "Items need restock", accent: stats.lowStockCount ? RED : GREEN },
  ];
  const gap = 4;
  const tileW = (usable - gap * 3) / 4;
  const tileH = 21;
  kpis.forEach((k, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = margin + col * (tileW + gap);
    const ty = y + row * (tileH + gap);
    doc.setFillColor(...(k.hero ? GOLD_SOFT : WHITE));
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, ty, tileW, tileH, 2, 2, "FD");
    doc.setFillColor(...k.accent);
    doc.rect(x, ty + 2, 1.1, tileH - 4, "F");
    setText(MUTED, 6.6, "bold");
    doc.text(k.label, x + 4.5, ty + 6.5);
    setText(INK, 11.5, "bold");
    doc.text(clip(k.value, tileW - 7), x + 4.5, ty + 13.5);
    setText(MUTED, 6.8);
    doc.text(clip(k.sub, tileW - 7), x + 4.5, ty + 18);
  });
  y += tileH * 2 + gap + 10;

  /* --------------------------------- tables -------------------------------- */

  const sectionTitle = (title: string, meta?: string) => {
    ensureSpace(20);
    setText(INK, 11, "bold");
    doc.text(title, margin, y);
    if (meta) {
      setText(MUTED, 8);
      doc.text(meta, pageW - margin, y, { align: "right" });
    }
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.7);
    doc.line(margin, y + 2, margin + 12, y + 2);
    y += 6;
  };

  const table = (cols: Col[], rows: string[][], opts: { emptyText: string; totalRow?: string[] }) => {
    const weightSum = cols.reduce((s, c) => s + c.weight, 0);
    const widths = cols.map((c) => (c.weight / weightSum) * usable);
    const headH = 7;
    const rowH = 6.4;

    const head = () => {
      doc.setFillColor(...INK);
      doc.rect(margin, y, usable, headH, "F");
      setText(WHITE, 7, "bold");
      let x = margin;
      cols.forEach((c, i) => {
        doc.text(c.label.toUpperCase(), c.right ? x + widths[i] - 2.5 : x + 2.5, y + 4.7, c.right ? { align: "right" } : undefined);
        x += widths[i];
      });
      y += headH;
    };

    ensureSpace(headH + rowH * 2);
    head();

    if (!rows.length) {
      doc.setFillColor(...CREAM);
      doc.rect(margin, y, usable, 10, "F");
      setText(MUTED, 8, "italic");
      doc.text(opts.emptyText, pageW / 2, y + 6.2, { align: "center" });
      y += 18;
      return;
    }

    const shown = rows.slice(0, MAX_TABLE_ROWS);
    shown.forEach((row, ri) => {
      if (y + rowH > bottom) {
        doc.addPage();
        drawRunningHeader();
        head();
      }
      if (ri % 2 === 1) {
        doc.setFillColor(...CREAM);
        doc.rect(margin, y, usable, rowH, "F");
      }
      setText(INK, 7.4);
      let x = margin;
      row.forEach((cell, ci) => {
        const text = clip(String(cell ?? "—"), widths[ci] - 5);
        doc.text(text, cols[ci].right ? x + widths[ci] - 2.5 : x + 2.5, y + 4.3, cols[ci].right ? { align: "right" } : undefined);
        x += widths[ci];
      });
      y += rowH;
    });
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(margin, y, margin + usable, y);

    if (opts.totalRow) {
      if (y + rowH > bottom) {
        doc.addPage();
        drawRunningHeader();
      }
      doc.setFillColor(...GOLD_SOFT);
      doc.rect(margin, y, usable, rowH + 0.6, "F");
      setText(INK, 7.6, "bold");
      let x = margin;
      opts.totalRow.forEach((cell, ci) => {
        if (cell) doc.text(cell, cols[ci].right ? x + widths[ci] - 2.5 : x + 2.5, y + 4.6, cols[ci].right ? { align: "right" } : undefined);
        x += widths[ci];
      });
      y += rowH + 0.6;
    }
    if (rows.length > shown.length) {
      setText(MUTED, 7, "italic");
      doc.text(`+ ${rows.length - shown.length} more not shown — use Sales History for the full list.`, margin, y + 4.5);
      y += 6;
    }
    y += 9;
  };

  // Payment methods — with share-of-total bars.
  const payTotal = stats.paymentBreakdown.reduce((s, p) => s + Number(p.total || 0), 0);
  sectionTitle("Payment Methods", `${stats.todaySalesCount} sales`);
  if (!stats.paymentBreakdown.length) {
    doc.setFillColor(...CREAM);
    doc.setDrawColor(...LINE);
    doc.roundedRect(margin, y, usable, 11, 2, 2, "FD");
    setText(MUTED, 8, "italic");
    doc.text("No payments recorded today", pageW / 2, y + 6.8, { align: "center" });
    y += 19;
  } else {
    stats.paymentBreakdown.forEach((p) => {
      ensureSpace(11);
      const share = payTotal > 0 ? Number(p.total) / payTotal : 0;
      setText(INK, 8.5, "bold");
      doc.text(titleCase(p.method), margin, y + 3);
      setText(MUTED, 7.5);
      doc.text(`${p.count} transactions · ${Math.round(share * 100)}%`, margin + 34, y + 3);
      setText(INK, 8.5, "bold");
      doc.text(money(p.total), pageW - margin, y + 3, { align: "right" });
      doc.setFillColor(...LINE);
      doc.roundedRect(margin, y + 5, usable, 1.8, 0.9, 0.9, "F");
      if (share > 0) {
        doc.setFillColor(...GOLD);
        doc.roundedRect(margin, y + 5, Math.max(usable * share, 1.8), 1.8, 0.9, 0.9, "F");
      }
      y += 11;
    });
    y += 5;
  }

  // Today's sales — the full list behind the Gross Sales number.
  const saleCols: Col[] = [
    { label: "Sale #", weight: 1.3 },
    ...(allBranches ? [{ label: "Branch", weight: 1.3 }] : []),
    { label: "Time", weight: 0.8 },
    { label: "Status", weight: 0.9 },
    { label: "Amount", weight: 1.1, right: true },
  ];
  const saleRows = stats.todaySales.map((s) => [
    s.sale_number,
    ...(allBranches ? [s.branch?.name || "—"] : []),
    format(new Date(s.created_at), "hh:mm a"),
    titleCase(s.status),
    money(s.total_amount),
  ]);
  sectionTitle("Today's Sales", `${stats.todaySalesCount} transactions`);
  table(saleCols, saleRows, {
    emptyText: "No sales recorded today",
    totalRow: saleRows.length
      ? ["Total", ...(allBranches ? [""] : []), "", "", money(stats.todaySalesTotal)]
      : undefined,
  });

  // Top products.
  const topCols: Col[] = [
    { label: "#", weight: 0.35 },
    { label: "Product", weight: 2.4 },
    { label: "Category", weight: 1.2 },
    ...(allBranches ? [{ label: "Top branch", weight: 1.2 }] : []),
    { label: "Orders", weight: 0.7, right: true },
    { label: "Sold", weight: 0.7, right: true },
    { label: "Price", weight: 1, right: true },
  ];
  const topRows = topProducts.map((p, i) => [
    String(i + 1),
    p.name,
    p.category || "—",
    ...(allBranches ? [p.topBranch?.name || "—"] : []),
    qty(p.order_count),
    qty(p.quantity_sold),
    money(p.price),
  ]);
  sectionTitle("Top Selling Products", input.topProductsPeriod || "Last 30 days");
  table(topCols, topRows, { emptyText: "No product sales in this period" });

  // Low stock.
  const lowCols: Col[] = [
    { label: "Product", weight: 2.6 },
    { label: "SKU", weight: 1.2 },
    ...(allBranches ? [{ label: "Branch", weight: 1.3 }] : []),
    { label: "Qty left", weight: 0.8, right: true },
  ];
  const lowRows = stats.lowStockProducts.map((item) => [
    item.product.name,
    item.product.sku,
    ...(allBranches ? [item.branch?.name || "—"] : []),
    qty(item.current_quantity),
  ]);
  sectionTitle("Low Stock Alerts", `${stats.lowStockCount} items`);
  table(lowCols, lowRows, { emptyText: "All stock levels are healthy" });

  /* --------------------------------- footer -------------------------------- */

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
    setText(MUTED, 7);
    doc.text(`Manpasand · ${scope.label} · Confidential`, margin, pageH - 7.5);
    doc.text(`Page ${p} of ${pages}`, pageW - margin, pageH - 7.5, { align: "right" });
  }

  const scopeSlug = scope.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const filename = `manpasand-daily-report-${scopeSlug}-${format(generatedAt, "yyyy-MM-dd")}.pdf`;
  doc.save(filename);
  return filename;
}
