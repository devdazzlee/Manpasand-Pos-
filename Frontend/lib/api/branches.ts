import { getList, getOne, cleanParams } from "./http";
import { mapBranchOption, type BranchOption } from "@/lib/branch-utils";

export type { BranchOption };

export async function fetchBranches(
  params: { page?: number; limit?: number; isActive?: boolean } = {},
): Promise<BranchOption[]> {
  const res = await getList<any>(
    "/branches",
    cleanParams({
      page: params.page ?? 1,
      limit: params.limit ?? 100,
      is_active: params.isActive,
    }),
  );
  return res.data.map(mapBranchOption).filter((b) => b.id);
}

export async function fetchBranchById(id: string, signal?: AbortSignal): Promise<BranchOption> {
  const raw = await getOne<any>(`/branches/${id}`, { signal });
  return mapBranchOption(raw);
}
