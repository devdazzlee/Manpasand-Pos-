import { Request, Response } from 'express';
import { GuestOrderService } from '../services/guestOrder.service';
import { alfalahService } from '../services/alfalah.service';
import { ApiResponse } from '../utils/apiResponse';
import { AppError } from '../utils/apiError';
import asyncHandler from '../middleware/asyncHandler';

const guestOrderService = new GuestOrderService();

const createGuestOrder = asyncHandler(async (req: Request, res: Response) => {
  if (req.body.paymentMethod === 'card' && !alfalahService.isEnabled()) {
    throw new AppError(
      503,
      'Online card payment is not configured yet. Please choose Cash on Delivery or try again later.',
    );
  }

  const order = await guestOrderService.createGuestOrder(req.body);

  if (req.body.paymentMethod === 'card') {
    const payment = await alfalahService.startCardCheckout(order.order_number);
    return new ApiResponse(
      { ...order, payment },
      'Order created. Redirecting to Bank Alfalah.',
      201,
    ).send(res);
  }

  new ApiResponse(
    order,
    req.body.paymentMethod === 'bank_transfer'
      ? 'Order placed. Continue on WhatsApp to confirm bank transfer.'
      : 'Order placed successfully. Confirmation email sent.',
    201,
  ).send(res);
});

const getGuestOrders = asyncHandler(async (req: Request, res: Response) => {
  const { status, page = '1', pageSize = '10' } = req.query;
  const orders = await guestOrderService.getGuestOrders(
    status as string | undefined,
    parseInt(page as string, 10),
    parseInt(pageSize as string, 10)
  );
  new ApiResponse(orders, 'Website orders retrieved successfully').send(res);
});

const getGuestOrderById = asyncHandler(async (req: Request, res: Response) => {
  const orderId = req.params.id;
  const order = await guestOrderService.getGuestOrderById(orderId);
  new ApiResponse(order, 'Website order retrieved successfully').send(res);
});

export { createGuestOrder, getGuestOrders, getGuestOrderById };
