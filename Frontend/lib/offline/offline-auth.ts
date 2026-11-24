/**
 * Signing in on this till with no internet. After a normal (online) sign-in the till
 * keeps a salted PBKDF2 hash of the password — never the password — plus that user's
 * session, so the same email and password can open the session again offline.
 * Someone who has never signed in on this till still needs the internet the first time.
 */
import { idbDelete, idbGet, idbPut, STORES } from "./idb"

const ITERATIONS = 210_000
const PREFIX = "offline-login:"

export interface RememberedUser {
  id?: string
  email: string
  role: string
  branch_id: string | null
}

interface OfflineLogin {
  key: string
  email: string
  salt: string
  hash: string
  iterations: number
  token: string
  user: RememberedUser
  branchName?: string
  branchAddress?: string
  savedAt: number
}

const keyFor = (email: string) => PREFIX + email.trim().toLowerCase()
const toHex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("")
const fromHex = (hex: string) => new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)))

async function derive(password: string, saltHex: string, iterations: number): Promise<string> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations }, material, 256)
  return toHex(bits)
}

/** Compares without stopping at the first difference. */
function sameHash(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function rememberLogin(input: { email: string; password: string; token: string; user: RememberedUser }) {
  try {
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)))
    const record: OfflineLogin = {
      key: keyFor(input.email),
      email: input.email.trim().toLowerCase(),
      salt,
      hash: await derive(input.password, salt, ITERATIONS),
      iterations: ITERATIONS,
      token: input.token,
      user: input.user,
      savedAt: Date.now(),
    }
    await idbPut(STORES.meta, record)
  } catch (error) {
    console.warn("[offline] Could not remember this sign-in for offline use:", error)
  }
}

export async function rememberBranch(email: string, branchName: string, branchAddress: string) {
  try {
    const record = await idbGet<OfflineLogin>(STORES.meta, keyFor(email))
    if (record) await idbPut(STORES.meta, { ...record, branchName, branchAddress })
  } catch {
    /* nothing remembered */
  }
}

export type OfflineSignInResult =
  | { ok: true; token: string; user: RememberedUser; branchName?: string; branchAddress?: string }
  | { ok: false; reason: "unknown" | "wrong-password" }

export async function offlineSignIn(email: string, password: string): Promise<OfflineSignInResult> {
  const record = await idbGet<OfflineLogin>(STORES.meta, keyFor(email)).catch(() => undefined)
  if (!record) return { ok: false, reason: "unknown" }
  const hash = await derive(password, record.salt, record.iterations)
  if (!sameHash(hash, record.hash)) return { ok: false, reason: "wrong-password" }
  return { ok: true, token: record.token, user: record.user, branchName: record.branchName, branchAddress: record.branchAddress }
}

/** Online sign-out ended the session on the server: this till must not reopen it. */
export async function forgetLogin(email: string) {
  await idbDelete(STORES.meta, keyFor(email)).catch(() => {})
}
