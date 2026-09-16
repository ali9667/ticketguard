import type {RequestHandler} from 'express';
import {VerificationService} from './verification.service.js';
export const verifyTicket:RequestHandler=async(req,res,next)=>{try{res.json({success:true,data:await VerificationService.verify(req.auth!.userId,req.body.credential,res.locals.requestId,req.ip)});}catch(e){next(e);}};
