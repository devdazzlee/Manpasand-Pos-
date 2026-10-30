/** Shared money formatting for financial report screens (no PKR prefix). */

export const money = (value: number) =>
  Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Compact Lac / Crore label (1 Lac = 1,00,000 · 1 Cr = 1,00,00,000). */
export const moneyScale = (value: number): string | null => {
  const n = Math.abs(Number(value || 0));
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `${(n / 100_000).toFixed(2)} Lac`;
  return null;
};

export const moneyWithScale = (value: number) => {
  const scale = moneyScale(value);
  return scale ? `${money(value)} (≈ ${scale})` : money(value);
};

export const moneyOrDash = (value: number) => (Math.abs(value) < 0.005 ? "—" : money(value));

export const signedMoney = (value: number) => {
  const abs = money(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
};
