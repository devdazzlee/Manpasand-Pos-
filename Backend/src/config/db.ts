import { prisma } from '../prisma/client'; 

export const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log('PostgreSQL Connected...');
  } catch (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  }
};
