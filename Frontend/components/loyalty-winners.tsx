"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { LoadingButton } from "@/components/ui/loading-button";
import { Gift, Plus, RefreshCcw, Pencil, Ban, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { extractApiError } from "@/lib/api/errors";
import { formatMoney } from "@/components/inventory/stock-ops/export-utils";
import { useCustomers, useCustomerMutations } from "@/hooks/queries/use-customers";
import { fetchCustomers, type Customer } from "@/lib/api/customers";
import { useBranches } from "@/hooks/queries/use-branches";

interface WinnerFormValues {
  name: string;
  phone: string;
  cnic: string;
  branchId: string;
  discountPercent: string;
  discountCap: string;
  monthlyLimit: string;
}

const emptyForm = (): WinnerFormValues => ({
  name: "",
  phone: "",
  cnic: "",
  branchId: "",
  discountPercent: "25",
  discountCap: "3000",
  monthlyLimit: "4",
});

export function LoyaltyWinners() {
  const { toast } = useToast();
  const { branches } = useBranches({ isActive: true });
  const {
    customers: winners,
    isLoading,
    isRefreshing,
    refetch,
  } = useCustomers({ isLoyaltyWinner: true, limit: 200 });
  const { create, update } = useCustomerMutations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWinner, setEditingWinner] = useState<Customer | null>(null);
  const [form, setForm] = useState<WinnerFormValues>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<Customer | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const branchNameById = useMemo(() => {
    const map = new Map<string, string>();
    branches.forEach((b: any) => map.set(b.id, b.name));
    return map;
  }, [branches]);

  const setField = (patch: Partial<WinnerFormValues>) =>
    setForm((f) => ({ ...f, ...patch }));

  const openRegister = () => {
    setEditingWinner(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (winner: Customer) => {
    setEditingWinner(winner);
    setForm({
      name: winner.name || "",
      phone: String(winner.phone_number ?? winner.phone ?? ""),
      cnic: String(winner.loyalty_cnic ?? ""),
      branchId: String(winner.loyalty_branch_id ?? ""),
      discountPercent: String(winner.loyalty_discount_percent ?? 25),
      discountCap: String(winner.loyalty_discount_cap ?? 3000),
      monthlyLimit: String(winner.loyalty_monthly_limit ?? 4),
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingWinner(null);
  };

  const submit = async () => {
    const name = form.name.trim();
    const phone = form.phone.trim();
    const cnic = form.cnic.trim();
    const branchId = form.branchId;
    const discountPercent = Number(form.discountPercent);
    const discountCap = Number(form.discountCap);
    const monthlyLimit = Number(form.monthlyLimit);

    if (!name) return toast({ variant: "destructive", title: "Name is required" });
    if (!phone || phone.length < 7)
      return toast({ variant: "destructive", title: "A valid phone number is required" });
    if (!cnic) return toast({ variant: "destructive", title: "CNIC is required (shown for in-store verification)" });
    if (!branchId)
      return toast({ variant: "destructive", title: "Pick the branch this discount is valid at" });
    if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100)
      return toast({ variant: "destructive", title: "Discount % must be between 1 and 100" });
    if (!Number.isFinite(discountCap) || discountCap <= 0)
      return toast({ variant: "destructive", title: "Discount cap must be a positive amount" });
    if (!Number.isInteger(monthlyLimit) || monthlyLimit <= 0)
      return toast({ variant: "destructive", title: "Monthly limit must be a whole number, at least 1" });

    const loyaltyPayload = {
      is_loyalty_winner: true,
      loyalty_cnic: cnic,
      loyalty_branch_id: branchId,
      loyalty_discount_percent: discountPercent,
      loyalty_discount_cap: discountCap,
      loyalty_monthly_limit: monthlyLimit,
    };

    setSaving(true);
    try {
      if (editingWinner) {
        await update.mutateAsync({
          id: editingWinner.id,
          body: { name, phone_number: phone, ...loyaltyPayload },
        });
        toast({ title: "Winner updated" });
        closeDialog();
        return;
      }

      // Find-or-create by phone: an existing customer who later wins a
      // giveaway gets the loyalty fields attached instead of a duplicate row.
      const existing = await fetchCustomers({ search: phone, limit: 10 });
      const match = existing.data.find(
        (c) => String(c.phone_number ?? c.phone ?? "").replace(/\D/g, "") === phone.replace(/\D/g, ""),
      );

      if (match) {
        await update.mutateAsync({
          id: match.id,
          body: { name: name || match.name, ...loyaltyPayload },
        });
      } else {
        await create.mutateAsync({ name, phone_number: phone, ...loyaltyPayload });
      }
      toast({ title: "Winner registered" });
      closeDialog();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not save winner",
        description: extractApiError(e, "Failed to save winner"),
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await update.mutateAsync({
        id: deactivateTarget.id,
        body: { is_loyalty_winner: false },
      });
      toast({ title: "Removed from loyalty program" });
      setDeactivateTarget(null);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not update winner",
        description: extractApiError(e, "Failed to update winner"),
      });
    } finally {
      setDeactivating(false);
    }
  };

  const reactivate = async (winner: Customer) => {
    try {
      await update.mutateAsync({ id: winner.id, body: { is_loyalty_winner: true } });
      toast({ title: "Winner re-activated" });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not update winner",
        description: extractApiError(e, "Failed to update winner"),
      });
    }
  };

  return (
    <>
      <PageHeader
        title="Loyalty Winners"
        description="Register giveaway winners — their lifetime discount applies automatically in Sale when you pick them by phone number"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefreshing} title="Refresh">
              <RefreshCcw className={isRefreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
            <Button size="sm" onClick={openRegister}>
              <Plus className="mr-1.5 h-4 w-4" />
              Register winner
            </Button>
          </>
        }
      />

      <PageBody>
        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : winners.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
            <Gift className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No winners registered yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Register a giveaway winner here — on Sale, selecting them by phone number auto-applies their discount.
            </p>
            <Button size="sm" className="mt-2" onClick={openRegister}>
              <Plus className="mr-1.5 h-4 w-4" />
              Register winner
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wide">Name</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Phone</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">CNIC</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Branch</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Discount</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Monthly cap</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {winners.map((w) => {
                  const active = Boolean(w.is_loyalty_winner);
                  return (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium">{w.name}</TableCell>
                      <TableCell className="tabular-nums">{String(w.phone_number ?? w.phone ?? "—")}</TableCell>
                      <TableCell className="tabular-nums">{String(w.loyalty_cnic ?? "—")}</TableCell>
                      <TableCell>{branchNameById.get(String(w.loyalty_branch_id)) || "—"}</TableCell>
                      <TableCell>
                        {Number(w.loyalty_discount_percent ?? 0)}% (cap {formatMoney(Number(w.loyalty_discount_cap ?? 0))})
                      </TableCell>
                      <TableCell>{w.loyalty_monthly_limit ?? "—"}/mo</TableCell>
                      <TableCell>
                        <Badge variant={active ? "default" : "secondary"}>
                          {active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => openEdit(w)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {active ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              title="Remove from program"
                              onClick={() => setDeactivateTarget(w)}
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-emerald-600"
                              title="Re-activate"
                              onClick={() => reactivate(w)}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </PageBody>

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingWinner ? "Edit winner" : "Register winner"}</DialogTitle>
            <DialogDescription>
              {editingWinner
                ? "Update this winner's discount terms."
                : "Searches existing customers by phone first — if they already shop here, their record is upgraded instead of duplicated."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setField({ name: e.target.value })} placeholder="Full name" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone number</Label>
              <Input
                value={form.phone}
                onChange={(e) => setField({ phone: e.target.value })}
                placeholder="03xx-xxxxxxx"
                disabled={Boolean(editingWinner)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>CNIC</Label>
              <Input value={form.cnic} onChange={(e) => setField({ cnic: e.target.value })} placeholder="xxxxx-xxxxxxx-x" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Branch (discount only valid here)</Label>
              <Select value={form.branchId} onValueChange={(v) => setField({ branchId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Discount %</Label>
              <Input
                type="number"
                value={form.discountPercent}
                onChange={(e) => setField({ discountPercent: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cap per bill (Rs)</Label>
              <Input
                type="number"
                value={form.discountCap}
                onChange={(e) => setField({ discountCap: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max discounted bills / month</Label>
              <Input
                type="number"
                value={form.monthlyLimit}
                onChange={(e) => setField({ monthlyLimit: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              Cancel
            </Button>
            <LoadingButton onClick={submit} loading={saving}>
              {editingWinner ? "Save changes" : "Register"}
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deactivateTarget)} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove from loyalty program?</DialogTitle>
            <DialogDescription>
              {deactivateTarget?.name} will stop getting the lifetime discount on Sale. You can re-activate them later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateTarget(null)} disabled={deactivating}>
              Cancel
            </Button>
            <LoadingButton variant="destructive" onClick={confirmDeactivate} loading={deactivating}>
              Remove
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
