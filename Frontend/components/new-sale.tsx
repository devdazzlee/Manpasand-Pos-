"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useLoading } from "@/hooks/use-loading";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  DollarSign,
  Scan,
  RefreshCw,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { usePosData } from "@/hooks/use-pos-data";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
  categoryId: string;
  available_stock?: number;
  current_stock?: number;
  reserved_stock?: number;
  minimum_stock?: number;
  maximum_stock?: number;
}

export function NewSale() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [lastTransactionId, setLastTransactionId] = useState<string | null>(
    null
  );
  const { loading: paymentLoading, withLoading: withPaymentLoading } =
    useLoading();
  const [scanLoading, setScanLoading] = useState(false);
  const { toast } = useToast();
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [quickAddDialogOpen, setQuickAddDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quickAddQuantity, setQuickAddQuantity] = useState("1");
  const [quickAddTotalPrice, setQuickAddTotalPrice] = useState("");

  // Global store with custom hook
  const {
    products,
    categories,
    customers,
    productsLoading,
    categoriesLoading,
    customersLoading,
    isAnyLoading,
    refreshAllData,
    fetchProducts,
    fetchCategories,
    fetchCustomers,
  } = usePosData();
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch data from global store (will use cache if available)
        await Promise.all([
          fetchProducts(),
          fetchCategories(),
          fetchCustomers(),
        ]);
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Failed to load data",
          description: "Could not fetch data from server",
        });
      }
    };
    fetchData();
  }, [fetchProducts, fetchCategories, fetchCustomers, toast]);

  const filteredProducts = products.filter((product) => {
    const matchesCategory =
      selectedCategory === "all" || product.categoryId === selectedCategory;
    const matchesSearch = product.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const addToCart = async (product: Product, quantity: number = 1) => {
    // For testing: Allow negative sales (stock can go below 0)
    // Comment out stock validation for testing purposes
    /*
    const availableStock = product.available_stock ?? product.stock
    const currentQuantity = cart.find((item) => item.id === product.id)?.quantity || 0
    if (currentQuantity >= availableStock) {
      toast({
        variant: "destructive",
        title: "Insufficient Stock",
        description: `Only ${availableStock} units available for ${product.name}`,
      })
      return
    }
    */

    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    const existingItem = cart.find((item) => item.id === product.id);
    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          id: product.id,
          name: product.name,
          price: product.price,
          quantity: quantity,
          category: product.category,
        },
      ]);
    }

    toast({
      className: "absolute top-2",
      title: "Item Added",
      description: `${product.name} (${quantity}) added to cart`,
    });
  };

  const updateQuantity = (id: string, change: number) => {
    const item = cart.find((item) => item.id === id);
    const product = products.find((p) => p.id === id);

    // For testing: Allow negative sales (stock can go below 0)
    // Comment out stock validation for testing purposes
    /*
    if (item && product) {
      const newQuantity = item.quantity + change
      const availableStock = product.available_stock ?? product.stock

      if (newQuantity > availableStock) {
        toast({
          variant: "destructive",
          title: "Insufficient Stock",
          description: `Only ${availableStock} units available`,
        })
        return
      }
    }
    */

    setCart(
      cart
        .map((item) => {
          if (item.id === id) {
            const newQuantity = Number(item.quantity) + Number(change);
            return newQuantity > 0 ? { ...item, quantity: newQuantity } : item;
          }
          return item;
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const updateQuantityManual = (id: string, newQuantity: number) => {
    // Validate quantity is positive
    if (newQuantity <= 0) {
      // Remove item if quantity is 0 or negative
      setCart(cart.filter((item) => item.id !== id));
      return;
    }

    setCart(
      cart.map((item) => {
        if (item.id === id) {
          return { ...item, quantity: Number(newQuantity) };
        }
        return item;
      })
    );
  };

  const removeFromCart = (id: string) => {
    const item = cart.find((item) => item.id === id);
    setCart(cart.filter((item) => item.id !== id));

    if (item) {
      toast({
        title: "Item Removed",
        description: `${item.name} removed from cart`,
      });
    }
  };

  const clearCart = () => {
    setCart([]);
    toast({
      title: "Cart Cleared",
      description: "All items removed from cart",
    });
  };

  const subtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const total = subtotal;

  const generateTransactionId = () => {
    return `TXN${Date.now().toString().slice(-6)}`;
  };

  const generateReceiptData = (
    transactionId: string,
    paymentMethod: string
  ) => {
    return {
      transactionId,
      timestamp: new Date().toISOString(),
      items: cart,
      subtotal,
      total,
      paymentMethod,
      cashier: "Admin User",
      store: "MANPASAND Store #001",
    };
  };

  const printReceipt = (receiptContent: string) => {
    // Open window in direct response to a user click
    const printWindow = window.open("", "_blank", "width=600,height=600");
    if (!printWindow) return;

    // Write your receipt HTML
    printWindow.document.open();
    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt</title>
          <style>
            /* optional: make it look nice on paper */
            @media print {
            @page {
              size: auto; /* Let the content determine the height */
              margin: 0; 
            }
            body {
              margin: 0;
              padding: 10px; /* Add a little padding for looks */
            }
          }


          body { 
            font-family: monospace; 
            white-space: pre; /* Keeps your formatting */
          }
          </style>
        </head>
        <body>
          ${receiptContent}
        </body>
      </html>
    `);
    printWindow.document.close();

    // Wait for the document to finish loading, then print & close
    printWindow.onload = () => {
      printWindow.focus(); // Bring it to front
      printWindow.print(); // Open print dialog
      // printWindow.close();      // Close the tab/window when done
    };
  };

  const downloadReceipt = (receiptData: any) => {
    const receiptContent = `
MANPASAND POS SYSTEM
${receiptData.store}
================================

Transaction ID: ${receiptData.transactionId}
Date: ${new Date(receiptData.timestamp).toLocaleString()}
Cashier: ${receiptData.cashier}

ITEMS:
${receiptData.items
  .map(
    (item: CartItem) =>
      `${item.name} x${item.quantity} @ Rs ${item.price.toFixed(2)} = Rs ${(
        item.price * item.quantity
      ).toFixed(2)}`
  )
  .join("\n")}

--------------------------------
Subtotal: Rs ${receiptData.subtotal.toFixed(2)}
TOTAL: Rs ${receiptData.total.toFixed(2)}

Payment Method: ${receiptData.paymentMethod}

Thank you for shopping with us!
================================
    `;

    const blob = new Blob([receiptContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt-${receiptData.transactionId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Print logic
    printReceipt(receiptContent);
  };

  const handlePayment = async (method: string) => {
    await withPaymentLoading(async () => {
      try {
        // Prepare items for API
        const saleItems = cart.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          price: item.price,
        }));

        // Get branchId from localStorage (key: 'branch')
        let branchId = "";
        try {
          const branchStr = localStorage.getItem("branch");
          console.log(branchStr);
          if (branchStr) {
            const branchObj = branchStr;
            branchId = branchStr || "";
          }
        } catch (e) {
          branchId = "";
        }

        // Prepare payload
        const payload: any = {
          items: saleItems,
          paymentMethod: method === "Cash" ? "CASH" : "CARD",
          branchId,
        };
        if (selectedCustomer) {
          payload.customerId = selectedCustomer;
        }

        // Call create sale API
        await apiClient.post("/sale", payload);

        // (You can keep your local transaction/receipt logic if you want)
        const transactionId = generateTransactionId();
        const receiptData = generateReceiptData(transactionId, method);

        // Save transaction to local storage (simulate database)
        const transactions = JSON.parse(
          localStorage.getItem("transactions") || "[]"
        );
        transactions.push(receiptData);
        localStorage.setItem("transactions", JSON.stringify(transactions));

        setLastTransactionId(transactionId);
        setCart([]);
        setPaymentDialogOpen(false);

        toast({
          title: "Payment Successful",
          description: `Transaction ${transactionId} completed via ${method}`,
        });

        // Auto-download receipt
        setTimeout(() => {
          downloadReceipt(receiptData);
          toast({
            title: "Receipt Downloaded",
            description: "Receipt has been saved to your downloads",
          });
        }, 1000);
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Payment Failed",
          description: "There was an error processing your payment",
        });
      }
    });
  };

  const handleBarcodeScan = async () => {
    setScanLoading(true);
    try {
      // Simulate barcode scanning
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Simulate finding a product by barcode
      const randomProduct =
        products[Math.floor(Math.random() * products.length)];
      await addToCart(randomProduct);

      toast({
        title: "Barcode Scanned",
        description: `Found ${randomProduct.name}`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Scan Failed",
        description: "Could not read barcode",
      });
    } finally {
      setScanLoading(false);
    }
  };

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setQuickAddQuantity("1");
    setQuickAddDialogOpen(true);
  };

  const handleQuickAdd = async () => {
    if (!selectedProduct) return;
    const quantity = parseFloat(quickAddQuantity);
    if (isNaN(quantity) || quantity <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Quantity",
        description: "Please enter a valid quantity greater than 0",
      });
      return;
    }

    await addToCart(selectedProduct, quantity);
    setQuickAddDialogOpen(false);
    setSelectedProduct(null);
    setQuickAddQuantity("1");
    setQuickAddTotalPrice("");
  };

  const handleCategoryChange = async (categoryId: string) => {
    setSelectedCategory(categoryId);
    // No need to set loading state as we're using cached data
  };

  return (
    <div className="flex h-screen">
      {/* Products Section */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">New Sales</h1>
              <p className="text-sm text-orange-600 font-medium">
                ⚠️ TESTING MODE: Negative sales allowed
              </p>
              {lastTransactionId && (
                <p className="text-sm text-green-600">
                  Last transaction: {lastTransactionId}
                </p>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <LoadingButton
                variant="outline"
                size="icon"
                loading={isAnyLoading}
                onClick={refreshAllData}
                title="Refresh Data"
              >
                <RefreshCw className="h-4 w-4" />
              </LoadingButton>
              {cart.length > 0 && (
                <Button variant="outline" onClick={clearCart}>
                  Clear Cart
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <LoadingButton
              variant="outline"
              size="icon"
              loading={scanLoading}
              onClick={handleBarcodeScan}
            >
              <Scan className="h-4 w-4" />
            </LoadingButton>
          </div>
        </div>

        {/* Categories */}
        <div className="flex space-x-2 mb-6 overflow-x-auto">
          {categories.map((category) => (
            <Button
              key={category.id}
              variant={selectedCategory === category.id ? "default" : "outline"}
              onClick={() => handleCategoryChange(category.id)}
              className="whitespace-nowrap"
              disabled={productsLoading}
            >
              {productsLoading && selectedCategory === category.id && (
                <LoadingSpinner size="sm" className="mr-2" />
              )}
              {category.name}
            </Button>
          ))}
        </div>

        <div className="mb-4 max-w-xs bg-white text-black">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Customer (optional)
          </label>
          <select
            className="w-full border rounded px-3 py-2"
            style={{ color: "black", backgroundColor: "white" }}
            value={selectedCustomer ?? ""}
            onChange={(e) => setSelectedCustomer(e.target.value || null)}
          >
            <option value="">Select customer</option>
            {customers.map((customer: any) => (
              <option
                className="text-black"
                key={customer.id}
                value={customer.id}
              >
                <span className="text-black">{customer.email}</span>
                asdasdas
              </option>
            ))}
          </select>
        </div>

        {/* Products Grid */}
        {productsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="aspect-square bg-gray-200 rounded-lg mb-3" />
                  <div className="h-4 bg-gray-200 rounded mb-2" />
                  <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 col-span-full">
            <span className="text-2xl mb-2">🛒</span>
            <p className="text-gray-500 text-lg">
              No products found in this category.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredProducts.map((product) => {
              const cartItem = cart.find((item) => item.id === product.id);
              const currentStock = product.available_stock ?? product.stock;
              const isOutOfStock = currentStock <= 0;
              const isLowStock = currentStock <= 5 && currentStock > 0;

              return (
                <Card
                  key={product.id}
                  className={`cursor-pointer hover:shadow-md transition-shadow`}
                  onClick={() => handleProductClick(product)}
                >
                  <CardContent className="p-4">
                    <div className="aspect-square bg-gray-100 rounded-lg mb-3 flex items-center justify-center relative">
                      <span className="text-2xl">🛒</span>
                      {cartItem && (
                        <Badge className="absolute -top-2 -right-2 bg-blue-600">
                          {cartItem.quantity.toFixed(2)}
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-medium text-gray-900 mb-1">
                      {product.name}
                    </h3>
                    <p className="text-lg font-bold text-blue-600">
                      Rs {product.price.toFixed(2)}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <p
                        className={`text-sm ${
                          isLowStock ? "text-yellow-600" : "text-gray-500"
                        }`}
                      >
                        Stock:{" "}
                        {(product.available_stock ?? product.stock).toFixed(2)}
                      </p>
                      {isLowStock && (
                        <Badge
                          variant="secondary"
                          className="bg-yellow-100 text-yellow-800"
                        >
                          Low Stock
                        </Badge>
                      )}
                    </div>
                    <Badge variant="secondary" className="mt-2">
                      {product.category}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart Section */}
      <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            Cart ({cart.length} items •{" "}
            {cart.reduce((sum, item) => sum + item.quantity, 0).toFixed(2)}{" "}
            total qty)
          </h2>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {cart.length === 0 ? (
            <div className="text-center text-gray-500 mt-8">
              <p>Your cart is empty</p>
              <p className="text-sm">Add products to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{item.name}</h4>
                    <p className="text-sm text-gray-500">
                      Rs {item.price.toFixed(2)} each
                    </p>
                    <p className="text-sm font-medium">
                      Rs {(item.price * item.quantity).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateQuantity(item.id, -1)}
                      className="h-8 w-8 p-0"
                    >
                      <Minus className="h-3 w-3" />
                    </Button>

                    <div className="flex flex-col items-center">
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          if (!isNaN(value)) {
                            updateQuantityManual(item.id, value);
                          }
                        }}
                        className="w-16 h-8 text-center text-sm"
                        min="0"
                        step="0.01"
                        placeholder="0"
                      />
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateQuantity(item.id, 1)}
                      className="h-8 w-8 p-0"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => removeFromCart(item.id)}
                      className="text-red-600 hover:text-red-700 h-8 w-8 p-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="p-6 border-t border-gray-200">
            <div className="space-y-2 mb-4">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>Rs {subtotal.toFixed(2)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold text-lg">
                <span>Total:</span>
                <span>Rs {total.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <LoadingButton
                className="w-full"
                onClick={() => setPaymentDialogOpen(true)}
                loading={paymentLoading}
                disabled={cart.length === 0}
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Process Payment
              </LoadingButton>
            </div>
          </div>
        )}
      </div>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex justify-between mb-2">
                <span>Total Amount:</span>
                <span className="font-bold text-xl">Rs {total.toFixed(2)}</span>
              </div>
              <div className="text-sm text-gray-600">{cart.length} item(s)</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <LoadingButton
                onClick={() => handlePayment("Cash")}
                className="h-16"
                loading={paymentLoading}
                loadingText="Processing..."
              >
                <DollarSign className="h-6 w-6 mr-2" />
                Cash
              </LoadingButton>
              <LoadingButton
                onClick={() => handlePayment("Card")}
                variant="outline"
                className="h-16"
                loading={paymentLoading}
                loadingText="Processing..."
              >
                <CreditCard className="h-6 w-6 mr-2" />
                Card
              </LoadingButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Add Dialog */}
      <Dialog open={quickAddDialogOpen} onOpenChange={setQuickAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Quantity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex justify-between mb-2">
                <span>Product:</span>
                <span className="font-medium">{selectedProduct?.name}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span>Price:</span>
                <span className="font-medium">
                  Rs {selectedProduct?.price.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between mb-2">
                <span>Current Stock:</span>
                <span className="font-medium">
                  {selectedProduct?.available_stock ?? selectedProduct?.stock}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Quantity</label>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const currentQty = parseFloat(quickAddQuantity) || 0;
                    setQuickAddQuantity(
                      currentQty - 1 > 0 ? (currentQty - 1).toFixed(2) : ""
                    );
                    setQuickAddTotalPrice(""); // Clear total price if manually changing quantity
                  }}
                  className="h-10 w-10 p-0"
                >
                  <Minus className="h-4 w-4" />
                </Button>

                <Input
                  type="number"
                  value={quickAddQuantity}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!isNaN(value)) {
                      setQuickAddQuantity(value.toString());
                      setQuickAddTotalPrice(""); // Clear total price if manually changing quantity
                    } else {
                      setQuickAddQuantity("");
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleQuickAdd();
                    }
                  }}
                  className="flex-1 text-center"
                  min="0"
                  step="0.01"
                  placeholder="Enter quantity"
                />

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const currentQty = parseFloat(quickAddQuantity) || 0;
                    setQuickAddQuantity((currentQty + 1).toFixed(2));
                    setQuickAddTotalPrice(""); // Clear total price if manually changing quantity
                  }}
                  className="h-10 w-10 p-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                You can enter decimal values like 0.5, 0.25, etc.
              </p>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap gap-1 mt-2">
                {[0.25, 0.5, 0.75, 1, 2, 5].map((preset) => (
                  <Button
                    key={preset}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuickAddQuantity(preset.toString());
                      setQuickAddTotalPrice("");
                    }}
                    className="text-xs px-2 py-1 h-6"
                  >
                    {preset}
                  </Button>
                ))}
              </div>
            </div>
            {/* Total Price Input */}
            <div className="space-y-2 mt-2">
              <label className="text-sm font-medium">Total Price</label>
              <Input
                type="number"
                value={quickAddTotalPrice}
                onChange={(e) => {
                  setQuickAddTotalPrice(e.target.value);
                  const price = parseFloat(e.target.value);
                  if (
                    !isNaN(price) &&
                    selectedProduct &&
                    selectedProduct.price > 0
                  ) {
                    const qty = price / selectedProduct.price;
                    setQuickAddQuantity(qty > 0 ? qty.toFixed(2) : "");
                  }
                }}
                className="flex-1 text-center"
                min="0"
                step="0.01"
                placeholder="Enter total price"
              />
              <p className="text-xs text-gray-500">
                Enter the total price you want to spend. Quantity will be
                calculated automatically.
              </p>
            </div>

            <div className="flex space-x-2">
              <Button onClick={handleQuickAdd} className="flex-1">
                <Plus className="h-4 w-4 mr-2" />
                Add to Cart
              </Button>
              <Button
                onClick={() => setQuickAddDialogOpen(false)}
                variant="outline"
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
