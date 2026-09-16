import type { RequestHandler } from 'express';
import { EventService } from './event.service.js';

export const createEvent: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json({ success: true, data: await EventService.create(req.auth!.userId, req.body, res.locals.requestId) });
  } catch (error) { next(error); }
};

export const updateEvent: RequestHandler = async (req, res, next) => {
  try {
    res.json({ success: true, data: await EventService.update(req.auth!.userId, req.params.id as string, req.body, res.locals.requestId) });
  } catch (error) { next(error); }
};

export const publishEvent: RequestHandler = async (req, res, next) => {
  try {
    res.json({ success: true, data: await EventService.publish(req.auth!.userId, req.params.id as string, res.locals.requestId) });
  } catch (error) { next(error); }
};

export const cancelEvent: RequestHandler = async (req, res, next) => {
  try {
    res.json({ success: true, data: await EventService.cancel(req.auth!.userId, req.params.id as string, res.locals.requestId) });
  } catch (error) { next(error); }
};

export const assignScanner: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json({ success: true, data: await EventService.assignScanner(req.auth!.userId, req.params.id as string, req.body.scannerId, res.locals.requestId) });
  } catch (error) { next(error); }
};

export const listEventScanners: RequestHandler = async (req, res, next) => {
  try {
    res.json({ success: true, data: await EventService.listScanners(req.auth!.userId, req.params.id as string) });
  } catch (error) { next(error); }
};

export const removeScanner: RequestHandler = async (req, res, next) => {
  try {
    res.json({ success: true, data: await EventService.removeScanner(req.auth!.userId, req.params.id as string, req.params.scannerId as string, res.locals.requestId) });
  } catch (error) { next(error); }
};

export const createTicketType: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json({ success: true, data: await EventService.createTicketType(req.auth!.userId, req.params.id as string, req.body, res.locals.requestId) });
  } catch (error) { next(error); }
};

export const updateTicketType: RequestHandler = async (req, res, next) => {
  try {
    res.json({ success: true, data: await EventService.updateTicketType(req.auth!.userId, req.params.id as string, req.params.ticketTypeId as string, req.body, res.locals.requestId) });
  } catch (error) { next(error); }
};

export const listMyEvents: RequestHandler = async (req, res, next) => {
  try { res.json({ success: true, data: await EventService.listMine(req.auth!.userId) }); }
  catch (error) { next(error); }
};

export const listEvents: RequestHandler = async (req, res, next) => {
  try { res.json({ success: true, data: await EventService.list(req.query) }); }
  catch (error) { next(error); }
};

export const getEvent: RequestHandler = async (req, res, next) => {
  try { res.json({ success: true, data: await EventService.getPublic(req.params.id as string) }); }
  catch (error) { next(error); }
};
