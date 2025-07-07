import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { redis } from '../config/redis';
import { config } from '../config/app';
import { AppError } from '../utils/apiError';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        branch_id?: string;
      };
    }
  }
}

const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      throw new AppError(401, 'Authentication required');
    }

    const decoded = jwt.verify(token, config.jwtSecret) as { id: string; role: string };

    // Verify token against Redis
    const storedToken = await redis.get(`session:${decoded.id}`);
    if (!storedToken || storedToken !== token) {
      throw new AppError(401, 'Invalid or expired session');
    }

    req.user = decoded;
    next();
  } catch (error) {
    next(error);
  }
};

const authorize = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError(403, 'Unauthorized access');
    }
    next();
  };
};

export { authenticate, authorize };
