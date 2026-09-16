import type { Prisma, TicketStatus } from '@prisma/client';
import { assertTicketTransition } from './ticket-state.js';

type Tx = Prisma.TransactionClient;

export class TicketStateService {
  static async transition(tx: Tx, ticketId: string, from: TicketStatus, to: TicketStatus) {
    assertTicketTransition(from, to);
    const result = await tx.ticket.updateMany({
      where: { id: ticketId, status: from },
      data: { status: to, ...(to === 'ACTIVE' ? { usedAt: null, cancelledAt: null } : {}) }
    });
    if (result.count !== 1) throw new Error(`Ticket state changed concurrently: expected ${from}.`);
  }
}
