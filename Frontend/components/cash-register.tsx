"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { DollarSign, CreditCard, Clock, User, Calculator, Receipt, AlertCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { createCashflowOpening } from "@/lib/api"
import { addCashflowClosing } from "@/lib/api"
import { getCashFlowByDate, addCashflowExpense, getExpenses } from "@/lib/api"
import React from "react"

interface Transaction {
  id: string
  time: string
  amount: number
  type: "Cash" | "Card"
  customer: string
  action?: "add" | "remove" | "sale"
  reason?: string
}

interface CashDrawerState {
  openingAmount: number
  currentAmount: number
  totalSales: number
  totalCash: number
  totalCard: number
  transactions: number
  isOpen: boolean
  openedAt?: string
  closedAt?: string
}

export function CashRegister() {
  const { toast } = useToast()

  const [cashDrawer, setCashDrawer] = useState<CashDrawerState>({
    openingAmount: 0,
    currentAmount: 0,
    totalSales: 0,
    totalCash: 0,
    totalCard: 0,
    transactions: 0,
    isOpen: false,
    openedAt: undefined,
  })

  const [isOpenDrawerDialogOpen, setIsOpenDrawerDialogOpen] = useState(false)
  const [isCloseDrawerDialogOpen, setIsCloseDrawerDialogOpen] = useState(false)
  const [isAddCashDialogOpen, setIsAddCashDialogOpen] = useState(false)
  const [isRemoveCashDialogOpen, setIsRemoveCashDialogOpen] = useState(false)
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [openingAmount, setOpeningAmount] = useState("")

  const [denominations, setDenominations] = useState([
    { value: 100, label: "$100", count: 2 },
    { value: 50, label: "$50", count: 4 },
    { value: 20, label: "$20", count: 15 },
    { value: 10, label: "$10", count: 12 },
    { value: 5, label: "$5", count: 8 },
    { value: 1, label: "$1", count: 25 },
    { value: 0.25, label: "Quarter", count: 40 },
    { value: 0.1, label: "Dime", count: 30 },
    { value: 0.05, label: "Nickel", count: 20 },
    { value: 0.01, label: "Penny", count: 50 },
  ])

  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([
    { id: "TXN156", time: "14:30", amount: 45.5, type: "Cash", customer: "John Doe", action: "sale" },
    { id: "TXN155", time: "14:25", amount: 78.2, type: "Card", customer: "Jane Smith", action: "sale" },
    { id: "TXN154", time: "14:20", amount: 32.1, type: "Cash", customer: "Walk-in", action: "sale" },
    { id: "TXN153", time: "14:15", amount: 156.75, type: "Card", customer: "Mike Johnson", action: "sale" },
    { id: "TXN152", time: "14:10", amount: 89.3, type: "Cash", customer: "Sarah Wilson", action: "sale" },
  ])

  // Expenses integration state
  const [cashflowId, setCashflowId] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [expenseParticular, setExpenseParticular] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");

  // Fetch today's cashflow and expenses on mount
  React.useEffect(() => {
    const fetchCashflowAndExpenses = async () => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const cashflow = await getCashFlowByDate(today);
        if (cashflow && cashflow.id) {
          setCashflowId(cashflow.id);
          fetchExpenses(cashflow.id);
        } else {
          setCashflowId(null);
          setExpenses([]);
        }
      } catch (error) {
        setCashflowId(null);
        setExpenses([]);
      }
    };
    const fetchExpenses = async (id: string) => {
      try {
        const data = await getExpenses({ cashflow_id: id });
        setExpenses(Array.isArray(data) ? data : data.data || []);
      } catch {
        setExpenses([]);
      }
    };
    fetchCashflowAndExpenses();
  }, []);

  // Add expense handler
  const handleAddExpense = async () => {
    if (!cashflowId) {
      toast({ title: "No Cashflow", description: "No cashflow session for today.", variant: "destructive" });
      return;
    }
    if (!expenseParticular.trim() || !expenseAmount.trim() || isNaN(Number(expenseAmount))) {
      toast({ title: "Invalid Input", description: "Enter valid particular and amount.", variant: "destructive" });
      return;
    }
    try {
      await addCashflowExpense({ cashflow_id: cashflowId, particular: expenseParticular, amount: Number(expenseAmount) });
      setExpenseParticular("");
      setExpenseAmount("");
      // Refresh expenses
      const data = await getExpenses({ cashflow_id: cashflowId });
      setExpenses(Array.isArray(data) ? data : data.data || []);
      toast({ title: "Expense Added", description: "Expense added successfully." });
    } catch {
      toast({ title: "Error", description: "Failed to add expense.", variant: "destructive" });
    }
  };

  const getCurrentTime = () => {
    return new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  }

  const generateTransactionId = () => {
    const nextId = cashDrawer.transactions + 1
    return `TXN${nextId.toString().padStart(3, "0")}`
  }

  const addTransaction = (transaction: Omit<Transaction, "id" | "time">) => {
    const newTransaction: Transaction = {
      ...transaction,
      id: generateTransactionId(),
      time: getCurrentTime(),
    }

    setRecentTransactions((prev) => [newTransaction, ...prev.slice(0, 4)])
    setCashDrawer((prev) => ({ ...prev, transactions: prev.transactions + 1 }))
  }

  const handleOpenDrawer = async () => {
    if (!openingAmount || Number.parseFloat(openingAmount) < 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid opening amount.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Call the API to open the drawer
      const res = await createCashflowOpening({ opening: Number(openingAmount), sales: 0 });
      // Store cashflow_id in localStorage for closing
      if (res && res.id) {
        localStorage.setItem("cashflow_id", res.id);
      }

      // Set localStorage flag
      localStorage.setItem("drawerOpen", "true");

      const openingValue = Number.parseFloat(openingAmount);
      setCashDrawer((prev) => ({
        ...prev,
        isOpen: true,
        openingAmount: openingValue,
        currentAmount: openingValue,
        totalSales: 0,
        totalCash: 0,
        totalCard: 0,
        transactions: 0,
        openedAt: getCurrentTime(),
        closedAt: undefined,
      }));

      setRecentTransactions([]);
      setOpeningAmount("");
      setIsOpenDrawerDialogOpen(false);

      toast({
        title: "Cash Drawer Opened",
        description: `Drawer opened with $${openingValue.toFixed(2)} opening amount.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to open cash drawer.",
        variant: "destructive",
      });
    }
  };

  const handleCloseDrawer = async () => {
    const closingTime = getCurrentTime();
    const expectedAmount = cashDrawer.currentAmount;
    const actualAmount = totalCashInDrawer;
    const variance = actualAmount - expectedAmount;

    // Get cashflow_id from localStorage
    const cashflow_id = localStorage.getItem("cashflow_id");
    if (!cashflow_id) {
      toast({
        title: "Error",
        description: "No cashflow session found. Cannot close drawer.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Call the API to close the drawer
      await addCashflowClosing({ cashflow_id, closing: actualAmount });

      setCashDrawer((prev) => ({
        ...prev,
        isOpen: false,
        closedAt: closingTime,
      }));

      // Generate end-of-day report
      const report = {
        openingAmount: cashDrawer.openingAmount,
        closingAmount: actualAmount,
        expectedAmount: expectedAmount,
        variance: variance,
        totalSales: cashDrawer.totalSales,
        totalCash: cashDrawer.totalCash,
        totalCard: cashDrawer.totalCard,
        transactions: cashDrawer.transactions,
        openedAt: cashDrawer.openedAt,
        closedAt: closingTime,
      };
      console.log("End-of-Day Report:", report);

      // Remove localStorage flags
      localStorage.removeItem("drawerOpen");
      localStorage.removeItem("cashflow_id");

      setIsCloseDrawerDialogOpen(false);

      toast({
        title: "Cash Drawer Closed",
        description: `Drawer closed at ${closingTime}. ${variance !== 0 ? `Variance: $${Math.abs(variance).toFixed(2)} ${variance > 0 ? "over" : "short"}` : "Perfect balance!"}`,
        variant: variance === 0 ? "default" : "destructive",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to close cash drawer.",
        variant: "destructive",
      });
    }
  };

  const handleAddCash = () => {
    if (!amount || Number.parseFloat(amount) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount greater than 0.",
        variant: "destructive",
      })
      return
    }

    if (!reason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for adding cash.",
        variant: "destructive",
      })
      return
    }

    const addAmount = Number.parseFloat(amount)

    setCashDrawer((prev) => ({
      ...prev,
      currentAmount: prev.currentAmount + addAmount,
    }))

    addTransaction({
      amount: addAmount,
      type: "Cash",
      customer: "System",
      action: "add",
      reason: reason,
    })

    toast({
      title: "Cash Added",
      description: `$${addAmount.toFixed(2)} added to drawer. Reason: ${reason}`,
    })

    setAmount("")
    setReason("")
    setIsAddCashDialogOpen(false)
  }

  const handleRemoveCash = () => {
    if (!amount || Number.parseFloat(amount) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount greater than 0.",
        variant: "destructive",
      })
      return
    }

    if (!reason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for removing cash.",
        variant: "destructive",
      })
      return
    }

    const removeAmount = Number.parseFloat(amount)

    if (removeAmount > cashDrawer.currentAmount) {
      toast({
        title: "Insufficient Funds",
        description: "Cannot remove more cash than available in drawer.",
        variant: "destructive",
      })
      return
    }

    setCashDrawer((prev) => ({
      ...prev,
      currentAmount: prev.currentAmount - removeAmount,
    }))

    addTransaction({
      amount: removeAmount,
      type: "Cash",
      customer: "System",
      action: "remove",
      reason: reason,
    })

    toast({
      title: "Cash Removed",
      description: `$${removeAmount.toFixed(2)} removed from drawer. Reason: ${reason}`,
    })

    setAmount("")
    setReason("")
    setIsRemoveCashDialogOpen(false)
  }

  const totalCashInDrawer = denominations.reduce((sum, denom) => sum + denom.value * denom.count, 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Cash Register</h1>
          <p className="text-gray-600">Manage cash drawer and daily operations</p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <Clock className="h-3 w-3 mr-1" />
            Shift: 10:00 AM - 6:00 PM
          </Badge>
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            <User className="h-3 w-3 mr-1" />
            Cashier: Sarah Johnson
          </Badge>
          <Badge
            variant="outline"
            className={`${cashDrawer.isOpen ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}
          >
            {cashDrawer.isOpen ? "Drawer Open" : "Drawer Closed"}
          </Badge>
        </div>
      </div>

      {/* Cash Drawer Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Opening Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${cashDrawer.openingAmount.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${cashDrawer.currentAmount.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${cashDrawer.totalSales.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cashDrawer.transactions}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cash Drawer Management */}
        <Card>
          <CardHeader>
            <CardTitle>Cash Drawer Management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-blue-600 mb-1">Cash Sales</div>
                <div className="text-xl font-bold text-blue-900">${cashDrawer.totalCash.toFixed(2)}</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-sm text-purple-600 mb-1">Card Sales</div>
                <div className="text-xl font-bold text-purple-900">${cashDrawer.totalCard.toFixed(2)}</div>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-12"
                onClick={() => setIsOpenDrawerDialogOpen(true)}
                disabled={cashDrawer.isOpen}
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Open Drawer
              </Button>
              <Button
                variant="outline"
                className="h-12"
                onClick={() => setIsAddCashDialogOpen(true)}
                disabled={!cashDrawer.isOpen}
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Add Cash
              </Button>
              <Button
                variant="outline"
                className="h-12"
                onClick={() => setIsRemoveCashDialogOpen(true)}
                disabled={!cashDrawer.isOpen}
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Remove Cash
              </Button>
              <Button
                variant="outline"
                className="h-12"
                onClick={() => setIsCloseDrawerDialogOpen(true)}
                disabled={!cashDrawer.isOpen}
              >
                <Receipt className="h-4 w-4 mr-2" />
                Close Drawer
              </Button>
            </div>

            {Math.abs(totalCashInDrawer - cashDrawer.currentAmount) > 0.01 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm text-yellow-800">
                    Cash count mismatch: Expected ${cashDrawer.currentAmount.toFixed(2)}, Counted $
                    {totalCashInDrawer.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cash Count */}
        <Card>
          <CardHeader>
            <CardTitle>Cash Count</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {denominations.map((denom, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="font-medium w-16">{denom.label}</span>
                    <span className="text-sm text-gray-500">× {denom.count}</span>
                  </div>
                  <span className="font-medium">${(denom.value * denom.count).toFixed(2)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex items-center justify-between font-bold text-lg">
                <span>Total Cash</span>
                <span>${totalCashInDrawer.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentTransactions.length === 0 ? (
              <div className="text-center text-gray-500 py-8">No transactions yet</div>
            ) : (
              recentTransactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`p-2 rounded-full ${transaction.action === "add"
                          ? "bg-green-100"
                          : transaction.action === "remove"
                            ? "bg-red-100"
                            : transaction.type === "Cash"
                              ? "bg-green-100"
                              : "bg-blue-100"
                        }`}
                    >
                      {transaction.type === "Cash" ? (
                        <DollarSign
                          className={`h-4 w-4 ${transaction.action === "add"
                              ? "text-green-600"
                              : transaction.action === "remove"
                                ? "text-red-600"
                                : "text-green-600"
                            }`}
                        />
                      ) : (
                        <CreditCard className="h-4 w-4 text-blue-600" />
                      )}
                    </div>
                    <div>
                      <div className="font-medium">{transaction.id}</div>
                      <div className="text-sm text-gray-500">
                        {transaction.customer} • {transaction.time}
                        {transaction.reason && ` • ${transaction.reason}`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`font-medium ${transaction.action === "remove"
                          ? "text-red-600"
                          : transaction.action === "add"
                            ? "text-green-600"
                            : ""
                        }`}
                    >
                      {transaction.action === "remove" ? "-" : ""}${transaction.amount.toFixed(2)}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {transaction.action
                        ? transaction.action === "add"
                          ? "Add"
                          : transaction.action === "remove"
                            ? "Remove"
                            : transaction.type
                        : transaction.type}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Expenses Card */}
      <Card>
        <CardHeader>
          <CardTitle>Expenses (Today)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex space-x-2">
              <Input
                placeholder="Particular"
                value={expenseParticular}
                onChange={e => setExpenseParticular(e.target.value)}
              />
              <Input
                placeholder="Amount"
                type="number"
                value={expenseAmount}
                onChange={e => setExpenseAmount(e.target.value)}
              />
              <Button onClick={handleAddExpense}>Add Expense</Button>
            </div>
            <Separator />
            <div>
              {expenses.length === 0 ? (
                <div className="text-gray-500">No expenses for today.</div>
              ) : (
                <ul className="divide-y">
                  {expenses.map((exp: any) => (
                    <li key={exp.id} className="flex justify-between py-2">
                      <span>{exp.particular}</span>
                      <span>${Number(exp.amount).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <Dialog open={isOpenDrawerDialogOpen} onOpenChange={setIsOpenDrawerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open Cash Drawer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600">Enter the opening amount for the cash drawer to start a new shift.</p>
            <div>
              <Label htmlFor="opening-amount">Opening Amount</Label>
              <Input
                id="opening-amount"
                type="number"
                step="0.01"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                placeholder="200.00"
              />
            </div>
            <div className="flex space-x-2">
              <Button onClick={handleOpenDrawer} className="flex-1">
                Open Drawer
              </Button>
              <Button variant="outline" onClick={() => setIsOpenDrawerDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddCashDialogOpen} onOpenChange={setIsAddCashDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Cash to Drawer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="add-amount">Amount</Label>
              <Input
                id="add-amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="add-reason">Reason (Required)</Label>
              <Input
                id="add-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Change fund, Till adjustment"
              />
            </div>
            <Button onClick={handleAddCash} className="w-full">
              Add Cash
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isRemoveCashDialogOpen} onOpenChange={setIsRemoveCashDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Cash from Drawer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="remove-amount">Amount</Label>
              <Input
                id="remove-amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="remove-reason">Reason (Required)</Label>
              <Input
                id="remove-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Bank deposit, Petty cash"
              />
            </div>
            <Button onClick={handleRemoveCash} className="w-full">
              Remove Cash
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCloseDrawerDialogOpen} onOpenChange={setIsCloseDrawerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Cash Drawer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600">
              This will close the cash drawer and generate an end-of-day report. Make sure all transactions are
              complete.
            </p>
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span>Opening Amount:</span>
                <span>${cashDrawer.openingAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Sales:</span>
                <span>${cashDrawer.totalSales.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Expected Amount:</span>
                <span>${cashDrawer.currentAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Actual Count:</span>
                <span>${totalCashInDrawer.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Variance:</span>
                <span
                  className={
                    Math.abs(totalCashInDrawer - cashDrawer.currentAmount) < 0.01 ? "text-green-600" : "text-red-600"
                  }
                >
                  ${Math.abs(totalCashInDrawer - cashDrawer.currentAmount).toFixed(2)}
                  {totalCashInDrawer > cashDrawer.currentAmount
                    ? " over"
                    : totalCashInDrawer < cashDrawer.currentAmount
                      ? " short"
                      : ""}
                </span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Transactions:</span>
                <span>{cashDrawer.transactions}</span>
              </div>
            </div>
            <div className="flex space-x-2">
              <Button onClick={handleCloseDrawer} className="flex-1">
                Close Drawer
              </Button>
              <Button variant="outline" onClick={() => setIsCloseDrawerDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}