/**
 * UUID v7: time-ordered, so outbox entries and sales sort by creation time, and
 * generated on the till so a record has its final id before it ever reaches the server.
 */
export function uuidv7(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const ms = Date.now()
  // 48-bit big-endian Unix timestamp in milliseconds.
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff
  bytes[2] = Math.floor(ms / 2 ** 24) & 0xff
  bytes[3] = Math.floor(ms / 2 ** 16) & 0xff
  bytes[4] = Math.floor(ms / 2 ** 8) & 0xff
  bytes[5] = ms & 0xff
  bytes[6] = (bytes[6] & 0x0f) | 0x70 // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
