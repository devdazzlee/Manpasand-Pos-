import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { MoneyCheckService } from '../services/money-check.service';
import { auditFromRequest } from '../services/audit.service';

const service = new MoneyCheckService();
type Authed = Request & { user?: { id: string; role?: string; branch_id?: string | null } };
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString('en-PK')}`;

/** Every change made from Money Check lands in the audit trail (and its history list). */
const log = (req: Request, action: string, summary: string, details: Record<string, unknown>, entityId?: string | null) =>
  auditFromRequest(req as never, { action: `money_check.${action}`, category: 'accounts', entity: 'money_check', entityId: entityId ?? null, summary, details });

export const getSummary = asyncHandler(async (req: Request, res: Response) => {
  new ApiResponse(await service.summary(req.query.date as string | undefined), 'Money check summary').send(res);
});

export const reconcile = asyncHandler(async (req: Authed, res: Response) => {
  const data = await service.reconcile(req.body, req.user?.id);
  await log(req, 'reconcile', `Matched ${data.account} to the real balance: books ${rs(data.system)}, real ${rs(data.actual)} (${data.difference > 0 ? '+' : ''}${rs(data.difference)}) — ${req.body.reason}`, { ...req.body, ...data, voucherId: data.voucher?.id }, data.voucher?.id);
  new ApiResponse(data, 'Balance matched').send(res);
});

export const move = asyncHandler(async (req: Authed, res: Response) => {
  const data = await service.move(req.body, req.user?.id);
  await log(req, 'move', `${data.voucher?.narration ?? req.body.type} — ${rs(Number(req.body.amount))}`, { ...req.body, voucherId: data.voucher?.id }, data.voucher?.id);
  new ApiResponse(data, 'Money moved').send(res);
});

export const undo = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.undo(req.params.voucherId);
  await log(req, 'undo', `Undid ${data.voucher_no}: ${data.narration ?? ''} (${rs(data.amount)})`, { voucherId: req.params.voucherId, ...data });
  new ApiResponse(data, 'Entry undone').send(res);
});

export const getIssues = asyncHandler(async (_req: Request, res: Response) => {
  new ApiResponse(await service.issues(), 'Problems found').send(res);
});

export const dismissIssue = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.dismiss(req.body.issueId);
  await log(req, 'dismiss', `Marked as checked: ${req.body.issueId}`, req.body);
  new ApiResponse(data, 'Marked as checked').send(res);
});

export const closeRegister = asyncHandler(async (req: Authed, res: Response) => {
  const data = await service.closeForgottenRegister(req.params.id, req.body, { userId: req.user?.id, role: req.user?.role, branchId: req.user?.branch_id ?? null });
  await log(req, 'close_register', `Closed a register left open: cash counted ${rs(Number(req.body.closing))}`, { sessionId: req.params.id, ...req.body }, req.params.id);
  new ApiResponse(data, 'Register closed').send(res);
});

export const editClosing = asyncHandler(async (req: Authed, res: Response) => {
  const before = await service.registerForm(req.params.id);
  const data = await service.editClosing(req.params.id, req.body, req.user?.id);
  await log(req, 'edit_closing', `Corrected the closing of ${before.day}${req.body.closing != null ? `: cash ${rs(before.closing ?? 0)} → ${rs(Number(req.body.closing))}` : ''}`, { sessionId: req.params.id, before: { closing: before.closing, rows: before.rows }, after: req.body }, req.params.id);
  new ApiResponse(data, 'Closing corrected').send(res);
});

export const setPaidFrom = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.setPaidFrom(req.body);
  await log(req, 'paid_from', `${data.entity === 'EXPENSE' ? 'Expense' : 'Supplier payment'} ${rs(data.amount)} now taken from ${data.to}`, { ...req.body, ...data }, req.body.id);
  new ApiResponse(data, 'Paid from updated').send(res);
});

export const setDrawerSource = asyncHandler(async (req: Authed, res: Response) => {
  const data = await service.setDrawerSource(req.params.id, req.body.fromDrawer, req.user?.id);
  await log(req, 'drawer_source', `Supplier cash payment marked as ${data.fromDrawer ? "taken from that day's drawer" : 'paid from cash already taken out'}`, { ...data }, req.params.id);
  new ApiResponse(data, 'Updated').send(res);
});

export const getDayBook = asyncHandler(async (req: Request, res: Response) => {
  new ApiResponse(await service.dayBook(req.query.date as string | undefined), 'Day book').send(res);
});

export const getRegisterForm = asyncHandler(async (req: Request, res: Response) => {
  new ApiResponse(await service.registerForm(req.params.id), 'Register').send(res);
});

export const getHistory = asyncHandler(async (_req: Request, res: Response) => {
  new ApiResponse(await service.history(150), 'Money check history').send(res);
});
