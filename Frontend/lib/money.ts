/** PKR uses 2 decimal places. All comparisons and totals go through minor units (paisa). */
export const MONEY_DECIMALS = 2;
const MONEY_FACTOR = 10 ** MONEY_DECIMALS;

export function toMinorUnits(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * MONEY_FACTOR);
}

export function fromMinorUnits(minor: number): number {
  return minor / MONEY_FACTOR;
}

export function roundMoney(amount: number): number {
  return fromMinorUnits(toMinorUnits(amount));
}

/** Per-line total: unit price × qty, rounded to currency precision. */
export function lineTotal(unitPrice: number, quantity: number): number {
  return roundMoney(unitPrice * quantity);
}

export function sumMoney(...amounts: number[]): number {
  return fromMinorUnits(amounts.reduce((sum, amount) => sum + toMinorUnits(amount), 0));
}

export function subtractMoney(minuend: number, subtrahend: number): number {
  return fromMinorUnits(toMinorUnits(minuend) - toMinorUnits(subtrahend));
}

export function isMoneyLessThan(a: number, b: number): boolean {
  return toMinorUnits(a) < toMinorUnits(b);
}

export function moneyChange(tendered: number, payable: number): number {
  return Math.max(0, subtractMoney(tendered, payable));
}

export function formatMoneyFixed(amount: number): string {
  return roundMoney(amount).toFixed(MONEY_DECIMALS);
}

export function formatMoneyDisplay(value: number): string {
  const rounded = roundMoney(value);
  if (Number.isInteger(rounded)) {
    return rounded.toLocaleString();
  }
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: MONEY_DECIMALS,
  });
}
