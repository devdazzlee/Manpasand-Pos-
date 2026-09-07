"use client";

import { useState, type ReactNode } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

import { createQueryClient, QUERY_CACHE_VERSION } from "./query-client";
import { PERSISTED_KEY_PREFIXES } from "./query-keys";

const PERSIST_KEY = "pos-query-cache";
const MAX_AGE = 24 * 60 * 60_000; // 24h

function makePersister() {
  if (typeof window === "undefined") return undefined;
  return createSyncStoragePersister({
    storage: window.localStorage,
    key: PERSIST_KEY,
    throttleTime: 1000,
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  // One client per browser session — never recreate on re-render.
  const [queryClient] = useState<QueryClient>(() => createQueryClient());
  const [persister] = useState(makePersister);

  if (!persister) {
    // SSR / no window — render children without persistence.
    return <>{children}</>;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: MAX_AGE,
        buster: QUERY_CACHE_VERSION,
        dehydrateOptions: {
          // Only persist small reference-data queries; big lists stay in memory
          // (and in the Dexie offline layer). This keeps us well under the
          // ~5 MB localStorage quota.
          shouldDehydrateQuery: (query) => {
            const prefix = String(query.queryKey[0] ?? "");
            return (
              query.state.status === "success" &&
              (PERSISTED_KEY_PREFIXES as readonly string[]).includes(prefix)
            );
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
