import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { asNumber } from '../utils/helpers';
import {
    CreateSupplierInput,
    UpdateSupplierInput,
    CreateSupplierPaymentInput,
} from '../validations/supplier.validation';
import { catalogDefaults, catalogDeleteOptions } from './catalog-defaults.service';

export class SupplierService {
    async createSupplier(data: CreateSupplierInput) {
        const existingSupplier = await prisma.supplier.findFirst({
            where: { name: data.name },
        });

        if (existingSupplier) throw new AppError(400, 'Supplier already exists');

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
            const clash = await prisma.supplier.findUnique({ where: { code: newCode } });
            if (!clash) break;
            newCode = generateCode();
        }

        const supplier = await prisma.supplier.create({
            data: {
                ...data,
                code: newCode,
                status: data.status ?? 'active',
            },
        });

        return supplier;
    }

    async getSupplierById(id: string) {
        const supplier = await prisma.supplier.findUnique({
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

        if (!supplier) throw new AppError(404, 'Supplier not found');
        return supplier;
    }

    async updateSupplier(id: string, data: UpdateSupplierInput) {
        await this.getSupplierById(id);
        return prisma.supplier.update({
            where: { id },
            data,
        });
    }

    async toggleSupplierStatus(id: string) {
        const supplier = await this.getSupplierById(id);
        const newStatus = supplier.status === 'active' ? 'inactive' : 'active';
        return prisma.supplier.update({
            where: { id },
            data: { status: newStatus },
        });
    }

    async deleteSupplier(id: string) {
        const supplier = await prisma.supplier.findUnique({ where: { id } });
        if (!supplier) throw new AppError(404, 'Supplier not found');

        await prisma.$transaction(async (tx) => {
            const defaultSupplierId = await catalogDefaults.ensureDefaultSupplier(tx, id);

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
        }, catalogDeleteOptions);

        return { message: 'Supplier deleted successfully' };
    }

    async listSuppliers({
        page = 1,
        limit = 10,
        search,
        is_active,
        display_on_pos,
        fetch_all,
    }: {
        page?: number;
        limit?: number;
        search?: string;
        is_active?: boolean;
        display_on_pos?: boolean;
        fetch_all?: boolean;
    }) {
        const where: Prisma.SupplierWhereInput = {};

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
            prisma.supplier.findMany({
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
            prisma.supplier.count({ where }),
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

    async getSupplierPurchases(supplierId: string) {
        await this.getSupplierById(supplierId);

        const purchases = await prisma.purchase.findMany({
            where: { supplier_id: supplierId },
            include: {
                product: { select: { id: true, name: true, sku: true } },
                warehouse_branch: { select: { id: true, name: true } },
            },
            orderBy: { purchase_date: 'desc' },
        });

        const productMap = new Map<
            string,
            {
                productId: string;
                productName: string;
                sku: string | null;
                totalQty: number;
                totalValue: number;
                purchaseCount: number;
            }
        >();

        let totalQuantity = 0;
        let totalValue = 0;

        for (const p of purchases) {
            const qty = asNumber(p.quantity);
            const cost = asNumber(p.cost_price);
            const line = qty * cost;
            totalQuantity += qty;
            totalValue += line;

            const pid = p.product_id;
            const existing = productMap.get(pid);
            if (existing) {
                existing.totalQty += qty;
                existing.totalValue += line;
                existing.purchaseCount += 1;
            } else {
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
                quantity: asNumber(p.quantity),
                cost_price: asNumber(p.cost_price),
                line_total: asNumber(p.quantity) * asNumber(p.cost_price),
                invoice_ref: p.invoice_ref,
                notes: p.notes,
                delivery_status: p.delivery_status,
                product: p.product,
                warehouse_branch: p.warehouse_branch,
            })),
            productSummary: Array.from(productMap.values()).sort(
                (a, b) => b.totalValue - a.totalValue,
            ),
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
    private async computeSupplierLedger(supplierId: string) {
        await this.getSupplierById(supplierId);

        const [purchases, returns, payments] = await Promise.all([
            prisma.purchase.findMany({
                where: { supplier_id: supplierId },
                include: { product: { select: { id: true, name: true, sku: true } } },
                orderBy: { purchase_date: 'asc' },
            }),
            prisma.purchaseReturn.findMany({
                where: { supplier_id: supplierId, status: 'COMPLETED' },
                orderBy: { return_date: 'asc' },
            }),
            prisma.supplierPayment.findMany({
                where: { supplier_id: supplierId },
                include: { user: { select: { email: true } } },
                orderBy: { payment_date: 'asc' },
            }),
        ]);

        type LedgerType = 'PURCHASE' | 'RETURN' | 'PAYMENT';
        type LedgerEntry = {
            id: string;
            date: Date;
            type: LedgerType;
            description: string;
            reference: string | null;
            debit: number;
            credit: number;
            balance: number;
            meta?: Record<string, unknown>;
        };
        const order: Record<LedgerType, number> = { PURCHASE: 0, RETURN: 1, PAYMENT: 2 };

        const raw: Omit<LedgerEntry, 'balance'>[] = [];

        for (const p of purchases) {
            raw.push({
                id: `purchase-${p.id}`,
                date: p.purchase_date,
                type: 'PURCHASE',
                description: `Purchase · ${p.product?.name || 'Product'} × ${asNumber(p.quantity)}`,
                reference: p.invoice_ref,
                debit: asNumber(p.quantity) * asNumber(p.cost_price),
                credit: 0,
                meta: { purchaseId: p.id, productId: p.product_id },
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
                credit: asNumber(r.total_amount),
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
                credit: asNumber(pay.amount),
                meta: {
                    paymentId: pay.id,
                    method: pay.method,
                    createdBy: pay.user?.email || null,
                },
            });
        }

        raw.sort((a, b) => {
            const d = a.date.getTime() - b.date.getTime();
            if (d !== 0) return d;
            return order[a.type] - order[b.type];
        });

        let running = 0;
        const entries: LedgerEntry[] = raw.map((e) => {
            running += e.debit - e.credit;
            return { ...e, balance: running };
        });

        return { entries, purchases, returns, payments, closingBalance: running };
    }

    async getSupplierLedger(supplierId: string) {
        const { entries, purchases, returns, payments } =
            await this.computeSupplierLedger(supplierId);

        const totalPurchased = entries.reduce((acc, e) => acc + e.debit, 0);
        const totalPaid = payments.reduce((acc, p) => acc + asNumber(p.amount), 0);
        const totalReturned = returns.reduce((acc, r) => acc + asNumber(r.total_amount), 0);

        return {
            summary: {
                totalPurchased,
                totalPaid,
                totalReturned,
                balanceDue: totalPurchased - totalPaid - totalReturned,
                purchaseCount: purchases.length,
                returnCount: returns.length,
                paymentCount: payments.length,
            },
            entries: [...entries].reverse(),
            payments: payments
                .map((p) => ({
                    id: p.id,
                    amount: asNumber(p.amount),
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
    async getSupplierStatement(supplierId: string, range: { from?: string; to?: string } = {}) {
        const supplier = await this.getSupplierById(supplierId);
        const { entries } = await this.computeSupplierLedger(supplierId);

        const fromDate = range.from ? new Date(range.from) : null;
        const toDateRaw = range.to ? new Date(range.to) : null;
        const validFrom = fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : null;
        const validTo =
            toDateRaw && !Number.isNaN(toDateRaw.getTime())
                ? new Date(
                      toDateRaw.getFullYear(),
                      toDateRaw.getMonth(),
                      toDateRaw.getDate(),
                      23,
                      59,
                      59,
                      999,
                  )
                : null;

        let openingBalance = 0;
        const windowEntries: typeof entries = [];
        for (const e of entries) {
            if (validFrom && e.date < validFrom) {
                openingBalance = e.balance;
                continue;
            }
            if (validTo && e.date > validTo) continue;
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
    async getSupplierProducts(supplierId: string) {
        await this.getSupplierById(supplierId);
        const products = await prisma.product.findMany({
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
            purchase_rate: asNumber(p.purchase_rate),
            sales_rate: asNumber(p.sales_rate_inc_dis_and_tax),
            category: p.category?.name ?? null,
            unit: p.unit?.name ?? null,
            purchase_count: p._count.purchases,
        }));
    }

    async createSupplierPayment(
        supplierId: string,
        data: CreateSupplierPaymentInput,
        createdBy: string,
    ) {
        await this.getSupplierById(supplierId);

        const payment = await prisma.supplierPayment.create({
            data: {
                supplier_id: supplierId,
                amount: data.amount,
                payment_date: data.paymentDate
                    ? new Date(data.paymentDate)
                    : new Date(),
                method: data.method || 'CASH',
                reference: data.reference || null,
                notes: data.notes || null,
                created_by: createdBy,
            },
            include: { user: { select: { email: true } } },
        });

        return {
            id: payment.id,
            amount: asNumber(payment.amount),
            payment_date: payment.payment_date,
            method: payment.method,
            reference: payment.reference,
            notes: payment.notes,
            created_at: payment.created_at,
            user: payment.user,
        };
    }

    async deleteSupplierPayment(supplierId: string, paymentId: string) {
        const payment = await prisma.supplierPayment.findFirst({
            where: { id: paymentId, supplier_id: supplierId },
        });
        if (!payment) throw new AppError(404, 'Payment not found');
        await prisma.supplierPayment.delete({ where: { id: paymentId } });
        return { message: 'Payment deleted successfully' };
    }
}
