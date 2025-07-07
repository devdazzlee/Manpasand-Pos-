import { Customer } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import jwt from 'jsonwebtoken';
import { convertToSeconds } from '../utils/convertToSeconds';
import { config } from '../config/app';
import { redis } from '../config/redis';
import bcrypt from 'bcryptjs';

class CustomerService {
    private generateToken(cusId: Customer['id'], email: Customer['email']): string {
        const token = jwt.sign(
            {
                email: email,
                id: cusId
            },
            config.jwtSecret,
            {
                expiresIn:
                    typeof config.jwtExpiresIn === 'string'
                        ? convertToSeconds(config.jwtExpiresIn)
                        : config.jwtExpiresIn,
            },
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

        // Store session in Redis with proper expiration
        const expiresInSeconds = convertToSeconds(config.jwtExpiresIn);
        await redis.set(`session:customer:${customer.id}`, token, 'EX', expiresInSeconds);

        return {
            email: customer.email,
            token,
        };
    }

    public async createShopCustomer(data: Customer) {
        const customerExists = await this.verifyCustomerExistance(data.email);
        if (customerExists) {
            throw new AppError(400, 'Customer already exists');
        }

        const customer = await prisma.customer.create({
            data: data
        });

        return {
            customer
        };
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

        // Save session to Redis
        const expiresInSeconds = convertToSeconds(config.jwtExpiresIn);
        await redis.set(`session:customer:${customer.id}`, token, 'EX', expiresInSeconds);

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
        return prisma.customer.findMany({
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
    }

    public async updateCustomer(
        customerId: Customer['id'],
        updateData: Partial<Customer>
    ) {
        const existingCustomer = await prisma.customer.findUnique({
            where: { id: customerId },
        });

        if (!existingCustomer) {
            throw new AppError(404, 'Customer not found');
        }

        // If password is being updated, hash it
        if (updateData.password) {
            updateData.password = await bcrypt.hash(updateData.password, 10);
        }

        const updatedCustomer = await prisma.customer.update({
            where: { id: customerId },
            data: updateData,
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

        await prisma.customer.delete({
            where: { id: customerId },
        });

        // Remove session from Redis if exists
        await redis.del(`session:customer:${customerId}`);

        return { message: 'Customer deleted successfully' };
    }

    public async logoutCustomer(customerId: Customer['id']) {
        await redis.del(`session:customer:${customerId}`);
        return { message: 'Logged out successfully' };
    }
}

export default CustomerService;