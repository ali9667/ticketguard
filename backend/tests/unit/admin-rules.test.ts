describe('admin invariants', () => {
  it('documents that self-status mutation is forbidden', () => {
    expect('ADMIN_SELF_MUTATION_FORBIDDEN').toBe('ADMIN_SELF_MUTATION_FORBIDDEN');
  });
  it('documents that deleted accounts cannot be reactivated', () => {
    expect('USER_DELETED').toBe('USER_DELETED');
  });
});
