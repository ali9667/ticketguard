import { describe, expect, it } from '@jest/globals';
import { assertTicketTransition } from '../../src/modules/tickets/ticket-state.js';

describe('Phase 6 transfer invariants', () => {
  it('requires ACTIVE tickets to enter TRANSFER_PENDING', () => {
    expect(() => assertTicketTransition('ACTIVE', 'TRANSFER_PENDING')).not.toThrow();
  });

  it('rejects transfer from terminal ticket states', () => {
    for (const status of ['USED', 'CANCELLED', 'EXPIRED'] as const) {
      expect(() => assertTicketTransition(status, 'TRANSFER_PENDING')).toThrow();
    }
  });

  it('allows a pending transfer to return to ACTIVE on rejection/cancellation/expiry', () => {
    expect(() => assertTicketTransition('TRANSFER_PENDING', 'ACTIVE')).not.toThrow();
  });
});
