/**
 * Create a NEW SUPER_ADMIN user only.
 * Does NOT update, overwrite, or delete any existing data.
 */
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const NEW_ADMIN = {
  email: 'manpasand.admin',
  password: 'MpAdmin@2026',
  role: Role.SUPER_ADMIN,
};

async function createNewAdmin() {
  console.log('Creating new SUPER_ADMIN (create-only, no updates)...\n');

  try {
    const existing = await prisma.user.findUnique({
      where: { email: NEW_ADMIN.email },
    });

    if (existing) {
      console.log(`User "${NEW_ADMIN.email}" already exists — no changes made.`);
      console.log(`  id: ${existing.id}`);
      console.log(`  role: ${existing.role}`);
      return;
    }

    const hashedPassword = await bcrypt.hash(NEW_ADMIN.password, 10);

    const user = await prisma.user.create({
      data: {
        email: NEW_ADMIN.email,
        password: hashedPassword,
        role: NEW_ADMIN.role,
        branch_id: null,
      },
    });

    console.log('Created new SUPER_ADMIN successfully.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Username : ${NEW_ADMIN.email}`);
    console.log(`  Password : ${NEW_ADMIN.password}`);
    console.log(`  Role     : ${NEW_ADMIN.role}`);
    console.log(`  User ID  : ${user.id}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error) {
    console.error('Error creating admin:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createNewAdmin()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
