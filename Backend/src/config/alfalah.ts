const trim = (value?: string | null) => (value ?? '').trim();

export type AlfalahEnv = 'sandbox' | 'production';

function normalizeEnv(value?: string): AlfalahEnv {
  return value?.trim().toLowerCase() === 'production' ? 'production' : 'sandbox';
}

export function getAlfalahConfig() {
  const env = normalizeEnv(process.env.ALFALAH_ENV);
  const merchantId = trim(process.env.ALFALAH_MERCHANT_ID);
  const storeId = trim(process.env.ALFALAH_STORE_ID);
  const merchantHash = trim(process.env.ALFALAH_MERCHANT_HASH);
  const merchantUsername = trim(process.env.ALFALAH_MERCHANT_USERNAME);
  const merchantPassword = trim(process.env.ALFALAH_MERCHANT_PASSWORD);
  const key1 = trim(process.env.ALFALAH_KEY1);
  const key2 = trim(process.env.ALFALAH_KEY2);
  const websiteUrl = trim(process.env.ALFALAH_WEBSITE_URL) || 'http://localhost:3001';
  const channelId = trim(process.env.ALFALAH_CHANNEL_ID) || '1001';

  const enabled = Boolean(
    merchantId &&
      storeId &&
      merchantHash &&
      merchantUsername &&
      merchantPassword &&
      key1 &&
      key2,
  );

  const host =
    env === 'production' ? 'https://payments.bankalfalah.com' : 'https://sandbox.bankalfalah.com';

  return {
    env,
    enabled,
    merchantId,
    storeId,
    merchantHash,
    merchantUsername,
    merchantPassword,
    key1,
    key2,
    websiteUrl: websiteUrl.replace(/\/$/, ''),
    channelId,
    handshakeUrl: `${host}/HS/HS/HS`,
    ssoUrl: `${host}/SSO/SSO/SSO`,
    ipnOrderStatusUrl: (orderId: string) =>
      `${host}/HS/api/IPN/OrderStatus/${encodeURIComponent(merchantId)}/${encodeURIComponent(storeId)}/${encodeURIComponent(orderId)}`,
  };
}

export function assertAlfalahConfigured() {
  const config = getAlfalahConfig();
  if (!config.enabled) {
    throw new Error(
      'Bank Alfalah is not configured. Set ALFALAH_MERCHANT_ID, ALFALAH_STORE_ID, ALFALAH_MERCHANT_HASH, ALFALAH_MERCHANT_USERNAME, ALFALAH_MERCHANT_PASSWORD, ALFALAH_KEY1, and ALFALAH_KEY2.',
    );
  }
  return config;
}
