"use client";

import React, { useState, useEffect } from "react";
import apiClient from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, User, DollarSign, Receipt, Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Expense {
  id: string;
  particular: string;
  amount: string;
  created_at: string;
  cashflow_id: string | null;
}

interface Cashflow {
  id: string;
  opening: string;
  sales: string;
  closing: string;
  created_at: string;
  expenses: Expense[];
}

const LOCAL_STORAGE_KEY = 'cashRegisterDrawer';

interface DrawerState {
  date: string; // YYYY-MM-DD
  openingAmt: number;
  isOpen: boolean;
  isClosed: boolean;
  openedAt: number; // timestamp in ms
}

// Helper function to format currency
const formatCurrency = (amount: number) => {
  return `Rs ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export function CashRegister() {
  const { toast } = useToast();
  const EXP = "/expenses";
  const CF = "/cashflows";

  // State
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cashflows, setCashflows] = useState<Cashflow[]>([]);
  const [loadingExp, setLoadingExp] = useState(true);
  const [loadingCF, setLoadingCF] = useState(true);

  // Dialog controls
  const [openOpenDlg, setOpenOpenDlg] = useState(false);
  const [openAddExpDlg, setOpenAddExpDlg] = useState(false);
  const [openCloseDlg, setOpenCloseDlg] = useState(false);

  // Interaction
  const [openingAmt, setOpeningAmt] = useState<number>(0);
  const [newExpense, setNewExpense] = useState({ particular: "", amount: "" });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [isLoadingOpen, setIsLoadingOpen] = useState(false);
  const [isLoadingExpAdd, setIsLoadingExpAdd] = useState(false);
  const [isLoadingClose, setIsLoadingClose] = useState(false);

  // Client-only state
  const [today, setToday] = useState("");

  // Add drawer state
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null);

  useEffect(() => {
    // Set today's date on client only
    const todayStr = new Date().toISOString().split('T')[0];
    setToday(todayStr);
    // Load drawer state from localStorage
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      const parsed: DrawerState = JSON.parse(stored);
      if (parsed.date === todayStr) {
        // Auto-close logic
        if (parsed.isOpen && !parsed.isClosed && parsed.openedAt) {
          const now = Date.now();
          const ms24h = 24 * 60 * 60 * 1000;
          if (now - parsed.openedAt >= ms24h) {
            // Auto-close
            const closedState = { ...parsed, isOpen: false, isClosed: true };
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(closedState));
            setDrawerState(closedState);
            setOpeningAmt(closedState.openingAmt);
            toast({ title: "Drawer auto-closed after 24 hours" });
          } else {
            setDrawerState(parsed);
            setOpeningAmt(parsed.openingAmt);
          }
        } else {
          setDrawerState(parsed);
          setOpeningAmt(parsed.openingAmt);
        }
      } else {
        setDrawerState(null);
        setOpeningAmt(0);
      }
    } else {
      setDrawerState(null);
      setOpeningAmt(0);
    }
    loadExpenses();
    loadCashflows();
  }, []);

  // Helper to update localStorage
  const updateDrawerState = (state: DrawerState | null) => {
    if (state) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
    setDrawerState(state);
  };

  const loadExpenses = async () => {
    setLoadingExp(true);
    try {
      const res = await apiClient.get<{ data: Expense[] }>(EXP);
      setExpenses(res.data.data);
    } catch {
      toast({ title: "Failed to load expenses", variant: "destructive" });
    } finally {
      setLoadingExp(false);
    }
  };

  const loadCashflows = async () => {
    setLoadingCF(true);
    try {
      const res = await apiClient.get<{ data: Cashflow[] }>(CF);
      setCashflows(res.data.data);
    } catch {
      toast({ title: "Failed to load cashflows", variant: "destructive" });
    } finally {
      setLoadingCF(false);
    }
  };

  // Derived
  const hasOpenedToday = !!drawerState && drawerState.isOpen && !drawerState.isClosed && drawerState.date === today;
  const hasClosedToday = !!drawerState && drawerState.isClosed && drawerState.date === today;
  const totalSales = cashflows.reduce((sum, cf) => today && cf.created_at.startsWith(today) ? sum + parseFloat(cf.sales) : sum, 0);
  const unassignedToday = expenses.filter(e => today && !e.cashflow_id && e.created_at.startsWith(today));

  // Handlers
  const handleCreateExpense = async () => {
    const amt = parseFloat(newExpense.amount);
    if (!newExpense.particular || isNaN(amt) || amt <= 0) {
      toast({ title: "Invalid expense", variant: "destructive" });
      return;
    }
    setIsLoadingExpAdd(true);
    try {
      await apiClient.post(EXP, { particular: newExpense.particular, amount: amt });
      toast({ title: "Expense added" });
      setOpenAddExpDlg(false);
      setNewExpense({ particular: "", amount: "" });
      await loadExpenses();
    } catch {
      toast({ title: "Failed to add expense", variant: "destructive" });
    } finally {
      setIsLoadingExpAdd(false);
    }
  };

  const handleOpenDrawer = () => {
    if (openingAmt <= 0 || isNaN(openingAmt)) {
      toast({ title: "Enter a valid opening amount", variant: "destructive" });
      return;
    }
    if (hasOpenedToday || hasClosedToday) {
      toast({ title: "Drawer already opened or closed today", variant: "destructive" });
      return;
    }
    setIsLoadingOpen(true);
    setTimeout(() => {
      const todayStr = new Date().toISOString().split('T')[0];
      const newState: DrawerState = {
        date: todayStr,
        openingAmt,
        isOpen: true,
        isClosed: false,
        openedAt: Date.now(),
      };
      updateDrawerState(newState);
      toast({ title: `Drawer opened at ${formatCurrency(openingAmt)}` });
      setOpenOpenDlg(false);
      setIsLoadingOpen(false);
    }, 800); // Simulate async
  };

  const handleCloseDrawer = async () => {
    if (!hasOpenedToday || hasClosedToday) {
      toast({ title: "Drawer is not open or already closed today", variant: "destructive" });
      return;
    }
    setIsLoadingClose(true);
    setTimeout(() => {
      if (!drawerState) return;
      const todayStr = new Date().toISOString().split('T')[0];
      const closingAmt = drawerState.openingAmt + totalSales;
      const newState: DrawerState = {
        ...drawerState,
        isClosed: true,
        isOpen: false,
      };
      updateDrawerState(newState);
      toast({ title: "Drawer closed", description: `Closing Amount: ${formatCurrency(closingAmt)}` });
      setOpenCloseDlg(false);
      setIsLoadingClose(false);
    }, 800); // Simulate async
  };

  // SKELETON LOADER COMPONENT
  const CardSkeleton = () => (
    <div className="rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse h-20 w-full flex flex-col justify-center items-center">
      <div className="h-4 w-16 bg-gray-300 dark:bg-gray-700 rounded mb-2" />
      <div className="h-6 w-24 bg-gray-200 dark:bg-gray-600 rounded" />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Cash Register</h1>
          {today && (
            <div className="flex space-x-2 mt-1">
              <Badge variant="outline"><Clock className="h-4 w-4 mr-1" />{today}</Badge>
              <Badge variant="outline"><User className="h-4 w-4 mr-1" />Cashier</Badge>
            </div>
          )}
        </div>
        <div className="flex space-x-2">
          <Dialog open={openOpenDlg} onOpenChange={setOpenOpenDlg}>
            <DialogTrigger asChild>
              <Button disabled={hasOpenedToday || hasClosedToday}>
                {isLoadingOpen ? <Loader2 className="animate-spin mr-2" /> : <DollarSign className="mr-2" />}Open Drawer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Open Drawer</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <Label>Opening Amount</Label>
                <Input type="number" value={openingAmt} onChange={e => setOpeningAmt(+e.target.value)} min={0} />
                <Button onClick={handleOpenDrawer} disabled={isLoadingOpen}>
                  {isLoadingOpen ? <Loader2 className="animate-spin mr-2" /> : 'Confirm'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={openAddExpDlg} onOpenChange={setOpenAddExpDlg}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2" />Add Expense</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Expense</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <Label>Particular</Label>
                <Input value={newExpense.particular} onChange={e => setNewExpense(f => ({ ...f, particular: e.target.value }))} />
                <Label>Amount</Label>
                <Input type="number" value={newExpense.amount} onChange={e => setNewExpense(f => ({ ...f, amount: e.target.value }))} min={0} />
                <Button onClick={handleCreateExpense} disabled={isLoadingExpAdd}>
                  {isLoadingExpAdd ? <Loader2 className="animate-spin mr-2" /> : 'Save Expense'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={openCloseDlg} onOpenChange={setOpenCloseDlg}>
            <DialogTrigger asChild>
              <Button disabled={!hasOpenedToday || hasClosedToday}>
                {isLoadingClose ? <Loader2 className="animate-spin mr-2" /> : <Receipt className="mr-2" />}Close Drawer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Close Drawer</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <Label>Select Today's Unassigned Expenses</Label>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {loadingExp ? <Loader2 className="animate-spin mx-auto" /> : unassignedToday.map(e => (
                    <div key={e.id} className="flex items-center space-x-2">
                      <input type="checkbox" checked={selectedIds.includes(e.id)} onChange={ev => setSelectedIds(ids => ev.target.checked ? [...ids, e.id] : ids.filter(i => i !== e.id))} />
                      <span>{e.particular} - {formatCurrency(parseFloat(e.amount))}</span>
                    </div>
                  ))}
                </div>
                <Button onClick={handleCloseDrawer} disabled={isLoadingClose}>
                  {isLoadingClose ? <Loader2 className="animate-spin mr-2" /> : 'Save Cashflow'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="shadow-md">
          <CardHeader><CardTitle>Opening</CardTitle></CardHeader>
          <CardContent>
            {(isLoadingOpen || loadingCF) ? <CardSkeleton /> : (
              <span className="text-xl font-semibold">{drawerState && drawerState.date === today ? formatCurrency(drawerState.openingAmt) : formatCurrency(0)}</span>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader><CardTitle>Sales</CardTitle></CardHeader>
          <CardContent>
            {loadingCF ? <CardSkeleton /> : (
              <span className="text-xl font-semibold">{formatCurrency(totalSales)}</span>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader><CardTitle>Closing</CardTitle></CardHeader>
          <CardContent>
            {(isLoadingClose || loadingCF) ? <CardSkeleton /> : (
              <span className="text-xl font-semibold">{drawerState && drawerState.date === today ? formatCurrency(drawerState.openingAmt + totalSales) : formatCurrency(0)}</span>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader><CardTitle>Expenses</CardTitle></CardHeader>
          <CardContent>
            {loadingExp ? <CardSkeleton /> : (
              <span className="text-xl font-semibold">{unassignedToday.length}</span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expenses Table */}
      <Card>
        <CardHeader><CardTitle>Expenses</CardTitle></CardHeader>
        <CardContent>
          {loadingExp ? <Loader2 className="animate-spin mx-auto" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Particular</TableHead><TableHead>Amount</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
              <TableBody>
                {expenses.map(e => (
                  <TableRow key={e.id} className="hover:bg-gray-50">
                    <TableCell>{e.particular}</TableCell>
                    <TableCell>{formatCurrency(parseFloat(e.amount))}</TableCell>
                    <TableCell>{new Date(e.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Cashflow History Table */}
      <Card>
        <CardHeader><CardTitle>Cashflows</CardTitle></CardHeader>
        <CardContent>
          {loadingCF ? <Loader2 className="animate-spin mx-auto" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Opening</TableHead><TableHead>Sales</TableHead><TableHead>Closing</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
              <TableBody>
                {cashflows.map(c => (
                  <TableRow key={c.id} className="hover:bg-gray-50">
                    <TableCell>{formatCurrency(parseFloat(c.opening))}</TableCell>
                    <TableCell>{formatCurrency(parseFloat(c.sales))}</TableCell>
                    <TableCell>{formatCurrency(parseFloat(c.closing))}</TableCell>
                    <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
