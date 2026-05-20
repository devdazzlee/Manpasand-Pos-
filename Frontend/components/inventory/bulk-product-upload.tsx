"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Download, FileText, Database } from "lucide-react";
import { ExcelUploadDialog } from "./excel-upload-dialog";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";

export function BulkProductUpload() {
  const [uploadOpen, setUploadOpen] = useState(false);

  const downloadTemplate = async () => {
    try {
      const response = await apiClient.get(`${API_BASE}/products/export/excel`, {
        responseType: "blob",
        params: {
          columns: "product_name,purchase_rate,sales_rate_inc,stock,min_qty,max_qty,category_name,brand_name"
        }
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `product_import_template_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (error) {
      toast.error("Failed to download template");
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
          <Database className="h-6 w-6 text-blue-600" />
          Bulk Product Upload
        </h1>
        <p className="text-gray-500 mt-1">
          Import new products to your catalog using an Excel or CSV file.
        </p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-slate-500" />
            Upload Products
          </CardTitle>
          <CardDescription>
            Download our template, fill in your product details, and upload the file to instantly create new products in your catalog.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 md:p-10 flex flex-col items-center justify-center text-center">
          <div className="h-20 w-20 bg-blue-50 rounded-full flex items-center justify-center mb-6">
            <Upload className="h-10 w-10 text-blue-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Ready to import?</h3>
          <p className="text-gray-500 max-w-md mb-8">
            Ensure your file follows the correct format. If you're unsure, download the template first.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <Button variant="outline" onClick={downloadTemplate} className="w-full sm:w-auto">
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
            <Button onClick={() => setUploadOpen(true)} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700">
              <Upload className="mr-2 h-4 w-4" />
              Start Bulk Upload
            </Button>
          </div>
        </CardContent>
      </Card>

      <ExcelUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        title="Upload Products"
        description="Select your completed Excel file to import products into your catalog."
        onDownloadTemplate={downloadTemplate}
        fields={[
          {
            name: "Product Name",
            required: true,
            description: "The primary name of the product.",
          },
          {
            name: "Purchase Rate",
            required: true,
            description: "The buying price / cost of the product.",
          },
          {
            name: "Sales Rate",
            required: true,
            description: "The selling price (including tax if any).",
          },
          {
            name: "Stock",
            description: "Initial stock quantity (optional).",
          },
        ]}
        onRow={async (row, index) => {
          const res = await apiClient.post(`${API_BASE}/products/import-row`, { row });
          return { ok: true };
        }}
        onBatchComplete={(summary) => {
          if (summary.ok > 0) {
            toast.success(`Successfully imported ${summary.ok} products!`);
          }
          if (summary.failed > 0) {
            toast.error(`Failed to import ${summary.failed} products.`);
          }
        }}
      />
    </div>
  );
}
