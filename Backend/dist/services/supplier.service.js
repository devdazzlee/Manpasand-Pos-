"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupplierService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const helpers_1 = require("../utils/helpers");
const catalog_defaults_service_1 = require("./catalog-defaults.service");
const purchaseInvoice_service_1 = require("./purchaseInvoice.service");
class SupplierService {
    async createSupplier(data) {
        const existingSupplier = await client_1.prisma.supplier.findFirst({
            where: { name: data.name },
        });
        if (existingSupplier)
            throw new apiError_1.AppError(400, 'Supplier already exists');
        const generateCode = () => {
            const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let suffix = '';
            for (let i = 0; i < 6; i++) {
                suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
            }
            return `SUP-${suffix}`;
        };
        let newCode = generateCode();
        for (let attempt = 0; attempt < 5; attempt++) {
            const clash = await client_1.prisma.supplier.findUnique({ where: { code: newCode } });
            if (!clash)
                break;
            newCode = generateCode();
        }
        const supplier = await client_1.prisma.supplier.create({
            data: {
                ...data,
                code: newCode,
                status: data.status ?? 'active',
            },
        });
        return supplier;
    }
    async getSupplierById(id) {
        const supplier = await client_1.prisma.supplier.findUnique({
            where: { id },
            include: {
                products: {
                    select: { id: true, name: true, sku: true },
                },
                _count: {
                    select: { purchases: true, payments: true, products: true },
                },
            },
        });
        if (!supplier)
            throw new apiError_1.AppError(404, 'Supplier not found');
        return supplier;
    }
    async updateSupplier(id, data) {
        await this.getSupplierById(id);
        return client_1.prisma.supplier.update({
            where: { id },
            data,
        });
    }
    async toggleSupplierStatus(id) {
        const supplier = await this.getSupplierById(id);
        const newStatus = supplier.status === 'active' ? 'inactive' : 'active';
        return client_1.prisma.supplier.update({
            where: { id },
            data: { status: newStatus },
        });
    }
    async deleteSupplier(id) {
        const supplier = await client_1.prisma.supplier.findUnique({ where: { id } });
        if (!supplier)
            throw new apiError_1.AppError(404, 'Supplier not found');
        await client_1.prisma.$transaction(async (tx) => {
            const defaultSupplierId = await catalog_defaults_service_1.catalogDefaults.ensureDefaultSupplier(tx, id);
            await tx.product.updateMany({
                where: { supplier_id: id },
                data: { supplier_id: defaultSupplierId },
            });
            await tx.purchaseOrder.updateMany({
                where: { supplier_id: id },
                data: { supplier_id: defaultSupplierId },
            });
            await tx.purchase.updateMany({
                where: { supplier_id: id },
                data: { supplier_id: defaultSupplierId },
            });
            await tx.supplierPayment.deleteMany({ where: { supplier_id: id } });
            await tx.supplier.delete({ where: { id } });
        }, catalog_defaults_service_1.catalogDeleteOptions);
        return { message: 'Supplier deleted successfully' };
    }
    async listSuppliers({ page = 1, limit = 10, search, is_active, display_on_pos, fetch_all, }) {
        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                { phone_number: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (is_active !== undefined) {
            where.is_active = is_active;
        }
        if (display_on_pos !== undefined) {
            where.display_on_pos = display_on_pos;
        }
        const take = fetch_all ? Math.min(100, Math.max(limit, 1)) : limit;
        const skip = fetch_all ? 0 : (page - 1) * limit;
        const [suppliers, total] = await Promise.all([
            client_1.prisma.supplier.findMany({
                where,
                skip,
                take,
                orderBy: { created_at: 'desc' },
                include: {
                    _count: {
                        select: { products: true, purchases: true },
                    },
                },
            }),
            client_1.prisma.supplier.count({ where }),
        ]);
        return {
            data: suppliers.map((s) => ({
                ...s,
                product_count: s._count.products,
                purchase_count: s._count.purchases,
                _count: undefined,
            })),
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    async getSupplierPurchases(supplierId) {
        await this.getSupplierById(supplierId);
        const purchases = await client_1.prisma.purchase.findMany({
            where: { supplier_id: supplierId },
            include: {
                product: { select: { id: true, name: true, sku: true } },
                warehouse_branch: { select: { id: true, name: true } },
            },
            orderBy: { purchase_date: 'desc' },
        });
        const productMap = new Map();
        let totalQuantity = 0;
        let totalValue = 0;
        for (const p of purchases) {
            const qty = (0, helpers_1.asNumber)(p.quantity);
            const cost = (0, helpers_1.asNumber)(p.cost_price);
            const line = qty * cost;
            totalQuantity += qty;
            totalValue += line;
            const pid = p.product_id;
            const existing = productMap.get(pid);
            if (existing) {
                existing.totalQty += qty;
                existing.totalValue += line;
                existing.purchaseCount += 1;
            }
            else {
                productMap.set(pid, {
                    productId: pid,
                    productName: p.product?.name || 'Unknown',
                    sku: p.product?.sku || null,
                    totalQty: qty,
                    totalValue: line,
                    purchaseCount: 1,
                });
            }
        }
        return {
            purchases: purchases.map((p) => ({
                id: p.id,
                purchase_date: p.purchase_date,
                quantity: (0, helpers_1.asNumber)(p.quantity),
                cost_price: (0, helpers_1.asNumber)(p.cost_price),
                line_total: (0, helpers_1.asNumber)(p.quantity) * (0, helpers_1.asNumber)(p.cost_price),
                invoice_ref: p.invoice_ref,
                notes: p.notes,
                delivery_status: p.delivery_status,
                product: p.product,
                warehouse_branch: p.warehouse_branch,
            })),
            productSummary: Array.from(productMap.values()).sort((a, b) => b.totalValue - a.totalValue),
            summary: {
                purchaseCount: purchases.length,
                productCount: productMap.size,
                totalQuantity,
                totalValue,
            },
        };
    }
    /**
     * Full chronological payable ledger: every purchase (debit), every completed
     * purchase return (credit — goods went back, so we owe less) and every
     * supplier payment (credit). Shared by the live ledger and the statement.
     */
    async computeSupplierLedger(supplierId) {
        await this.getSupplierById(supplierId);
        const [purchases, invoices, returns, payments] = await Promise.all([
            client_1.prisma.purchase.findMany({
                where: { supplier_id: supplierId },
                include: { product: { select: { id: true, name: true, sku: true } } },
                orderBy: { purchase_date: 'asc' },
            }),
            client_1.prisma.purchaseInvoice.findMany({
                where: { supplier_id: supplierId },
                orderBy: { invoice_date: 'asc' },
            }),
            client_1.prisma.purchaseReturn.findMany({
                where: { supplier_id: supplierId, status: 'COMPLETED' },
                orderBy: { return_date: 'asc' },
            }),
            client_1.prisma.supplierPayment.findMany({
                where: { supplier_id: supplierId },
                include: { user: { select: { email: true } } },
                orderBy: { payment_date: 'asc' },
            }),
        ]);
        const order = {
            PURCHASE: 0,
            INVOICE: 0,
            RETURN: 1,
            PAYMENT: 2,
        };
        const raw = [];
        // An invoiced delivery's liability is carried by the invoice, not the raw
        // receipt — otherwise it would be counted twice.
        for (const p of purchases) {
            if (p.purchase_invoice_id)
                continue;
            raw.push({
                id: `purchase-${p.id}`,
                date: p.purchase_date,
                type: 'PURCHASE',
                description: `Goods received · ${p.product?.name || 'Product'} × ${(0, helpers_1.asNumber)(p.quantity)}`,
                reference: p.invoice_ref,
                debit: (0, helpers_1.asNumber)(p.quantity) * (0, helpers_1.asNumber)(p.cost_price),
                credit: 0,
                meta: { purchaseId: p.id, productId: p.product_id },
            });
        }
        for (const inv of invoices) {
            raw.push({
                id: `invoice-${inv.id}`,
                date: inv.invoice_date,
                type: 'INVOICE',
                description: `Purchase invoice · ${inv.invoice_number}`,
                reference: inv.invoice_number,
                debit: (0, helpers_1.asNumber)(inv.total_amount),
                credit: 0,
                meta: { invoiceId: inv.id, status: inv.status, dueDate: inv.due_date },
            });
        }
        for (const r of returns) {
            raw.push({
                id: `return-${r.id}`,
                date: r.return_date,
                type: 'RETURN',
                description: `Purchase return · ${r.return_number}`,
                reference: r.return_number,
                debit: 0,
                credit: (0, helpers_1.asNumber)(r.total_amount),
                meta: { returnId: r.id },
            });
        }
        for (const pay of payments) {
            raw.push({
                id: `payment-${pay.id}`,
                date: pay.payment_date,
                type: 'PAYMENT',
                description: `Payment · ${pay.method}${pay.notes ? ` · ${pay.notes}` : ''}`,
                reference: pay.reference,
                debit: 0,
                credit: (0, helpers_1.asNumber)(pay.amount),
                meta: {
                    paymentId: pay.id,
                    method: pay.method,
                    createdBy: pay.user?.email || null,
                },
            });
        }
        raw.sort((a, b) => {
            const d = a.date.getTime() - b.date.getTime();
            if (d !== 0)
                return d;
            return order[a.type] - order[b.type];
        });
        let running = 0;
        const entries = raw.map((e) => {
            running += e.debit - e.credit;
            return { ...e, balance: running };
        });
        return { entries, purchases, invoices, returns, payments, closingBalance: running };
    }
    async getSupplierLedger(supplierId) {
        const { entries, purchases, invoices, returns, payments } = await this.computeSupplierLedger(supplierId);
        const totalPurchased = entries.reduce((acc, e) => acc + e.debit, 0);
        const totalPaid = payments.reduce((acc, p) => acc + (0, helpers_1.asNumber)(p.amount), 0);
        const totalReturned = returns.reduce((acc, r) => acc + (0, helpers_1.asNumber)(r.total_amount), 0);
        const uninvoicedPurchases = purchases.filter((p) => !p.purchase_invoice_id).length;
        return {
            summary: {
                totalPurchased,
                totalPaid,
                totalReturned,
                balanceDue: totalPurchased - totalPaid - totalReturned,
                purchaseCount: purchases.length,
                invoiceCount: invoices.length,
                uninvoicedPurchases,
                returnCount: returns.length,
                paymentCount: payments.length,
            },
            entries: [...entries].reverse(),
            payments: payments
                .map((p) => ({
                id: p.id,
                amount: (0, helpers_1.asNumber)(p.amount),
                payment_date: p.payment_date,
                method: p.method,
                reference: p.reference,
                notes: p.notes,
                created_at: p.created_at,
                user: p.user,
            }))
                .reverse(),
        };
    }
    /** Date-ranged printable statement: opening carried to `from`, entries in range, closing. */
    async getSupplierStatement(supplierId, range = {}) {
        const supplier = await this.getSupplierById(supplierId);
        const { entries } = await this.computeSupplierLedger(supplierId);
        const fromDate = range.from ? new Date(range.from) : null;
        const toDateRaw = range.to ? new Date(range.to) : null;
        const validFrom = fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : null;
        const validTo = toDateRaw && !Number.isNaN(toDateRaw.getTime())
            ? new Date(toDateRaw.getFullYear(), toDateRaw.getMonth(), toDateRaw.getDate(), 23, 59, 59, 999)
            : null;
        let openingBalance = 0;
        const windowEntries = [];
        for (const e of entries) {
            if (validFrom && e.date < validFrom) {
                openingBalance = e.balance;
                continue;
            }
            if (validTo && e.date > validTo)
                continue;
            windowEntries.push(e);
        }
        const totalDebit = windowEntries.reduce((acc, e) => acc + e.debit, 0);
        const totalCredit = windowEntries.reduce((acc, e) => acc + e.credit, 0);
        return {
            supplier: {
                id: supplier.id,
                name: supplier.name,
                code: supplier.code,
                phone_number: supplier.phone_number,
                email: supplier.email,
                address: supplier.address,
            },
            period: {
                from: validFrom ? validFrom.toISOString() : null,
                to: validTo ? validTo.toISOString() : null,
            },
            summary: {
                openingBalance,
                totalDebit,
                totalCredit,
                closingBalance: openingBalance + totalDebit - totalCredit,
                entryCount: windowEntries.length,
            },
            entries: windowEntries,
        };
    }
    /** Products assigned to this supplier (the supplier's catalogue). */
    async getSupplierProducts(supplierId) {
        await this.getSupplierById(supplierId);
        const products = await client_1.prisma.product.findMany({
            where: { supplier_id: supplierId },
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                sku: true,
                code: true,
                is_active: true,
                purchase_rate: true,
                sales_rate_inc_dis_and_tax: true,
                category: { select: { id: true, name: true } },
                unit: { select: { id: true, name: true } },
                _count: { select: { purchases: true } },
            },
        });
        return products.map((p) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            code: p.code,
            is_active: p.is_active,
            purchase_rate: (0, helpers_1.asNumber)(p.purchase_rate),
            sales_rate: (0, helpers_1.asNumber)(p.sales_rate_inc_dis_and_tax),
            category: p.category?.name ?? null,
            unit: p.unit?.name ?? null,
            purchase_count: p._count.purchases,
        }));
    }
    async createSupplierPayment(supplierId, data, createdBy) {
        await this.getSupplierById(supplierId);
        let invoiceId = null;
        if (data.purchaseInvoiceId) {
            const invoice = await client_1.prisma.purchaseInvoice.findFirst({
                where: { id: data.purchaseInvoiceId, supplier_id: supplierId },
            });
            if (!invoice) {
                throw new apiError_1.AppError(400, 'That invoice does not belong to this supplier');
            }
            invoiceId = invoice.id;
        }
        const payment = await client_1.prisma.supplierPayment.create({
            data: {
                supplier_id: supplierId,
                amount: data.amount,
                payment_date: data.paymentDate
                    ? new Date(data.paymentDate)
                    : new Date(),
                method: data.method || 'CASH',
                reference: data.reference || null,
                notes: data.notes || null,
                purchase_invoice_id: invoiceId,
                created_by: createdBy,
            },
            include: { user: { select: { email: true } } },
        });
        if (invoiceId) {
            await purchaseInvoice_service_1.PurchaseInvoiceService.recompute(invoiceId);
        }
        return {
            id: payment.id,
            amount: (0, helpers_1.asNumber)(payment.amount),
            payment_date: payment.payment_date,
            method: payment.method,
            reference: payment.reference,
            notes: payment.notes,
            purchase_invoice_id: payment.purchase_invoice_id,
            created_at: payment.created_at,
            user: payment.user,
        };
    }
    async deleteSupplierPayment(supplierId, paymentId) {
        const payment = await client_1.prisma.supplierPayment.findFirst({
            where: { id: paymentId, supplier_id: supplierId },
        });
        if (!payment)
            throw new apiError_1.AppError(404, 'Payment not found');
        const invoiceId = payment.purchase_invoice_id;
        await client_1.prisma.supplierPayment.delete({ where: { id: paymentId } });
        if (invoiceId) {
            await purchaseInvoice_service_1.PurchaseInvoiceService.recompute(invoiceId);
        }
        return { message: 'Payment deleted successfully' };
    }
}
exports.SupplierService = SupplierService;
//# sourceMappingURL=supplier.service.js.map