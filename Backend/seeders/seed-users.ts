import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface UserSeedData {
  email: string;
  password: string;
  role: Role;
  branchName?: string;
  branchCode?: string;
}

const usersToSeed: UserSeedData[] = [
  {
    email: 'admin123@gmail.com',
    password: 'admin@123123',
    role: Role.SUPER_ADMIN,
  },
  {
    email: 'bahadrabad@gmail.com',
    password: 'bahadrabad@123',
    role: Role.ADMIN,
    branchName: '1st Branch',
    branchCode: 'BRANCH-001',
  },
  {
    email: 'dha@gmail.com',
    password: 'dha@123',
    role: Role.ADMIN,
    branchName: '2nd Branch',
    branchCode: 'BRANCH-002',
  },
];

async function seedUsers() {
  console.log('🌱 Starting user seeder...\n');

  try {
    // Create branches first if they don't exist
    const branches = new Map<string, string>(); // Map branch code to branch ID

    for (const userData of usersToSeed) {
      if (userData.branchCode && userData.branchName) {
        let branch = await prisma.branch.findUnique({
          where: { code: userData.branchCode },
        });

        if (!branch) {
          branch = await prisma.branch.create({
            data: {
              code: userData.branchCode,
              name: userData.branchName,
              is_active: true,
            },
          });
          console.log(`✅ Created branch: ${userData.branchName} (${userData.branchCode})`);
        } else {
          console.log(`ℹ️  Branch already exists: ${userData.branchName} (${userData.branchCode})`);
        }

        branches.set(userData.branchCode, branch.id);
      }
    }

    console.log('\n📝 Creating users...\n');

    // Create users
    for (const userData of usersToSeed) {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: userData.email },
      });

      if (existingUser) {
        console.log(`⚠️  User already exists: ${userData.email} - Skipping`);
        continue;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      // Get branch_id if user has a branch
      const branchId = userData.branchCode
        ? branches.get(userData.branchCode)
        : null;

      // Create user
      const user = await prisma.user.create({
        data: {
          email: userData.email,
          password: hashedPassword,
          role: userData.role,
          branch_id: branchId || null,
        },
      });

      const branchInfo = branchId
        ? ` (Branch: ${userData.branchName})`
        : ' (No branch - Super Admin)';

      console.log(
        `✅ Created user: ${userData.email} - Role: ${userData.role}${branchInfo}`
      );
    }

    console.log('\n📊 Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Super Admin:');
    console.log('  Email: admin123@gmail.com');
    console.log('  Password: admin@123123');
    console.log('  Role: SUPER_ADMIN');
    console.log('');
    console.log('1st Branch Admin:');
    console.log('  Email: bahadrabad@gmail.com');
    console.log('  Password: bahadrabad@123');
    console.log('  Role: ADMIN');
    console.log('  Branch: 1st Branch (BRANCH-001)');
    console.log('');
    console.log('2nd Branch Admin:');
    console.log('  Email: dha@gmail.com');
    console.log('  Password: dha@123');
    console.log('  Role: ADMIN');
    console.log('  Branch: 2nd Branch (BRANCH-002)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n✅ User seeder completed successfully!');
  } catch (error) {
    console.error('\n❌ Error seeding users:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run seeder
seedUsers()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

