/**
 * Whether the server is reachable — not just whether the OS reports a network.
 * `navigator.onLine` says "true" on a Wi-Fi with no internet, so real request
 * outcomes (reported by apiClient) are what flip the state.
 */

type Listener = (online: boolean) => void

let serverReachable = typeof navigator === "undefined" ? true : navigator.onLine
const listeners = new Set<Listener>()

function setReachable(next: boolean) {
  if (next === serverReachable) return
  serverReachable = next
  listeners.forEach((listener) => listener(next))
}

export function isOnline(): boolean {
  return serverReachable && (typeof navigator === "undefined" || navigator.onLine)
}

export function subscribeOnline(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function reportServerReachable() {
  setReachable(true)
}

export function reportServerUnreachable() {
  setReachable(false)
}

/** Axios error with no HTTP response: offline, DNS, timeout, CORS/proxy failure. */
export function isNetworkError(error: any): boolean {
  if (!error) return false
  if (error.response) return false
  if (error.code === "ERR_CANCELED") return false
  return Boolean(error.isAxiosError || error.request || error.code === "ECONNABORTED" || error.code === "ERR_NETWORK")
}

if (typeof window !== "undefined") {
  window.addEventListener("offline", () => setReachable(false))
  // The OS says we're back; the next request (sync engine pings) confirms the server.
  window.addEventListener("online", () => listeners.forEach((listener) => listener(isOnline())))
}
