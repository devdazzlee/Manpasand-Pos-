import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { redis } from '../config/redis';
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

    // Verify token against Redis
    const storedToken = await redis.get(`session:customer:${decoded.id}`);
    if (!storedToken || storedToken !== token) {
      throw new AppError(401, 'Invalid or expired session');
    }

    req.customer = decoded;
    next();
  } catch (error) {
    next(error);
  }
};


export { authenticateCustomer };
