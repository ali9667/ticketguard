import type {RequestHandler} from 'express';
import {TransferService} from './transfer.service.js';
export const createTransfer:RequestHandler=async(req,res,next)=>{try{res.status(201).json({success:true,data:await TransferService.create(req.auth!.userId,req.params.id as string,req.body.recipientEmail,res.locals.requestId)});}catch(e){next(e);}};
export const listTransfers:RequestHandler=async(req,res,next)=>{try{const rows=await TransferService.list(req.auth!.userId);res.json({success:true,data:rows});}catch(e){next(e);}};
export const getTransfer:RequestHandler=async(req,res,next)=>{try{res.json({success:true,data:await TransferService.get(req.auth!.userId,req.params.id as string)});}catch(e){next(e);}};
export const acceptTransfer:RequestHandler=async(req,res,next)=>{try{res.json({success:true,data:await TransferService.accept(req.auth!.userId,req.params.id as string,res.locals.requestId)});}catch(e){next(e);}};
export const rejectTransfer:RequestHandler=async(req,res,next)=>{try{res.json({success:true,data:await TransferService.reject(req.auth!.userId,req.params.id as string,res.locals.requestId)});}catch(e){next(e);}};
export const cancelTransfer:RequestHandler=async(req,res,next)=>{try{res.json({success:true,data:await TransferService.cancel(req.auth!.userId,req.params.id as string,res.locals.requestId)});}catch(e){next(e);}};
