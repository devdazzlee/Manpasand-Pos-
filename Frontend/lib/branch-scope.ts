"use client";

/**
 * Back-office branch scope — one switcher for the whole admin app.
 *
 * Production POS back offices (Shopify locations, Lightspeed outlets, Square
 * locations) don't give every report its own branch filter: a single
 * "viewing branch" choice at the top scopes every page. This module is that
 * single source of truth.
 *
 *  - `null` = All branches.
 *  - Only admins choose. Branch accounts are pinned to their own branch by the
 *    server, so the scope never applies to them.
 *  - The API client reads `getActiveBranchScope()` and adds `branchId` /
 *    `branch_id` to GET requests for branch-specific data (see apiClient.ts).
 *  - `applies` is switched off on pages whose data isn't per-branch
 *    (catalog, suppliers, tax…) and on the Sales screen, which has its own
 *    explicit billing-branch picker.
 */

import { useCallback, useSyncExternalStore } from "react";
import { isAdminRole } from "@/lib/branch-utils";

const STORAGE_KEY = "branchScope";

type Listener = () => void;
const listeners = new Set<Listener>();

let scopeId: string | null = null;
let applies = true;
let loaded = false;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    scopeId = localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    scopeId = null;
  }
}

function emit() {
  for (const l of listeners) l();
}

function isAdmin() {
  if (typeof window === "undefined") return false;
  try {
    return isAdminRole(localStorage.getItem("role"));
  } catch {
    return false;
  }
}

/** The branch every page should show, or null for All branches. */
export function getBranchScope(): string | null {
  load();
  return isAdmin() ? scopeId : null;
}

/** Scope to send on API requests right now (null when not applicable). */
export function getActiveBranchScope(): string | null {
  return applies ? getBranchScope() : null;
}

export function setBranchScope(id: string | null) {
  load();
  const next = id && id !== "all" ? id : null;
  if (next === scopeId) return;
  scopeId = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, next);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage blocked: scope still works for this session
  }
  emit();
}

/**
 * Called by the app shell while rendering the active page. Silent on purpose:
 * the page's first data request goes out during its mount, before any effect,
 * so the flag must already be correct then. `announceBranchScopeApplies()`
 * tells the switcher UI afterwards.
 */
export function syncBranchScopeApplies(value: boolean) {
  applies = value;
}

export function announceBranchScopeApplies() {
  emit();
}

function getScopeApplies() {
  return applies;
}

export function clearBranchScope() {
  scopeId = null;
  loaded = true;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  emit();
}

function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** React view of the scope: `{ branchId, applies, setBranchId }`. */
export function useBranchScope() {
  const branchId = useSyncExternalStore(subscribe, getBranchScope, () => null);
  const scopeApplies = useSyncExternalStore(subscribe, getScopeApplies, () => true);
  const setBranchId = useCallback((id: string | null) => setBranchScope(id), []);
  return { branchId, applies: scopeApplies, setBranchId };
}

/**
 * Drop-in replacement for a page's own `useState("all")` branch filter.
 * The page starts on the global scope, and changing it changes the global
 * scope — so the header switcher and the page filter never disagree.
 *
 *   const [branchId, setBranchId] = useScopedBranch("all");
 */
export function useScopedBranch(allValue: string = "all"): [string, (value: string) => void] {
  const { branchId, setBranchId } = useBranchScope();
  const value = branchId ?? allValue;
  const set = useCallback(
    (v: string) => setBranchId(!v || v === allValue ? null : v),
    [allValue, setBranchId],
  );
  return [value, set];
}
