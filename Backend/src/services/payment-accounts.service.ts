import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';

/**
 * Which cash / bank account each non-cash payment method lands in — e.g. card
 * machine settles into Meezan, JazzCash wallet into its own account. Used by
 * sale and refund vouchers and as the default "Paid from" everywhere. Methods
 * left unset go to the main Bank account (system key BANK).
 */
export const ROUTED_METHODS = ['CARD', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE'] as const;
export type RoutedMethod = (typeof ROUTED_METHODS)[number];
export type PaymentRouting = Partial<Record<RoutedMethod, string>>;

const SETTING_KEY = 'accounts.payment_routing';
let cache: { at: number; value: PaymentRouting } | null = null;

export async function getPaymentRouting(): Promise<PaymentRouting> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  const value = (row?.value && typeof row.value === 'object' ? row.value : {}) as PaymentRouting;
  cache = { at: Date.now(), value };
  return value;
}

/** Saves the routing; every account must be an active Cash & Bank account. */
export async function setPaymentRouting(input: Record<string, string | null | undefined>, userId?: string | null) {
  const value: PaymentRouting = {};
  for (const method of ROUTED_METHODS) {
    const id = input[method];
    if (!id) continue;
    const account = await prisma.transactionalAccount.findUnique({
      where: { id },
      include: { control: { select: { system_key: true } } },
    });
    const isMoney = account && (account.control.system_key === 'CASH_BANK' || account.system_key === 'CASH' || account.system_key === 'BANK');
    if (!account || !isMoney) throw new AppError(400, `${method}: choose a cash or bank account`);
    if (!account.is_active) throw new AppError(400, `${account.code} ${account.name} is inactive`);
    value[method] = id;
  }
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value, updated_by: userId ?? null },
    update: { value, updated_by: userId ?? null },
  });
  cache = { at: Date.now(), value };
  return value;
}

/** Normalises the many method spellings used across modules. */
export function routedMethod(method?: string | null): RoutedMethod | null {
  const m = String(method || '').toUpperCase();
  if (m === 'CARD') return 'CARD';
  if (m === 'BANK' || m === 'BANK_TRANSFER' || m === 'ONLINE' || m === 'TRANSFER') return 'BANK_TRANSFER';
  if (m === 'MOBILE_MONEY' || m === 'JAZZCASH' || m === 'EASYPAISA' || m === 'WALLET') return 'MOBILE_MONEY';
  if (m === 'CHEQUE' || m === 'CHECK') return 'CHEQUE';
  return null;
}

/**
 * The account a non-cash method lands in: the configured one when it is still
 * an active account, otherwise `fallbackBankId` (the main Bank account).
 */
export async function bankAccountForMethod(method: string | null | undefined, fallbackBankId: string) {
  const routed = routedMethod(method);
  if (!routed) return fallbackBankId;
  const routing = await getPaymentRouting();
  const id = routing[routed];
  if (!id) return fallbackBankId;
  const ok = await prisma.transactionalAccount.findFirst({ where: { id, is_active: true }, select: { id: true } });
  return ok ? id : fallbackBankId;
}
