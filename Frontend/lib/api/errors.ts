/**
 * Pull a human-readable message out of an axios/API error.
 * Replaces the ~10 copy-pasted `extractApiError` helpers across screens.
 */
export function extractApiError(err: unknown, fallback = "Something went wrong"): string {
  const anyErr = err as {
    response?: { data?: { message?: unknown; error?: unknown } };
    message?: unknown;
  };
  const fromResponse =
    anyErr?.response?.data?.message ?? anyErr?.response?.data?.error;
  if (typeof fromResponse === "string" && fromResponse.trim()) return fromResponse;
  if (Array.isArray(fromResponse) && typeof fromResponse[0] === "string") {
    return fromResponse[0];
  }
  if (typeof anyErr?.message === "string" && anyErr.message.trim()) return anyErr.message;
  return fallback;
}
