import { format } from "date-fns";
import apiClient from "@/lib/apiClient";
import { printReceiptViaServer, type Printer, type ReceiptData } from "@/lib/print-server";

/** Figures for a register's closing slip, as returned by the API. */
export interface ClosingSlip {
  sessionId: string;
  status: "OPEN" | "CLOSED";
  branch: { id: string; name: string; code?: string | null } | null;
  businessDate: string;
  openedAt: string;
  closedAt: string | null;
  closedBy: string | null;
  autoClosed: boolean;
  bills: number;
  netSales: number;
  cashRevenue: number;
  cardRevenue: number;
  bankRevenue: number;
  walletRevenue: number;
  expenses: { particular: string; amount: number; method: string; kind: string }[];
  totalExpense: number;
  cashExpense: number;
  cashInHand: number;
  cashInBank: number;
  /** System cash that should be in the drawer at close. */
  expectedCash: number;
  /** Cash amount typed when closing the register. */
  countedCash: number | null;
  /** Counted − expected (positive = over, negative = short). Null if not counted. */
  cashDifference: number | null;
}

export async function fetchClosingSlip(sessionId: string): Promise<ClosingSlip> {
  const res = await apiClient.get(`/cash-register/sessions/${sessionId}/closing-slip`);
  return res.data?.data as ClosingSlip;
}

const pkr = (n: number) =>
  `PKR ${Number(n || 0).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const METHOD_SHORT: Record<string, string> = {
  CASH: "",
  CARD: "Card",
  BANK: "Bank",
  BANK_TRANSFER: "Bank",
  CHEQUE: "Cheque",
  MOBILE_MONEY: "Wallet",
};

/**
 * Closing slip in the print server's receipt format.
 *
 * Prints with the new "report" layout (logo, title, label/value rows). The
 * items / summaryLines fields are filled too, so a shop laptop still running
 * an older print server prints the same figures inside the sale-receipt frame.
 */
export function buildClosingReceipt(slip: ClosingSlip): ReceiptData {
  const closedAt = slip.closedAt ? new Date(slip.closedAt) : new Date();
  const branchName = slip.branch?.name || "Branch";
  const slipNo = `CLOSE-${format(new Date(`${slip.businessDate}T00:00:00`), "yyyyMMdd")}-${(slip.branch?.code || branchName).replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase()}`;

  const expenseRows = slip.expenses.map((e) => {
    const tag = METHOD_SHORT[e.method] ?? e.method;
    return { label: tag ? `${e.particular} (${tag})` : e.particular, value: pkr(e.amount) };
  });

  const revenueRows = [
    { label: "Total Cash Revenue", value: pkr(slip.cashRevenue) },
    { label: "Total Card Revenue", value: pkr(slip.cardRevenue) },
    { label: "Total Bank Revenue", value: pkr(slip.bankRevenue) },
    ...(Math.abs(slip.walletRevenue) > 0.004
      ? [{ label: "Wallet Revenue (JazzCash / Easypaisa)", value: pkr(slip.walletRevenue) }]
      : []),
  ];

  const expectedCash = Number(slip.expectedCash ?? slip.cashInHand ?? 0);
  const countedCash = slip.countedCash == null ? null : Number(slip.countedCash);
  const cashDifference =
    slip.cashDifference != null
      ? Number(slip.cashDifference)
      : countedCash == null
        ? null
        : countedCash - expectedCash;
  const differenceLabel =
    cashDifference == null
      ? null
      : Math.abs(cashDifference) < 0.005
        ? "Difference (Match)"
        : cashDifference > 0
          ? "Difference (Over)"
          : "Difference (Short)";

  const summaryLines = [
    { label: "Total Expense", value: pkr(slip.totalExpense) },
    { label: "Cash In Hand", value: pkr(slip.cashInHand), emphasis: true },
    { label: "Cash In Bank", value: pkr(slip.cashInBank), emphasis: true },
    { label: "Expected Cash", value: pkr(expectedCash), emphasis: true },
    {
      label: "Counted Cash",
      value: countedCash == null ? "Not counted" : pkr(countedCash),
      emphasis: true,
    },
    ...(differenceLabel != null && cashDifference != null
      ? [
          {
            label: differenceLabel,
            value: pkr(Math.abs(cashDifference)),
            emphasis: true,
          },
        ]
      : []),
  ];

  return {
    layout: "report",
    // No store logo / Karachi line / contact footer on closing slips (print server skips brand chrome for layout:"report").
    storeName: "",
    address: "",
    documentTitle: slip.status === "CLOSED" ? "REGISTER CLOSING" : "REGISTER SUMMARY (OPEN)",
    transactionId: slipNo,
    timestamp: closedAt.toISOString(),
    metaLines: [
      { label: "Date", value: format(new Date(`${slip.businessDate}T00:00:00`), "dd MMM yyyy") },
      { label: "Branch", value: branchName },
      {
        label: slip.status === "CLOSED" ? "Closing Time" : "Printed At",
        // Time only — date is already on the Date line above.
        value: format(closedAt, "hh:mm a"),
      },
      {
        label: "Closed By",
        value: slip.autoClosed ? "Auto (7:55 AM)" : slip.closedBy ? slip.closedBy.split("@")[0] : "—",
      },
      { label: "Bills", value: String(slip.bills) },
    ],
    reportSections: [
      { title: "REVENUE", rows: revenueRows },
      { title: "EXPENSES", rows: expenseRows, emptyText: "No expenses" },
    ],
    summaryLines,
    thankYouMessage: slip.autoClosed
      ? "Auto-closed: cash not counted. Manager to review."
      : "Register closed",
    // --- fallback for print servers without the "report" layout ---
    customerType: branchName,
    items: [],
    itemSections: [
      { title: "REVENUE", items: revenueRows.map((r) => ({ name: r.label, quantity: 1, price: 0, lineTotal: Number(r.value.replace(/[^0-9.-]/g, "")) })) },
      {
        title: "EXPENSES",
        items: slip.expenses.map((e) => ({ name: e.particular, quantity: 1, price: e.amount, lineTotal: e.amount })),
      },
    ],
    subtotal: 0,
  };
}

/** Fetch the slip and send it to the receipt printer. Throws with a readable message on failure. */
export async function printClosingSlip(sessionId: string, printer: Printer | null): Promise<void> {
  if (!printer?.name) throw new Error("No receipt printer selected. Choose one in Printer Settings.");
  const slip = await fetchClosingSlip(sessionId);
  const result = await printReceiptViaServer(
    { ...printer, columns: printer.columns || { fontA: 48, fontB: 64 } },
    buildClosingReceipt(slip),
    { copies: 1, cut: true, openDrawer: false },
  );
  if (!result.success) throw new Error(result.error || "Printer did not respond");
}
