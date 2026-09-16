import type { TicketStatus } from '@prisma/client';
import { AppError } from '../../utils/app-error.js';

const transitions: Record<TicketStatus, readonly TicketStatus[]> = {
  ISSUED: ['ACTIVE'],
  ACTIVE: ['TRANSFER_PENDING', 'USED', 'CANCELLED', 'EXPIRED'],
  TRANSFER_PENDING: ['ACTIVE', 'TRANSFERRED', 'CANCELLED'],
  TRANSFERRED: ['ACTIVE'],
  USED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export const assertTicketTransition = (from: TicketStatus, to: TicketStatus): void => {
  if (!transitions[from].includes(to)) throw new AppError('TICKET_INVALID_STATE_TRANSITION', `Cannot transition ticket from ${from} to ${to}.`, 409);
};
