/** Sale receipt footer — keep in sync with Frontend/config/constants.ts */
export const RECEIPT_EXCHANGE_POLICY_TITLE = 'EXCHANGE POLICY';
// Manpasand prints no exchange policy; add lines here to show one on receipts.
export const RECEIPT_EXCHANGE_POLICY_LINES: readonly string[] = [];

export function shouldPrintReceiptExchangePolicy(receiptData: {
  documentTitle?: string | null;
}): boolean {
  return RECEIPT_EXCHANGE_POLICY_LINES.length > 0 && !receiptData.documentTitle?.trim();
}
