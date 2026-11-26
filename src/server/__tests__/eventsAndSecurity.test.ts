import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  safeCompareSecret,
  signAuthToken,
  verifyAuthToken,
  verifyPassword,
} from '../utils/security';
import { ticketEventBus, type TicketEventPayload } from '../events/ticketEventBus';

test('Security: scrypt password hashing uses random salt and verifies accurately', async () => {
  const hashA = await hashPassword('StrongPass!2026');
  const hashB = await hashPassword('StrongPass!2026');

  assert.notEqual(hashA, hashB, 'Same password must produce distinct salted hashes');
  assert.equal(await verifyPassword('StrongPass!2026', hashA), true);
  assert.equal(await verifyPassword('WrongPass!2026', hashA), false);
  assert.equal(await verifyPassword('StrongPass!2026', 'malformed-hash'), false);
});

test('Security: JWT sign and verify round-trip preserves claims and rejects tampering', () => {
  const token = signAuthToken({
    sub: 7,
    uid: 'local_abc-123',
    email: 'admin@resolvedesk.io',
    role: 'ADMIN',
    name: 'Admin User',
  });

  const verified = verifyAuthToken(token);
  assert.equal(verified.sub, 7);
  assert.equal(verified.uid, 'local_abc-123');
  assert.equal(verified.email, 'admin@resolvedesk.io');
  assert.equal(verified.role, 'ADMIN');

  assert.throws(() => verifyAuthToken(`${token}tampered`));
});

test('Security: constant-time secret comparison matches exact strings only', () => {
  assert.equal(safeCompareSecret('my-secret-key', 'my-secret-key'), true);
  assert.equal(safeCompareSecret('my-secret-key', 'my-secret-kez'), false);
  assert.equal(safeCompareSecret('short', 'longer-secret'), false);
});

test('Event Bus: publishes typed events to subscribers and isolates handler failures', async () => {
  const received: string[] = [];

  const unsub1 = ticketEventBus.subscribe('TICKET_RESOLVED', () => {
    throw new Error('Simulated transient handler error');
  });
  const unsub2 = ticketEventBus.subscribe('TICKET_RESOLVED', (payload) => {
    received.push(`${payload.eventType}:${payload.ticketCode}`);
  });

  const samplePayload: TicketEventPayload = {
    eventType: 'TICKET_RESOLVED',
    ticketId: 101,
    ticketCode: 'TKT-1101',
    ticketTitle: 'Fix SAML certificate rotation',
    requesterId: 4,
    requesterName: 'Elena Rostova',
    requesterEmail: 'elena@vervecloud.net',
    actor: {
      id: 1,
      name: 'Support Admin',
      email: 'admin@resolvedesk.io',
      role: 'ADMIN',
    },
    summary: 'Support Admin marked TKT-1101 as RESOLVED.',
    metadata: {
      previousStatus: 'IN_PROGRESS',
      newStatus: 'RESOLVED',
    },
  };

  const origConsoleError = console.error;
  console.error = () => {};
  try {
    await ticketEventBus.publish(samplePayload);
  } finally {
    console.error = origConsoleError;
  }
  assert.deepEqual(received, ['TICKET_RESOLVED:TKT-1101']);

  unsub1();
  unsub2();
});
