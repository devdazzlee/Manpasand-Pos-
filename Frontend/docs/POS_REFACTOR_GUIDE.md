# POS refactor guide

Follow this exactly. It exists so every screen ends up consistent. When a screen
already deviates, fix the deviation — do not copy it.

---

## 1. Data fetching — TanStack Query only

**Never** call `apiClient.get` inside a component `useEffect` to load a list.
**Never** read the Zustand `useStore` / `usePosData` cache for server data.

### Use the shared hooks

| Data | Hook | File |
|---|---|---|
| products | `useProducts(params)` | `hooks/queries/use-products.ts` |
| customers | `useCustomers(params)` + `useCustomerPurchases(id)` / `useCustomerLedger(id)` | `hooks/queries/use-customers.ts` |
| suppliers | `useSuppliers(params)` + `useSupplierPurchases(id)` / `useSupplierLedger(id)` | `hooks/queries/use-suppliers.ts` |
| categories | `useCategories({ withAll? })` | `hooks/queries/use-categories.ts` |
| branches | `useBranches()` / `useBranch(id)` | `hooks/queries/use-branches.ts` |

### Adding a new resource

1. `lib/api/<resource>.ts` — typed functions using the helpers in `lib/api/http.ts`
   (`getList`, `getOne`, `post`, `put`, `del`, `cleanParams`). Every fetch takes an
   optional `signal?: AbortSignal` and passes it through.
2. Add keys to `lib/query/query-keys.ts` under `qk`.
3. `hooks/queries/use-<resource>.ts` — `useQuery` with:
   - `queryKey: qk.<resource>.list(params)`
   - `queryFn: ({ signal }) => fetch<Resource>(params, signal)`
   - `staleTime`: `STALE_TIME.reference` for lookup data, `.directory` for
     people/orgs, `.catalog` for products, `.volatile` for dashboards/ledgers
   - `placeholderData: keepPreviousData` for anything paginated/searchable
4. If the data is small and worth an instant reload, add its key prefix to
   `PERSISTED_KEY_PREFIXES` in `query-keys.ts`.

### Search & pagination

- Keep `search` in local state, debounce ~250 ms into a second state, feed the
  debounced value to the hook. The hook handles dedupe + cancellation.
- Never pass `force`/`_t` cache-busters. Invalidate instead (below).

### Mutations

```ts
const qc = useQueryClient();
const save = useMutation({
  mutationFn: (body) => put(`/customer/${id}`, body),
  onSuccess: () => qc.invalidateQueries({ queryKey: qk.customers.all }),
});
```

Delete the old `fetchList()` + manual `setState(res.data.data)` entirely.

---

## 2. Modals — the rule

A `<Dialog>` is allowed **only** for:

- a destructive confirm (`<AlertDialog>`), or
- a short single-purpose form: **≤ 6 fields, no tabs, no table, no pagination.**

Everything else that currently opens in a `<Dialog>` becomes a **`DetailSheet`**
(`components/ui/detail-sheet.tsx`) — a right-docked panel with a light scrim that
leaves the list visible.

### Converting a detail modal → DetailSheet

Before:
```tsx
<Dialog open={detailOpen} onOpenChange={setDetailOpen}>
  <DialogContent className="max-w-[580px] ...">
    <DialogHeader><DialogTitle>{current?.name}</DialogTitle></DialogHeader>
    <Tabs value={tab} onValueChange={setTab}>...tabs + tables...</Tabs>
    <DialogFooter><Button>Edit</Button></DialogFooter>
  </DialogContent>
</Dialog>
```

After:
```tsx
<DetailSheet open={detailOpen} onOpenChange={setDetailOpen} size="lg">
  <DetailSheetHeader
    title={current?.name}
    subtitle={current?.phone}
    icon={<User className="h-5 w-5" />}
  >
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="h-9 bg-transparent p-0">
        <TabsTrigger value="overview" className="...">Overview</TabsTrigger>
        ...
      </TabsList>
    </Tabs>
  </DetailSheetHeader>
  <DetailSheetBody>
    {tab === "overview" && <Overview .../>}
    {tab === "ledger" && <Ledger .../>}   {/* data via useXLedger(id) */}
  </DetailSheetBody>
  <DetailSheetFooter>
    <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
    <Button onClick={openEdit}>Edit</Button>
  </DetailSheetFooter>
</DetailSheet>
```

- Detail-tab data loads through its own `useQuery` hook keyed by the record id,
  **gated on the sheet being open** (`enabled: detailOpen && !!id`). No more
  imperative `loadPurchases()` / `loadLedger()` on open.
- Keep add/edit forms as `<Dialog>` if they fit the ≤6-field rule; otherwise they
  become their own `DetailSheet` with a single form in the body.

---

## 3. Professional look — non-negotiables

- **Page header:** replace every bespoke `<h1 class="text-2xl/3xl font-bold">…`
  block with `<PageHeader title=… description=… actions=… />` from
  `components/ui/page-header.tsx`. Wrap the screen's content in `<PageBody>`.
- **Type scale:** body/labels `text-sm` (14) or `text-[13px]`; secondary
  `text-xs` (12) `text-muted-foreground`; numbers/money add `nums` (tabular).
  **No `text-[8px]` / `[9px]` / `[10px]`.** Minimum on-screen text is 12px.
- **Controls:** interactive targets ≥ 32px tall (`h-8` compact, `h-9`/`h-10`
  default). No `h-6`/`h-7` buttons.
- **Color:** use the shadcn tokens — `text-foreground`, `text-muted-foreground`,
  `bg-background`, `bg-muted`, `border-border`, `bg-primary`. Do **not** add new
  raw `gray-*` / `slate-*` / `blue-*` values. Existing `slate-*` can stay if you
  aren't touching that line, but new code uses tokens. Accent/primary color is
  for the primary action and the selected state only.
- **No emoji in UI.** Use `lucide-react` icons.
- **One ellipsis style:** the character `…`, never `...`.
- **Empty states:** icon + one line of `text-sm text-muted-foreground`, centered,
  in a `rounded-lg border border-dashed` box. No walls of tiny text.
- **Tables:** header row `text-xs font-medium text-muted-foreground uppercase
  tracking-wide`; cells `text-sm`; row height `h-11`; hover `bg-muted/50`;
  right-align numeric columns with `nums`.
- **Loading:** skeletons for first load (`query.isLoading`), a small inline
  spinner for background refetch (`query.isFetching && !isLoading`). Never blank
  the screen on a refetch — that's what `keepPreviousData` prevents.

---

## 4. Definition of done for a screen

- [ ] No `apiClient.*` call in a `useEffect`; list data comes from a query hook
- [ ] No `usePosData` / `useStore` server-data reads
- [ ] Detail/record modals converted to `DetailSheet`; only confirms + tiny forms
      remain as `Dialog`/`AlertDialog`
- [ ] `<PageHeader>` + `<PageBody>` in place
- [ ] No sub-12px text, no `h-6`/`h-7` controls, no emoji, no `...`
- [ ] `npx tsc --noEmit` reports no new top-level errors
- [ ] `next dev` compiles the app and the screen renders

`yarn build` (static export) is currently broken repo-wide, unrelated to this
work — do not use it as a gate. Use `npx tsc --noEmit` and `next dev`.
