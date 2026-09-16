import type { RequestHandler } from 'express';
import { OrderService } from './order.service.js';

export const checkout: RequestHandler = async (req, res, next) => {
  try { res.status(201).json({ success: true, data: await OrderService.checkout(req.auth!.userId, req.body, res.locals.requestId) }); }
  catch (error) { next(error); }
};
export const payOrder: RequestHandler = async (req, res, next) => {
  try { res.json({ success: true, data: await OrderService.pay(req.auth!.userId, req.params.id as string, res.locals.requestId) }); }
  catch (error) { next(error); }
};
export const listOrders: RequestHandler = async (req, res, next) => {
  try { res.json({ success: true, data: await OrderService.listOwned(req.auth!.userId) }); }
  catch (error) { next(error); }
};
export const getOrder: RequestHandler = async (req, res, next) => {
  try { res.json({ success: true, data: await OrderService.getOwned(req.auth!.userId, req.params.id as string) }); }
  catch (error) { next(error); }
};
