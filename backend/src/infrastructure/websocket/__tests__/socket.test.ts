import { isSocketServerReady } from '../socket.js';

describe('Socket infrastructure', () => {
  it('does not claim readiness before a server is created', () => {
    expect(isSocketServerReady()).toBe(false);
  });
});
