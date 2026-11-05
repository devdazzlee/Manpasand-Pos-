import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/app';
import { AppError } from '../utils/apiError';
import { prisma } from '../prisma/client';
import { stripCost } from '../utils/hide-cost';

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

/**
 * Roles that work inside exactly one branch. For these users the branch is a
 * property of the account, never of the request: whatever branch the browser
 * sends (a stale localStorage value, a shared PC an admin used earlier, a
 * tampered request) is replaced with the user's own branch. Admins, warehouse
 * and purchase managers legitimately work across branches and are not locked.
 */
const BRANCH_LOCKED_ROLES = new Set(['BRANCH_MANAGER', 'SUPERVISOR', 'CASHIER']);
const BRANCH_PARAM_KEYS = ['branchId', 'branch_id'] as const;

export const isBranchLockedRole = (role?: string | null) => !!role && BRANCH_LOCKED_ROLES.has(role);

/**
 * Pin a branch-bound request to the user's branch.
 * - Query: always set, even when the client omitted it. Many list endpoints
 *   treat "no branch filter" as "all branches", so an omitted param must never
 *   widen a branch user's view.
 * - Body: overwritten only when present (injecting unknown keys into write
 *   payloads could change their meaning).
 */
const lockRequestToBranch = (req: Request, branchId: string) => {
  const query = req.query as Record<string, unknown>;
  for (const key of BRANCH_PARAM_KEYS) query[key] = branchId;

  const body = req.body as Record<string, unknown> | undefined;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const key of BRANCH_PARAM_KEYS) {
      if (key in body) body[key] = branchId;
    }
  }
};

/**
 * Branch accounts get view-only inventory: they can see their branch's stock,
 * stock-ins, transfers, stock-outs and adjustments, but every change to
 * products or stock is made centrally (admin / warehouse / purchase roles).
 * Selling still moves stock — that goes through /sale, not these routes.
 */
const BRANCH_READONLY_INVENTORY_PREFIXES = [
  '/products',
  '/stock',
  '/stock-out',
  '/stock-adjustments',
  '/stock-imports',
  '/purchases',
  '/purchase-orders',
  '/purchase-returns',
  '/purchase-invoices',
  '/transfers',
  '/inventory',
];
const isBranchInventoryWrite = (req: Request) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return false;
  const path = apiPath(req);
  return BRANCH_READONLY_INVENTORY_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
};

/**
 * Owner-level finance (accounting books, P&L, balance sheet, trial balance,
 * product profit, money check, business insights) is off-limits to branch
 * accounts. The few lookups the branch Expenses screen needs stay open.
 */
const BRANCH_DENIED_PREFIXES = [
  '/chart-of-accounts',
  '/finance',
  '/financial-statement',
  '/profit-loss',
  '/balance-sheet',
  '/trial-balance',
  '/product-sales-profit',
  '/money-check',
  '/analytics',
];
const BRANCH_FINANCE_EXCEPTIONS: Array<{ prefix: string; methods?: string[] }> = [
  { prefix: '/chart-of-accounts/expense-accounts' },
  { prefix: '/chart-of-accounts/expense-groups', methods: ['GET'] },
  { prefix: '/chart-of-accounts/money-accounts', methods: ['GET'] },
  { prefix: '/chart-of-accounts/payment-routing', methods: ['GET'] },
  { prefix: '/finance/expenses/' },
  { prefix: '/finance/attachments/' },
];
const isBranchFinanceDenied = (req: Request) => {
  const path = apiPath(req);
  const under = (p: string) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`);
  if (!BRANCH_DENIED_PREFIXES.some(under)) return false;
  return !BRANCH_FINANCE_EXCEPTIONS.some(
    (e) => (path === e.prefix || path.startsWith(e.prefix.endsWith('/') ? e.prefix : `${e.prefix}/`) || (e.prefix.endsWith('/') && path.startsWith(e.prefix))) &&
      (!e.methods || e.methods.includes(req.method)),
  );
};

/** Paths a branch user without an assigned branch may still use (sign in/out, own profile). */
const UNASSIGNED_ALLOWED_PREFIX = '/auth/';

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
    if (isBranchLockedRole(userExists.role)) {
      // Branch accounts never receive purchase prices / costs, whatever the endpoint.
      const json = res.json.bind(res);
      res.json = (body?: unknown) => json(stripCost(body));
      if (isBranchFinanceDenied(req)) {
        throw new AppError(403, 'Business accounts and finance reports are only available to the owner / admin.');
      }
      if (isBranchInventoryWrite(req)) {
        throw new AppError(403, 'Inventory is view-only for branch accounts. Ask the owner or warehouse to make this change.');
      }
      if (userExists.branch_id) {
        lockRequestToBranch(req, userExists.branch_id);
      } else if (!`${apiPath(req)}/`.startsWith(UNASSIGNED_ALLOWED_PREFIX)) {
        // Fail closed: services read "no branch" as "every branch", so a branch
        // account with no branch must not reach any data endpoint at all.
        throw new AppError(403, 'Your account is not assigned to a branch. Ask the owner to assign one.');
      }
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
