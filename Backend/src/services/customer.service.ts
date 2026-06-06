import { Customer } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import jwt from 'jsonwebtoken';
import { config } from '../config/app';
import bcrypt from 'bcryptjs';

class CustomerService {
    private generateToken(cusId: Customer['id'], email: Customer['email']): string {
        const token = jwt.sign(
            {
                email: email,
                id: cusId
            },
            config.jwtSecret,
            // No expiration - token remains valid until user logs out
        );

        return token;
    }

    private async verifyCustomerExistance(email: Customer['email']): Promise<boolean> {
        const customer = await prisma.customer.findFirst({
            where: {
                email: email,
            },
        });
        if (customer) return true;
        return false;
    }

    public async createCustomer(data: Customer) {
        const customerExists = await this.verifyCustomerExistance(data.email);
        if (customerExists) {
            throw new AppError(400, 'Customer already exists');
        }

        // Ensure password is hashed before storing
        const hashedPassword = await bcrypt.hash(data.password!, 10);

        const customer = await prisma.customer.create({
            data: {
                ...data,
                password: hashedPassword,
            },
        });

        const token = this.generateToken(customer.id, customer.email!);

        return {
            email: customer.email,
            token,
        };
    }

    public async createShopCustomer(data: Partial<Customer> & {
        credit_limit?: number | null;
        previous_credit_balance?: number | null;
    }) {
        const email = this.resolveCustomerEmail(data.email, data.phone_number);
        const customerExists = await this.verifyCustomerExistance(email);
        if (customerExists) {
            throw new AppError(400, 'Customer already exists');
        }

        const customer = await prisma.customer.create({
            data: {
                name: data.name,
                phone_number: data.phone_number,
                email,
                address: data.address,
                billing_address: data.billing_address,
                is_active: data.is_active ?? true,
                credit_limit: data.credit_limit ?? null,
                previous_credit_balance: data.previous_credit_balance ?? 0,
            },
        });

        return {
            customer,
        };
    }

    private resolveCustomerEmail(email?: string | null, phone_number?: string | null) {
        const trimmed = email?.trim();
        if (trimmed) return trimmed;

        const digits = (phone_number || '').replace(/\D/g, '') || Date.now().toString();
        return `customer_${digits}_${Math.random().toString(36).slice(2, 8)}@pos.local`;
    }

    public async loginCustomer(email: Customer['email'], password: Customer['password']) {
        const customer = await prisma.customer.findFirst({
            where: { email },
        });

        if (!customer || !customer.password) {
            throw new AppError(401, 'Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(password!, customer.password);
        if (!isPasswordValid) {
            throw new AppError(401, 'Invalid credentials');
        }

        const token = this.generateToken(customer.id, customer.email!);

        return {
            email: customer.email,
            token,
        };
    }

    public async getCustomerById(customerId: Customer['id']) {
        const customer = await prisma.customer.findUnique({
            where: { id: customerId },
        });

        if (!customer) {
            throw new AppError(404, 'Customer not found');
        }

        return customer;
    }

    public async getCustomers(search?: string) {
        const customers = await prisma.customer.findMany({
            where: search
                ? {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { email: { contains: search, mode: 'insensitive' } },
                        { phone_number: { contains: search } },
                    ],
                }
                : undefined,
            orderBy: { created_at: 'desc' },
        });

        if (customers.length === 0) {
            return [];
        }

        const customerIds = customers.map((customer) => customer.id);
        const saleAggregates = await prisma.sale.groupBy({
            by: ['customer_id'],
            where: {
                customer_id: { in: customerIds },
                status: 'COMPLETED',
            },
            _sum: { total_amount: true },
            _count: { id: true },
            _max: { sale_date: true },
        });

        const statsByCustomerId = new Map(
            saleAggregates
                .filter((row) => row.customer_id)
                .map((row) => [
                    row.customer_id as string,
                    {
                        total_sale_amount: Number(row._sum.total_amount ?? 0),
                        sale_count: row._count.id,
                        last_sale_date: row._max.sale_date,
                    },
                ]),
        );

        return customers.map((customer) => {
            const stats = statsByCustomerId.get(customer.id);
            return {
                ...customer,
                total_sale_amount: stats?.total_sale_amount ?? 0,
                sale_count: stats?.sale_count ?? 0,
                last_sale_date: stats?.last_sale_date ?? null,
            };
        });
    }

    public async updateCustomer(
        customerId: Customer['id'],
        updateData: Partial<Customer> & {
            credit_limit?: number | null;
            previous_credit_balance?: number | null;
        },
    ) {
        const existingCustomer = await prisma.customer.findUnique({
            where: { id: customerId },
        });

        if (!existingCustomer) {
            throw new AppError(404, 'Customer not found');
        }

        if (updateData.password) {
            updateData.password = await bcrypt.hash(updateData.password, 10);
        }

        const data: Partial<Customer> = { ...updateData };

        if (data.email !== undefined) {
            const trimmed = data.email?.trim();
            data.email = trimmed
                ? trimmed
                : this.resolveCustomerEmail(null, data.phone_number ?? existingCustomer.phone_number);
        }

        if (data.credit_limit === undefined) {
            delete (data as { credit_limit?: unknown }).credit_limit;
        }

        const updatedCustomer = await prisma.customer.update({
            where: { id: customerId },
            data,
        });

        return updatedCustomer;
    }

    public async deleteCustomer(customerId: Customer['id']) {
        const existingCustomer = await prisma.customer.findUnique({
            where: { id: customerId },
        });

        if (!existingCustomer) {
            throw new AppError(404, 'Customer not found');
        }

        await prisma.$transaction(
            async (tx) => {
                await tx.sale.updateMany({
                    where: { original_sale: { customer_id: customerId } },
                    data: { original_sale_id: null },
                });

                await tx.saleItem.deleteMany({
                    where: { sale: { customer_id: customerId } },
                });
                await tx.sale.deleteMany({ where: { customer_id: customerId } });

                await tx.orderItem.deleteMany({
                    where: { order: { customer_id: customerId } },
                });
                await tx.order.deleteMany({ where: { customer_id: customerId } });

                await tx.holdSale.deleteMany({ where: { customer_id: customerId } });
                await tx.deviceIdentity.deleteMany({ where: { customer_id: customerId } });

                await tx.customer.delete({ where: { id: customerId } });
            },
            {
                maxWait: 30000,
                timeout: 120000,
            },
        );

        return { message: 'Customer deleted successfully' };
    }

    // No server-side session to invalidate — the token is the session and is
    // discarded by the client. Method kept so the existing /customer/logout
    // route stays valid.
    public async logoutCustomer(_customerId: Customer['id']) {
        return { message: 'Logged out successfully' };
    }
}

export default CustomerService;