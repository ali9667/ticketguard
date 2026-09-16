import { readFileSync } from 'node:fs';

test('example environment contains placeholders, not operational secrets', () => {
  const env = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
  expect(env).toContain('replace-with-');
  expect(env).not.toContain('TicketGuard-Local-2026!');
});
