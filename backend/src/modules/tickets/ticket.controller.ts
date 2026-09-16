import type { RequestHandler } from 'express';
import { TicketService } from './ticket.service.js';
export const issueTickets:RequestHandler=async(req,res,next)=>{try{res.status(201).json({success:true,data:await TicketService.issue(req.auth!.userId,req.params.eventId as string,req.body,res.locals.requestId)});}catch(e){next(e);}};
export const listTickets:RequestHandler=async(req,res,next)=>{try{res.json({success:true,data:await TicketService.listOwned(req.auth!.userId)});}catch(e){next(e);}};
export const getTicket:RequestHandler=async(req,res,next)=>{try{res.json({success:true,data:await TicketService.getOwned(req.auth!.userId,req.params.id as string)});}catch(e){next(e);}};
export const cancelTicket:RequestHandler=async(req,res,next)=>{try{res.json({success:true,data:await TicketService.cancel(req.auth!.userId,req.params.id as string,res.locals.requestId)});}catch(e){next(e);}};
