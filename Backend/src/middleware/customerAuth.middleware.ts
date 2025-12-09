import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { isRedisAvailable, safeRedisOperation } from '../config/redis';
import { config } from '../config/app';
import { AppError } from '../utils/apiError';
import { Customer } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      customer: {
        id: string;
        email: string;
      };
    }
  }
}

const authenticateCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      throw new AppError(401, 'Authentication required');
    }

    const decoded = jwt.verify(token, config.jwtSecret) as { id: Customer['id']; email: Customer['email'] };

    // Verify token against Redis if available, otherwise just verify JWT
    if (isRedisAvailable) {
      const storedToken = await safeRedisOperation(
        async (redis) => redis.get(`session:customer:${decoded.id}`),
        null
      );
      
      if (storedToken && storedToken !== token) {
        throw new AppError(401, 'Invalid or expired session');
      }
      // If storedToken is null and Redis is available, session might have expired
      // But if Redis is unavailable, we allow JWT verification to pass
    }

    req.customer = decoded;
    next();
  } catch (error) {
    // If it's a JWT error, pass it through
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'Invalid or expired token');
    }
    next(error);
  }
};


export { authenticateCustomer };
