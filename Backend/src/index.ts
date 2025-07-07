import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/app';
import { prisma } from './prisma/client';
import { errorHandler } from './middleware/error.middleware';
import { notFoundHandler } from './middleware/not-found.middleware';
import { connectDB } from './config/db';
import { connectRedis } from './config/redis';
import authRoutes from './routes/auth.routes';
import categoryRoutes from './routes/category.routes';
import subcategoryRoutes from './routes/subcategory.routes';
import branchRoutes from './routes/branch.routes';
import colorRoutes from './routes/color.routes';
import sizeRoutes from './routes/size.routes';
import unitRoutes from './routes/unit.routes';
import supplierRoutes from './routes/supplier.routes';
import taxRoutes from './routes/tax.routes';
import brandRoutes from './routes/brand.routes';
import productRoutes  from './routes/product.routes';
import orderRoutes  from './routes/adminOrder.routes';
import stockRoutes  from './routes/stock.routes';
import saleRoutes  from './routes/sale.routes';
import appRoutes  from './routes/app.routes';
import expenseRoutes  from './routes/expense.routes';
import cashflowRoutes  from './routes/cashflow.routes';
import customerRoutes  from './routes/customer.routes';
import customerOrderRoutes  from './routes/customerOrder.routes';
import deviceIdentityRoutes  from './routes/device_identity.routes';
import dashboardRoutes  from './routes/dashboard.routes';
import employeeRoutes  from './routes/employee.route';
import salaryRoutes  from './routes/salary.route';
import shiftRoutes  from './routes/shift.route';

const vAPI = process.env.vAPI || '/api/v1';
const app = express();

connectDB();
connectRedis();

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use(`${vAPI}/auth`, authRoutes);
app.use(`${vAPI}/categories`, categoryRoutes);
app.use(`${vAPI}/subcategories`, subcategoryRoutes);
app.use(`${vAPI}/branches`, branchRoutes);
app.use(`${vAPI}/colors`, colorRoutes);
app.use(`${vAPI}/sizes`, sizeRoutes);
app.use(`${vAPI}/units`, unitRoutes);
app.use(`${vAPI}/suppliers`, supplierRoutes);
app.use(`${vAPI}/taxes`, taxRoutes);
app.use(`${vAPI}/brands`, brandRoutes);
app.use(`${vAPI}/products`, productRoutes);
app.use(`${vAPI}/order`, orderRoutes);
app.use(`${vAPI}/sale`, saleRoutes);
app.use(`${vAPI}/stock`, stockRoutes);
app.use(`${vAPI}/expenses`, expenseRoutes);
app.use(`${vAPI}/cashflows`, cashflowRoutes);
app.use(`${vAPI}/dashboard`, dashboardRoutes);
app.use(`${vAPI}/employee`, employeeRoutes);
app.use(`${vAPI}/salaries`, salaryRoutes);
app.use(`${vAPI}/shifts`, shiftRoutes);

// App Routes
app.use(`${vAPI}/customer/app`, appRoutes);
app.use(`${vAPI}/customer`, customerRoutes);
app.use(`${vAPI}/app/customer/order`, customerOrderRoutes);
app.use(`${vAPI}/customer/device-identity`, deviceIdentityRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK - Server is working fine' });
});

// Error handling
app.use(errorHandler);
app.use(notFoundHandler);

// Start server
app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

