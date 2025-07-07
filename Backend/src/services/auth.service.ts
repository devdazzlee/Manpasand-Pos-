import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma/client';
import { redis } from '../config/redis';
import { config } from '../config/app';
import { AppError } from '../utils/apiError';
import { Role, Branch } from '@prisma/client'; 
import { convertToSeconds } from '../utils/convertToSeconds';

class AuthService {
  async register(data: { email: string; password: string; role?: Role }) {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new AppError(400, 'Email already in use');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        role: data.role || Role.ADMIN, // Use Role.USER instead of string
      },
      select: {
        id: true,
        email: true,
        role: true,
        created_at: true,
      },
    });

    return user;
  }

  async registerAdmin(data: { email: string; password: string; branch_id: Branch['id'], role: Role }) {
    if (data.role === Role.SUPER_ADMIN) {
      throw new AppError(400, 'Cannot assign SUPER_ADMIN role');
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new AppError(400, 'Email already in use');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        branch_id: data.branch_id,
        role: data.role || Role.ADMIN,
      },
      select: {
        id: true,
        email: true,
        role: true,
        branch_id: true,
        created_at: true,
      },
    });

    return user;
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        branch_id: true,
        password: true,
        role: true,
      },
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new AppError(400, 'Invalid email or password');
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        branch_id: user.branch_id,
      },
      config.jwtSecret,
      {
        expiresIn:
          typeof config.jwtExpiresIn === 'string'
            ? convertToSeconds(config.jwtExpiresIn)
            : config.jwtExpiresIn,
      },
    );

    // Store session in Redis with proper expiration
    const expiresInSeconds = convertToSeconds(config.jwtExpiresIn);
    await redis.set(`session:${user.id}`, token, 'EX', expiresInSeconds);

    // Omit password from returned user object
    const { id: undefined, password: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      token,
    };
  }

  async logout(userId: string) {
    // await redis.del(`session:${userId}`);
  }
}

export { AuthService };
