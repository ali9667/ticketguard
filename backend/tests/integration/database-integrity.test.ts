import { prisma } from '../../src/infrastructure/database/prisma.js';

describe('PostgreSQL integrity constraints', () => {
  afterAll(async () => { await prisma.$disconnect(); });

  test('database connection is real PostgreSQL', async () => {
    const rows = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version()`;
    expect(rows[0]?.version).toMatch(/PostgreSQL/i);
  });

  test('audit logs reject mutation at database level', async () => {
    const row = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM audit_logs LIMIT 1`;
    if (!row[0]) return;
    await expect(prisma.$executeRaw`DELETE FROM audit_logs WHERE id = ${row[0].id}::uuid`).rejects.toThrow();
  });
});
