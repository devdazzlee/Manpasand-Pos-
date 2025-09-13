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
import shiftAssignmentRoutes  from './routes/shiftAssignment.routes';
import barcodeRoutes from './routes/barcode.routes';
import cron from 'node-cron';

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
app.use(`${vAPI}/shift-assignment`, shiftAssignmentRoutes);
app.use(`${vAPI}/barcode-generator`, barcodeRoutes);

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

// Cron job to close drawers after 24 hours
cron.schedule('0 * * * *', async () => {
  const now = new Date();
  console.log("🕐 Cron job running at:", now.toISOString());
  
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  console.log("📅 Looking for drawers opened before:", cutoff.toISOString());
  
  const openDrawers = await prisma.cashFlow.findMany({
    where: {
      status: 'OPEN',
      opened_at: { lte: cutoff },
    },
    include: {
      branch: {
        select: { name: true }
      }
    }
  });
  
  console.log(`🔍 Found ${openDrawers.length} drawers to auto-close`);
  
  for (const drawer of openDrawers) {
    await prisma.cashFlow.update({
      where: { id: drawer.id },
      data: { status: 'CLOSED', closed_at: new Date() },
    });
    console.log(`✅ Auto-closed drawer ${drawer.id} for branch: ${drawer.branch?.name || 'Unknown'}`);
  }
  
  if (openDrawers.length === 0) {
    console.log("✅ No drawers needed auto-closing");
  }
});

// Start server
app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

