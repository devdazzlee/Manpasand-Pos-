"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign,
  CreditCard,
  Clock,
  User,
  Calculator,
  Receipt,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";

interface Transaction {
  id: string;
  time: string;
  amount: number;
  type: "Cash" | "Card";
  customer: string;
  action?: "add" | "remove" | "sale";
  reason?: string;
}

interface CashDrawerState {
  id: string;
  openingAmount: number;
  currentAmount: number;
  totalSales: number;
  transactions: number;
  isOpen: boolean;
  openedAt?: string;
  closedAt?: string;
}

export function CashRegister() {
  const { toast } = useToast();

  const [cashDrawer, setCashDrawer] = useState<CashDrawerState | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>(
    []
  );
  const [loading, setLoading] = useState(true);

  const [isOpenDrawerDialogOpen, setIsOpenDrawerDialogOpen] = useState(false);
  const [isCloseDrawerDialogOpen, setIsCloseDrawerDialogOpen] = useState(false);
  const [isAddCashDialogOpen, setIsAddCashDialogOpen] = useState(false);
  const [isRemoveCashDialogOpen, setIsRemoveCashDialogOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [openingAmount, setOpeningAmount] = useState("");

  // Only for UI cash count, not backend
  const [denominations, setDenominations] = useState([
    { value: 100, label: "Rs 100", count: 0 },
    { value: 50, label: "Rs 50", count: 0 },
    { value: 20, label: "Rs 20", count: 0 },
    { value: 10, label: "Rs 10", count: 0 },
    { value: 5, label: "Rs 5", count: 0 },
    { value: 1, label: "Rs 1", count: 0 },
    { value: 0.25, label: "Quarter", count: 0 },
    { value: 0.1, label: "Dime", count: 0 },
    { value: 0.05, label: "Nickel", count: 0 },
    { value: 0.01, label: "Penny", count: 0 },
  ]);

  // API Endpoints
  async function openDrawer(opening: number, sales: number = 0) {
    try {
      const response = await apiClient.post("/cashflows/opening", { opening, sales });
      return response;
    } catch (error: any) {
      if (error.response?.status === 400 && error.response?.data?.message?.includes('already open')) {
        throw new Error('Drawer is already open for today. Please close it first.');
      }
      throw error;
    }
  }
  
  async function addExpense(particular: string, amount: number) {
    try {
      const response = await apiClient.post("/cashflows/expense", { particular, amount });
      return response;
    } catch (error: any) {
      if (error.response?.status === 400 && error.response?.data?.message?.includes('No open drawer')) {
        throw new Error('No open drawer found. Please open a drawer first.');
      }
      throw error;
    }
  }
  
  async function closeDrawer(cashflow_id: string, closing: number) {
    try {
      const response = await apiClient.post("/cashflows/closing", { cashflow_id, closing });
      return response;
    } catch (error: any) {
      throw error;
    }
  }
  
  async function getTodayDrawer() {
    try {
    const today = new Date().toISOString().slice(0, 10);
      console.log('getTodayDrawer - sending date:', today); // Debug log
      const response = await apiClient.get(`/cashflows/by-date?date=${today}`);
      return response;
    } catch (error: any) {
      throw error;
    }
  }
  
  async function getTodayExpenses() {
    try {
    const today = new Date().toISOString().slice(0, 10);
      const response = await apiClient.get(`/cashflows/expenses?date=${today}`);
      return response;
    } catch (error: any) {
      throw error;
    }
  }

  // Debug function to test API integration
  const debugAPI = async () => {
    try {
      console.log('Testing API integration...');
      
      // Test debug endpoint
      console.log('Testing debug endpoint...');
      const debugRes = await apiClient.get('/cashflows/debug');
      console.log('Debug response:', debugRes.data);
      
      // Test getTodayDrawer
      console.log('Testing getTodayDrawer...');
      const drawerRes = await getTodayDrawer();
      console.log('Drawer response:', drawerRes.data);
      
      // Test getTodayExpenses
      console.log('Testing getTodayExpenses...');
      const expensesRes = await getTodayExpenses();
      console.log('Expenses response:', expensesRes.data);
      
      // Debug current state
      console.log('Current cashDrawer state:', cashDrawer);
      console.log('Is drawer open?', cashDrawer?.isOpen);
      
      toast({
        title: "API Test Complete",
        description: "Check console for API response details",
      });
    } catch (error: any) {
      console.error('API Test Error:', error);
      toast({
        title: "API Test Failed",
        description: error.message || "Check console for details",
        variant: "destructive",
      });
    }
  };

  // Fetch drawer and expenses
  const fetchDrawerAndExpenses = async () => {
    setLoading(true);
    try {
      const drawerRes = await getTodayDrawer();
      console.log('Drawer response:', drawerRes.data); // Debug log
      
      // Handle the response structure correctly
      if (drawerRes.data.success && drawerRes.data.data) {
        const result = drawerRes.data.data;
        console.log('Result from API:', result); // Debug log
        
        if (result.exists && result.data) {
          const cashFlowData = result.data;
          console.log('CashFlow data:', cashFlowData); // Debug log
          console.log('Status from API:', cashFlowData.status); // Debug log
          console.log('Status comparison:', cashFlowData.status === "OPEN"); // Debug log
          
          const drawerState = {
            id: cashFlowData.id,
            openingAmount: Number(cashFlowData.opening),
            currentAmount: cashFlowData.closing ? Number(cashFlowData.closing) : Number(cashFlowData.opening),
            totalSales: Number(cashFlowData.sales),
            transactions: cashFlowData.expenses?.length || 0,
            isOpen: cashFlowData.status === "OPEN",
            openedAt: cashFlowData.opened_at,
            closedAt: cashFlowData.closed_at,
          };
          console.log('Setting cash drawer state:', drawerState); // Debug log
          console.log('isOpen will be set to:', drawerState.isOpen); // Debug log
          setCashDrawer(drawerState);
          
          // Use expenses from the drawer response
          if (cashFlowData.expenses) {
            console.log('Using expenses from drawer response:', cashFlowData.expenses.length); // Debug log
            setRecentTransactions(
              cashFlowData.expenses.map((exp: any) => ({
                id: exp.id,
                time: new Date(exp.created_at).toLocaleTimeString(),
                amount: Number(exp.amount),
                type: "Cash" as const,
                customer: "System",
                action: "add" as const,
                reason: exp.particular,
              }))
            );
          } else {
            setRecentTransactions([]);
          }
        } else {
          console.log('No drawer exists, setting to null'); // Debug log
          setCashDrawer(null);
          setRecentTransactions([]);
        }
      } else {
        console.log('No success or no data in response'); // Debug log
        setCashDrawer(null);
        setRecentTransactions([]);
      }
    } catch (err: any) {
      console.error('Error fetching drawer data:', err);
      setCashDrawer(null);
      setRecentTransactions([]);
      
      // Show error toast for specific errors
      if (err.response?.status === 400 && err.response?.data?.message?.includes('Branch not found')) {
        toast({
          title: "Authentication Error",
          description: "Please log in again. Branch information is missing.",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrawerAndExpenses();
    // eslint-disable-next-line
  }, []);

  // Debug effect to log cashDrawer changes
  useEffect(() => {
    console.log('CashDrawer state changed:', cashDrawer);
    console.log('Is drawer open?', cashDrawer?.isOpen);
  }, [cashDrawer]);

  // UI logic
  const totalCashInDrawer = denominations.reduce(
    (sum, denom) => sum + denom.value * denom.count,
    0
  );

  // Handlers
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
      const openingValue = Number.parseFloat(openingAmount);
      console.log('Opening drawer with amount:', openingValue); // Debug log
      const response = await openDrawer(openingValue, 0);
      console.log('Open drawer response:', response); // Debug log
      
      toast({
        title: "Cash Drawer Opened",
        description: `Drawer opened with Rs ${openingValue.toFixed(
          2
        )} opening amount.`,
      });
      setIsOpenDrawerDialogOpen(false);
      setOpeningAmount("");
      await fetchDrawerAndExpenses();
    } catch (err: any) {
      console.error('Error opening drawer:', err); // Debug log
      toast({
        title: "Error",
        description: err.message || err.response?.data?.message || "Failed to open drawer",
        variant: "destructive",
      });
    }
  };

  const handleCloseDrawer = async () => {
    if (!cashDrawer) return;
    try {
      await closeDrawer(cashDrawer.id, totalCashInDrawer);
      toast({ title: "Cash Drawer Closed", description: `Drawer closed successfully.` });
      setIsCloseDrawerDialogOpen(false);
      await fetchDrawerAndExpenses();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || err.response?.data?.message || "Failed to close drawer",
        variant: "destructive",
      });
    }
  };

  const handleAddCash = async () => {
    if (!amount || Number.parseFloat(amount) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount greater than 0.",
        variant: "destructive",
      });
      return;
    }
    if (!reason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for adding cash.",
        variant: "destructive",
      });
      return;
    }
    try {
      await addExpense(reason, Number.parseFloat(amount));
      toast({
        title: "Cash Added",
        description: `Rs ${Number.parseFloat(amount).toFixed(
          2
        )} added to drawer. Reason: ${reason}`,
      });
      setIsAddCashDialogOpen(false);
      setAmount("");
      setReason("");
      await fetchDrawerAndExpenses();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || err.response?.data?.message || "Failed to add cash",
        variant: "destructive",
      });
    }
  };

  // Remove cash is not a backend feature yet, so just show a toast
  const handleRemoveCash = () => {
    toast({
      title: "Not Implemented",
      description: "Remove cash is not implemented in backend.",
      variant: "destructive",
    });
  };

  // UI rendering
  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Cash Register</h1>
          <p className="text-gray-600">
            Manage cash drawer and daily operations
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700 border-green-200"
          >
            <Clock className="h-3 w-3 mr-1" />
            Shift: 10:00 AM - 6:00 PM
          </Badge>
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-200"
          >
            <User className="h-3 w-3 mr-1" />
            Cashier: Sarah Johnson
          </Badge>
          <Badge
            variant="outline"
            className={`${
              cashDrawer?.isOpen
                ? "bg-green-50 text-green-700 border-green-200"
                : "bg-red-50 text-red-700 border-red-200"
            }`}
          >
            {cashDrawer?.isOpen ? "Drawer Open" : "Drawer Closed"}
          </Badge>
          <Badge
            variant="outline"
            className="bg-gray-50 text-gray-700 border-gray-200 text-xs"
          >
            Debug: {cashDrawer ? `ID: ${cashDrawer.id}, Status: ${cashDrawer.isOpen ? 'OPEN' : 'CLOSED'}` : 'No Drawer'}
          </Badge>
          <Badge
            variant="outline"
            className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs"
          >
            Buttons: Add={!cashDrawer?.isOpen ? 'DISABLED' : 'ENABLED'}, Remove={!cashDrawer?.isOpen ? 'DISABLED' : 'ENABLED'}, Close={!cashDrawer?.isOpen ? 'DISABLED' : 'ENABLED'}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={debugAPI}
            className="text-xs"
          >
            Debug API
          </Button>
        </div>
      </div>

      {/* Cash Drawer Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Opening Amount
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              Rs {cashDrawer?.openingAmount.toFixed(2) || "0.00"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Current Amount
            </CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              Rs {cashDrawer?.currentAmount.toFixed(2) || "0.00"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              Rs {cashDrawer?.totalSales.toFixed(2) || "0.00"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {cashDrawer?.transactions || 0}
            </div>
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
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-12"
                onClick={() => setIsOpenDrawerDialogOpen(true)}
                disabled={!!cashDrawer?.isOpen}
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Open Drawer
              </Button>
              <Button
                variant="outline"
                className="h-12"
                onClick={() => setIsAddCashDialogOpen(true)}
                disabled={!cashDrawer?.isOpen}
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Add Cash
              </Button>
              <Button
                variant="outline"
                className="h-12"
                onClick={() => setIsRemoveCashDialogOpen(true)}
                disabled={!cashDrawer?.isOpen}
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Remove Cash
              </Button>
              <Button
                variant="outline"
                className="h-12"
                onClick={() => setIsCloseDrawerDialogOpen(true)}
                disabled={!cashDrawer?.isOpen}
              >
                <Receipt className="h-4 w-4 mr-2" />
                Close Drawer
              </Button>
            </div>
            {cashDrawer &&
              Math.abs(totalCashInDrawer - cashDrawer.currentAmount) > 0.01 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm text-yellow-800">
                      Cash count mismatch: Expected Rs 
                      {cashDrawer.currentAmount.toFixed(2)}, Counted Rs 
                      {totalCashInDrawer.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
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
              <div className="text-center text-gray-500 py-8">
                No transactions yet
              </div>
            ) : (
              recentTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`p-2 rounded-full ${
                        transaction.action === "add"
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
                          className={`h-4 w-4 ${
                            transaction.action === "add"
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
                      className={`font-medium ${
                        transaction.action === "remove"
                          ? "text-red-600"
                          : transaction.action === "add"
                          ? "text-green-600"
                          : ""
                      }`}
                    >
                      {transaction.action === "remove" ? "-" : ""}
                      {transaction.amount.toFixed(2)}
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

      {/* Dialogs */}
      <Dialog
        open={isOpenDrawerDialogOpen}
        onOpenChange={setIsOpenDrawerDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open Cash Drawer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600">
              Enter the opening amount for the cash drawer to start a new shift.
            </p>
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
              <Button
                variant="outline"
                onClick={() => setIsOpenDrawerDialogOpen(false)}
                className="flex-1"
              >
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

      <Dialog
        open={isRemoveCashDialogOpen}
        onOpenChange={setIsRemoveCashDialogOpen}
      >
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

      <Dialog
        open={isCloseDrawerDialogOpen}
        onOpenChange={setIsCloseDrawerDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Cash Drawer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600">
              This will close the cash drawer and generate an end-of-day report.
              Make sure all transactions are complete.
            </p>
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span>Opening Amount:</span>
                <span>Rs {cashDrawer?.openingAmount.toFixed(2) || "0.00"}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Sales:</span>
                <span>Rs {cashDrawer?.totalSales.toFixed(2) || "0.00"}</span>
              </div>
              <div className="flex justify-between">
                <span>Expected Amount:</span>
                <span>Rs {cashDrawer?.currentAmount.toFixed(2) || "0.00"}</span>
              </div>
              <div className="flex justify-between">
                <span>Actual Count:</span>
                <span>Rs {totalCashInDrawer.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Variance:</span>
                <span
                  className={
                    cashDrawer &&
                    Math.abs(totalCashInDrawer - cashDrawer.currentAmount) <
                      0.01
                      ? "text-green-600"
                      : "text-red-600"
                  }
                >
                  Rs 
                  {cashDrawer
                    ? Math.abs(
                        totalCashInDrawer - cashDrawer.currentAmount
                      ).toFixed(2)
                    : "0.00"}
                  {cashDrawer && totalCashInDrawer > cashDrawer.currentAmount
                    ? " over"
                    : cashDrawer && totalCashInDrawer < cashDrawer.currentAmount
                    ? " short"
                    : ""}
                </span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Transactions:</span>
                <span>{cashDrawer?.transactions || 0}</span>
              </div>
            </div>
            <div className="flex space-x-2">
              <Button onClick={handleCloseDrawer} className="flex-1">
                Close Drawer
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsCloseDrawerDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
