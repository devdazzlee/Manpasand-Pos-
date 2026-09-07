import apiClient from "./apiClient"

export const LIST_PAGE_SIZE = 20
export const REF_LIST_LIMIT = 100

type ListMeta = {
  total?: number
  page?: number
  limit?: number
  totalPages?: number
}

export function unwrapList<T = unknown>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: T[] }).data
  }
  return []
}

export function unwrapMeta(payload: unknown): ListMeta | null {
  if (!payload || typeof payload !== "object") return null
  const meta = (payload as { meta?: ListMeta }).meta
  if (!meta || typeof meta !== "object") return null
  return meta
}

export async function collectPaginatedData<T = unknown>(
  path: string,
  extraParams: Record<string, unknown> = {},
  options?: { limit?: number; maxPages?: number },
): Promise<T[]> {
  const limit = options?.limit ?? REF_LIST_LIMIT
  const maxPages = options?.maxPages ?? 50
  const all: T[] = []

  for (let page = 1; page <= maxPages; page += 1) {
    const res = await apiClient.get(path, {
      params: { ...extraParams, page, limit },
    })
    const chunk = unwrapList<T>(res.data?.data)
    all.push(...chunk)
    const totalPages = Number(res.data?.meta?.totalPages)
    if (
      chunk.length === 0 ||
      chunk.length < limit ||
      (Number.isFinite(totalPages) && page >= totalPages)
    ) {
      break
    }
  }

  return all
}
