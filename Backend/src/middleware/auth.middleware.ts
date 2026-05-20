import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/app';
import { AppError } from '../utils/apiError';
import { prisma } from '../prisma/client';

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

// Pure JWT auth — no server-side session store. The signed token is the
// session. Tokens are issued without expiry (see auth.service.ts), so a user
// stays logged in until they explicitly clear the token on the client.
const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      throw new AppError(401, 'Authentication required');
    }

    const decoded = jwt.verify(token, config.jwtSecret) as {
      id: string;
      role: string;
      branch_id?: string;
    };

    // Verify the user still exists. Tokens never expire on their own, so a
    // user who was deleted (or a DB reseed) leaves the client holding a JWT
    // whose `id` doesn't match a User row — every subsequent write that
    // stores `created_by` would FK-violate. Reject the request cleanly so
    // the client can drop the stale token and prompt a fresh login.
    const userExists = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true },
    });
    if (!userExists) {
      throw new AppError(401, 'Session expired, please log in again');
    }

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'Invalid token');
    }
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
