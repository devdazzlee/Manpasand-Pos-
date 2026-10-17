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
        email?: string;
      };
      /** Set when a manager approved an action the signed-in user was not allowed to do. */
      approval?: { id: string; email: string; role: string; permission: string };
    }
  }
}

// Pure JWT auth — no server-side session store. The signed token is the
// session. Tokens are issued without expiry (see auth.service.ts), so a user
// stays logged in until they explicitly clear the token on the client.
/**
 * INVENTORY_VIEWER is read-only: it may only GET product / stock data (plus the
 * lookups those screens need) and log out or change its own password. Checked
 * here so every route that authenticates is covered, whatever its role list.
 */
const VIEWER_READ_PREFIXES = [
  '/products',
  '/stock',
  '/stock-quantity-report',
  '/categories',
  '/subcategories',
  '/brands',
  '/colors',
  '/sizes',
  '/units',
  '/taxes',
  '/branches',
  '/auth/me',
];
const VIEWER_WRITE_PATHS = ['/auth/logout', '/auth/change-password'];
const apiPath = (req: Request) => (req.baseUrl + req.path).replace(/^\/api\/v\d+/, '').replace(/\/+$/, '') || '/';
const viewerMayRead = (req: Request) => {
  const path = apiPath(req);
  return ['GET', 'HEAD', 'OPTIONS'].includes(req.method) && VIEWER_READ_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
};
const viewerAllowed = (req: Request) => viewerMayRead(req) || VIEWER_WRITE_PATHS.includes(apiPath(req));

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
      select: { id: true, role: true, branch_id: true, email: true, is_active: true },
    });
    if (!userExists) {
      throw new AppError(401, 'Session expired, please log in again');
    }
    if (!userExists.is_active) {
      throw new AppError(401, 'This account has been deactivated. Contact the owner.');
    }

    // Role / branch come from the database so changes apply immediately (tokens never expire).
    req.user = {
      id: userExists.id,
      role: userExists.role,
      branch_id: userExists.branch_id ?? undefined,
      email: userExists.email,
    };
    if (userExists.role === 'INVENTORY_VIEWER' && !viewerAllowed(req)) {
      throw new AppError(403, 'This account is view-only (products and stock)');
    }
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return next(new AppError(401, 'Invalid token'));
    }
    next(error);
  }
};

const authorize = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    // A supervisor can reach everything a branch manager can; permissions then narrow it down.
    const allowed =
      !!role &&
      (roles.includes(role) ||
        (role === 'SUPERVISOR' && roles.includes('BRANCH_MANAGER')) ||
        // View-only role may read the product / stock screens that other roles can.
        (role === 'INVENTORY_VIEWER' && viewerMayRead(req)));
    if (!allowed) {
      return next(new AppError(403, 'Unauthorized access'));
    }
    next();
  };
};

export { authenticate, authorize };
