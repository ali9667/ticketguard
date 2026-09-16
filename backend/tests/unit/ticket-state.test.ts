import { assertTicketTransition } from '../../src/modules/tickets/ticket-state.js';

describe('ticket state machine', () => {
  test.each([
    ['ISSUED', 'ACTIVE'], ['ACTIVE', 'TRANSFER_PENDING'], ['ACTIVE', 'USED'],
    ['ACTIVE', 'CANCELLED'], ['ACTIVE', 'EXPIRED'], ['TRANSFER_PENDING', 'ACTIVE'],
    ['TRANSFER_PENDING', 'CANCELLED'], ['TRANSFERRED', 'ACTIVE']
  ])('%s -> %s is valid', (from, to) => {
    expect(() => assertTicketTransition(from as never, to as never)).not.toThrow();
  });

  test.each([
    ['USED', 'ACTIVE'], ['CANCELLED', 'TRANSFER_PENDING'], ['EXPIRED', 'ACTIVE'],
    ['ACTIVE', 'ISSUED'], ['TRANSFERRED', 'USED']
  ])('%s -> %s is rejected', (from, to) => {
    expect(() => assertTicketTransition(from as never, to as never)).toThrow();
  });
});
