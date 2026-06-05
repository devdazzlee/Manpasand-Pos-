export const RETURN_REASONS = [
  { value: "DAMAGED", label: "Damaged" },
  { value: "DEFECTIVE", label: "Defective" },
  { value: "WRONG_ITEM", label: "Wrong item" },
  { value: "CUSTOMER_CHANGED_MIND", label: "Customer changed mind" },
  { value: "MISSING_PARTS", label: "Missing parts" },
  { value: "OTHER", label: "Other" },
] as const;

export const REFUND_METHODS = [
  { value: "original_payment", label: "Original payment method" },
  { value: "cash", label: "Cash refund" },
  { value: "store_credit", label: "Store credit" },
  { value: "no_refund", label: "No refund" },
] as const;

export const EXCHANGE_BALANCE_ACTIONS = [
  { value: "collect", label: "Collect payment from customer" },
  { value: "refund", label: "Refund difference" },
  { value: "store_credit", label: "Issue store credit" },
] as const;

export const EXCHANGE_PAYMENT_OPTIONS = [
  { value: "cash", label: "Cash (customer pays now)" },
  { value: "card", label: "Card (customer pays now)" },
  { value: "store_credit", label: "Store credit" },
] as const;

export const INVENTORY_DISPOSITIONS = [
  { value: "RESTOCK", label: "Restock item" },
  { value: "DAMAGED", label: "Mark as damaged" },
  { value: "UNSELLABLE", label: "Mark as unsellable" },
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number]["value"];
export type RefundMethod = (typeof REFUND_METHODS)[number]["value"];
export type InventoryDisposition = (typeof INVENTORY_DISPOSITIONS)[number]["value"];
export type ExchangeBalanceAction = (typeof EXCHANGE_BALANCE_ACTIONS)[number]["value"];
export type ExchangePaymentOption = (typeof EXCHANGE_PAYMENT_OPTIONS)[number]["value"];
