import { API_BASE } from "@/config/constants"

export async function loginRequest(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || res.statusText)
  }
  return res.json() as Promise<{
    success: true
    message: string
    data: { user: { email: string; role: string }; token: string , branch: string }
  }>
}

// asd  