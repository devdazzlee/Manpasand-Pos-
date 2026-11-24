import { uuidv7 } from "./ids"

const DEVICE_ID_KEY = "pos_device_id"
const DEVICE_CODE_KEY = "pos_device_code"
const LAST_SALE_MS_KEY = "pos_last_sale_number_ms"

/** Stable id for this till (browser profile), sent with every sync batch. */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = uuidv7()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

/** Three random digits that tell this till's invoice numbers apart from other tills'. */
function getDeviceCode(): string {
  let code = localStorage.getItem(DEVICE_CODE_KEY)
  if (!code || !/^\d{3}$/.test(code)) {
    const random = new Uint16Array(1)
    crypto.getRandomValues(random)
    code = String(random[0] % 1000).padStart(3, "0")
    localStorage.setItem(DEVICE_CODE_KEY, code)
  }
  return code
}

/**
 * Invoice number the till can print before the server has seen the sale:
 * `SALE-<epoch ms><device code>`. Digits only, so the existing `SALE-\d+` parsing in
 * the ledger screens keeps working. The millisecond part never repeats on one till, so
 * two numbers can only clash across tills with the same code in the same millisecond —
 * and the server re-numbers that sale rather than losing it.
 */
export function nextSaleNumber(): string {
  return nextDocumentNumber("SALE")
}

/** Same scheme for other documents numbered on the till (stock-in slips: `PUR-…`). */
export function nextDocumentNumber(prefix: "SALE" | "PUR"): string {
  const last = Number(localStorage.getItem(LAST_SALE_MS_KEY) || 0)
  const ms = Math.max(Date.now(), last + 1)
  localStorage.setItem(LAST_SALE_MS_KEY, String(ms))
  return `${prefix}-${ms}${getDeviceCode()}`
}
