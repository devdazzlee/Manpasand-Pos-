import crypto from 'crypto';

/**
 * APG RequestHash: AES/CBC/PKCS7 with Key1 as the 128-bit key and Key2 as IV.
 * Matches the CryptoJS sample in the Bank Alfalah APG Merchant Integration Guide v1.1.
 */
export function encryptAlfalahRequestHash(mapString: string, key1: string, key2: string): string {
  const key = Buffer.from(key1, 'utf8');
  const iv = Buffer.from(key2, 'utf8');

  if (key.length !== 16 || iv.length !== 16) {
    throw new Error(
      `Alfalah Key1 and Key2 must be 16 characters (AES-128). Received Key1=${key.length}, Key2=${iv.length}.`,
    );
  }

  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(mapString, 'utf8'), cipher.final()]);
  return encrypted.toString('base64');
}

export function buildAlfalahMapString(fields: Record<string, string>): string {
  return Object.entries(fields)
    .filter(([name, value]) => Boolean(name) && value !== undefined && value !== null)
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
}

export function hashAlfalahFields(
  fields: Record<string, string>,
  key1: string,
  key2: string,
): string {
  return encryptAlfalahRequestHash(buildAlfalahMapString(fields), key1, key2);
}
