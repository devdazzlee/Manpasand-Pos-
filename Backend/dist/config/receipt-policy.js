"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECEIPT_EXCHANGE_POLICY_LINES = exports.RECEIPT_EXCHANGE_POLICY_TITLE = void 0;
exports.shouldPrintReceiptExchangePolicy = shouldPrintReceiptExchangePolicy;
/** Sale receipt footer — keep in sync with Frontend/config/constants.ts */
exports.RECEIPT_EXCHANGE_POLICY_TITLE = 'EXCHANGE POLICY';
// Manpasand prints no exchange policy; add lines here to show one on receipts.
exports.RECEIPT_EXCHANGE_POLICY_LINES = [];
function shouldPrintReceiptExchangePolicy(receiptData) {
    return exports.RECEIPT_EXCHANGE_POLICY_LINES.length > 0 && !receiptData.documentTitle?.trim();
}
//# sourceMappingURL=receipt-policy.js.map