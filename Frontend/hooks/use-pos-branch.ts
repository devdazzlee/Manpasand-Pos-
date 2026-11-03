"use client";

import { useEffect, useMemo, useState } from "react";
import apiClient from "@/lib/apiClient";
import {
  BranchOption,
  isAdminRole,
  mapBranchOption,
  normalizeBranchId,
} from "@/lib/branch-utils";

/**
 * Admins have no branch of their own, so the billing branch is chosen on the
 * Sales screen every time it opens. It is deliberately NOT remembered or
 * defaulted: a pre-selected branch is how admin bills silently landed in the
 * wrong branch. This key is only cleaned up from older app versions.
 */
const POS_BRANCH_KEY = "posBranchId";

/** Remove any remembered admin branch choice left by older versions (login / logout). */
export function clearPosBranchChoice() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(POS_BRANCH_KEY);
    localStorage.removeItem(POS_BRANCH_KEY); // legacy location
  } catch {
    // storage blocked: nothing to clear
  }
}

interface BranchInfo {
  name: string;
  address: string;
}

export function usePosBranch() {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [branchInfo, setBranchInfo] = useState<BranchInfo>({ name: "", address: "" });
  const [loading, setLoading] = useState(false);
  const [adminMode, setAdminMode] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const initializeBranch = async () => {
      if (typeof window === "undefined") return;

      setLoading(true);

      try {
        const role = localStorage.getItem("role");
        const isAdmin = isAdminRole(role);
        const storedBranchId = normalizeBranchId(localStorage.getItem("branch"));
        clearPosBranchChoice();

        if (!cancelled) {
          setAdminMode(isAdmin);
        }

        if (isAdmin) {
          const response = await apiClient.get("/branches", {
            params: { page: 1, limit: 100, is_active: true },
          });
          const rawBranches = Array.isArray(response?.data?.data) ? response.data.data : [];
          const activeBranches = rawBranches
            .map(mapBranchOption)
            .filter((branch: BranchOption) => branch.id && branch.is_active !== false)
            // Warehouses don't bill customers (the server rejects it too).
            .filter((branch: BranchOption) => branch.branch_type !== "WAREHOUSE");

          if (cancelled) return;

          setBranches(activeBranches);

          // Never pre-select: the admin must consciously pick the branch.
          setSelectedBranchId("");
          setBranchInfo({ name: "", address: "" });

          return;
        }

        if (!storedBranchId) {
          if (!cancelled) {
            setSelectedBranchId("");
            setBranchInfo({ name: "", address: "" });
          }
          return;
        }

        if (!cancelled) {
          setSelectedBranchId(storedBranchId);
        }

        const response = await apiClient.get(`/branches/${storedBranchId}`);
        const branch = response?.data?.data ? mapBranchOption(response.data.data) : null;

        if (cancelled || !branch) return;

        setBranchInfo({
          name: branch.name,
          address: branch.address || "",
        });
      } catch (error) {
        if (!cancelled) {
          setBranchInfo((prev) => (prev.name ? prev : { name: "Admin", address: "" }));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    initializeBranch();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!adminMode) return;

    const selectedBranch = branches.find(
      (branch: BranchOption) => branch.id === selectedBranchId
    );
    if (!selectedBranch) return;

    setBranchInfo({
      name: selectedBranch.name,
      address: selectedBranch.address || "",
    });
  }, [adminMode, branches, selectedBranchId]);

  const selectedBranch = useMemo(
    () =>
      branches.find((branch: BranchOption) => branch.id === selectedBranchId) || null,
    [branches, selectedBranchId]
  );

  // Admin picks the branch the bill belongs to (kept only while the screen is open).
  const selectBranch = (branchId: string) => {
    setSelectedBranchId(branchId);
  };

  return {
    adminMode,
    selectBranch,
    branchLoading: loading,
    branches,
    selectedBranch,
    selectedBranchId,
    setSelectedBranchId,
    branchInfo,
    hasBranch: Boolean(selectedBranchId),
  };
}
