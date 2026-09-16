import { randomBytes } from 'node:crypto';
import { prisma } from '../../infrastructure/database/prisma.js';
import { randomToken, sha256, safeEqualHash } from '../../utils/hash.js';
import { encryptSecret, decryptSecret } from '../../utils/encryption.js';

export class TicketCredentialService {
  static create() {
  const identifier = randomBytes(16).toString('hex');
  const secret = randomToken(32);
  const secretHash = sha256(secret);
  const secretCiphertext = encryptSecret(secret);

  return {
    identifier,
    secret,
    secretHash,
    secretCiphertext,
    payload: `tg1.${identifier}.${secret}`,
  };
}

  static async revokeAndCreate(ticketId: string, tx: Pick<typeof prisma, 'ticketCredential'> = prisma) {
    const current = await tx.ticketCredential.findFirst({ where: { ticketId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });
    if (current) await tx.ticketCredential.update({ where: { id: current.id }, data: { status: 'REVOKED', revokedAt: new Date() } });
    const credential = this.create();
    await tx.ticketCredential.create({ data: { ticketId, identifier: credential.identifier, secretHash: credential.secretHash, secretCiphertext: credential.secretCiphertext } });
    return credential;
  }

  static payloadFromStored(credential: { identifier: string; secretCiphertext: string }): string {
    return `tg1.${credential.identifier}.${decryptSecret(credential.secretCiphertext)}`;
  }

  static parse(rawCredential: string): { identifier: string; secret: string } | null {
    const parts = rawCredential.split('.');
    if (parts.length !== 3 || parts[0] !== 'tg1') return null;
    const [, identifier, secret] = parts;
    if (!identifier || !secret) return null;
    return { identifier, secret };
  }

  static async resolve(rawCredential: string) {
    const parsed = this.parse(rawCredential);
    if (!parsed) return null;
    const credential = await prisma.ticketCredential.findUnique({ where: { identifier: parsed.identifier }, include: { ticket: { include: { event: true, owner: true } } } });
    if (!credential || credential.status !== 'ACTIVE' || !safeEqualHash(parsed.secret, credential.secretHash)) return null;
    return credential;
  }
}
