import type { Prisma, SecurityEventType, SecuritySeverity } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma.js';

export class SecurityService {
  static async record(input:{actorId:string|undefined;type:SecurityEventType;severity:SecuritySeverity;requestId:string;ipAddress?:string;metadata?:Prisma.InputJsonValue}, db:typeof prisma|Prisma.TransactionClient=prisma){
    return db.securityEvent.create({data:{...(input.actorId?{actorId:input.actorId}:{}),type:input.type,severity:input.severity,requestId:input.requestId,...(input.ipAddress?{ipAddress:input.ipAddress}:{}),...(input.metadata!==undefined?{metadata:input.metadata}:{})}});
  }
}
