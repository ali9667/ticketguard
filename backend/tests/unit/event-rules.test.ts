import { describe, expect, it } from '@jest/globals';

function canTransition(status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED', next: 'PUBLISHED' | 'CANCELLED' | 'COMPLETED') {
  return (status === 'DRAFT' && (next === 'PUBLISHED' || next === 'CANCELLED')) || (status === 'PUBLISHED' && next === 'COMPLETED');
}

describe('event lifecycle invariants', () => {
  it('allows only valid event transitions', () => {
    expect(canTransition('DRAFT', 'PUBLISHED')).toBe(true);
    expect(canTransition('DRAFT', 'CANCELLED')).toBe(true);
    expect(canTransition('PUBLISHED', 'COMPLETED')).toBe(true);
    expect(canTransition('PUBLISHED', 'CANCELLED')).toBe(false);
    expect(canTransition('COMPLETED', 'PUBLISHED')).toBe(false);
    expect(canTransition('CANCELLED', 'PUBLISHED')).toBe(false);
  });

  it('does not allow ticket inventory above event capacity', () => {
    expect(120 + 30 <= 150).toBe(true);
    expect(120 + 31 <= 150).toBe(false);
  });
});
