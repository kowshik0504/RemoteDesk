import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePaginationMeta,
  canAddComment,
  canDeleteTicket,
  canEditTicketDetails,
  canManageTicketStatus,
  canViewTicket,
  computeResolutionRate,
  formatTicketCode,
  getPriorityWeight,
  normalizeEmail,
} from '../domain/rules';
import {
  adminUpdateTicketSchema,
  createCommentSchema,
  createTicketSchema,
  registerSchema,
} from '../validators/schemas';
import { buildTicketsCsv, escapeCsvCell } from '../../utils/csv';

test('RBAC: users can only view their own tickets while admins view all', () => {
  const user = { id: 10, role: 'USER' as const };
  const admin = { id: 1, role: 'ADMIN' as const };

  assert.equal(canViewTicket(user, { requesterId: 10, status: 'OPEN' }), true);
  assert.equal(canViewTicket(user, { requesterId: 22, status: 'OPEN' }), false);
  assert.equal(canViewTicket(admin, { requesterId: 22, status: 'CLOSED' }), true);
});

test('RBAC: users can edit own OPEN/IN_PROGRESS tickets only; cannot edit RESOLVED/CLOSED', () => {
  const owner = { id: 10, role: 'USER' as const };
  const other = { id: 11, role: 'USER' as const };
  const admin = { id: 1, role: 'ADMIN' as const };

  assert.equal(canEditTicketDetails(owner, { requesterId: 10, status: 'OPEN' }), true);
  assert.equal(canEditTicketDetails(owner, { requesterId: 10, status: 'IN_PROGRESS' }), true);
  assert.equal(canEditTicketDetails(owner, { requesterId: 10, status: 'RESOLVED' }), false);
  assert.equal(canEditTicketDetails(owner, { requesterId: 10, status: 'CLOSED' }), false);
  assert.equal(canEditTicketDetails(other, { requesterId: 10, status: 'OPEN' }), false);
  assert.equal(canEditTicketDetails(admin, { requesterId: 10, status: 'CLOSED' }), true);
});

test('RBAC: users can delete own OPEN tickets only; admins can delete any ticket', () => {
  const owner = { id: 10, role: 'USER' as const };
  const admin = { id: 1, role: 'ADMIN' as const };

  assert.equal(canDeleteTicket(owner, { requesterId: 10, status: 'OPEN' }), true);
  assert.equal(canDeleteTicket(owner, { requesterId: 10, status: 'IN_PROGRESS' }), false);
  assert.equal(canDeleteTicket(owner, { requesterId: 10, status: 'RESOLVED' }), false);
  assert.equal(canDeleteTicket(admin, { requesterId: 10, status: 'RESOLVED' }), true);
});

test('RBAC: only admins can manage ticket status or post internal notes', () => {
  const owner = { id: 10, role: 'USER' as const };
  const admin = { id: 1, role: 'ADMIN' as const };

  assert.equal(canManageTicketStatus(owner), false);
  assert.equal(canManageTicketStatus(admin), true);

  assert.equal(canAddComment(owner, { requesterId: 10, status: 'OPEN' }, false), true);
  assert.equal(canAddComment(owner, { requesterId: 10, status: 'OPEN' }, true), false);
  assert.equal(canAddComment(owner, { requesterId: 99, status: 'OPEN' }, false), false);
  assert.equal(canAddComment(admin, { requesterId: 99, status: 'OPEN' }, true), true);
});

test('Domain helpers: ticket codes, resolution rate, priority weights, email normalization', () => {
  assert.equal(formatTicketCode(1), 'TKT-1001');
  assert.equal(formatTicketCode(42), 'TKT-1042');
  assert.equal(computeResolutionRate(0, 0), 0);
  assert.equal(computeResolutionRate(3, 4), 75);
  assert.equal(getPriorityWeight('URGENT') > getPriorityWeight('HIGH'), true);
  assert.equal(getPriorityWeight('HIGH') > getPriorityWeight('MEDIUM'), true);
  assert.equal(getPriorityWeight('MEDIUM') > getPriorityWeight('LOW'), true);
  assert.equal(normalizeEmail('  Alex.Rivera@Example.COM '), 'alex.rivera@example.com');
});

test('Pagination metadata clamps bounds safely', () => {
  const meta = calculatePaginationMeta(2, 10, 25);
  assert.deepEqual(meta, { page: 2, limit: 10, total: 25, totalPages: 3 });

  const clamped = calculatePaginationMeta(99, 10, 15);
  assert.deepEqual(clamped, { page: 2, limit: 10, total: 15, totalPages: 2 });

  const empty = calculatePaginationMeta(1, 10, 0);
  assert.deepEqual(empty, { page: 1, limit: 10, total: 0, totalPages: 1 });
});

test('Zod validation enforces required fields and rejects malformed payloads', () => {
  assert.equal(
    registerSchema.safeParse({
      name: 'Maya Patel',
      email: 'maya@example.com',
      password: 'Password123!',
    }).success,
    true
  );
  assert.equal(
    registerSchema.safeParse({
      name: 'M',
      email: 'not-an-email',
      password: '123',
    }).success,
    false
  );

  assert.equal(
    createTicketSchema.safeParse({
      title: 'Webhook timeout in production',
      description: 'Outbound webhooks fail after 30s with HTTP 504.',
      category: 'Technical',
      priority: 'URGENT',
    }).success,
    true
  );
  assert.equal(
    createTicketSchema.safeParse({
      title: 'Hi',
      description: 'Short',
      category: 'UnknownCat',
      priority: 'CRITICAL',
    }).success,
    false
  );

  assert.equal(adminUpdateTicketSchema.safeParse({}).success, false);
  assert.equal(
    adminUpdateTicketSchema.safeParse({ status: 'RESOLVED' }).success,
    true
  );
  assert.equal(createCommentSchema.safeParse({ body: ' ' }).success, false);
});

test('CSV export neutralizes spreadsheet formula injection and escapes special characters', () => {
  assert.equal(escapeCsvCell('=SUM(A1:A5)'), `'=SUM(A1:A5)`);
  assert.equal(escapeCsvCell('+cmd|calc'), `'+cmd|calc`);
  assert.equal(escapeCsvCell('-2+3'), `'-2+3`);
  assert.equal(escapeCsvCell('@admin'), `'@admin`);
  assert.equal(escapeCsvCell('Billing, "Urgent"'), `"Billing, ""Urgent"""`);

  const csv = buildTicketsCsv([
    {
      id: 1,
      ticketCode: 'TKT-1001',
      title: '=1+1 Injection, test',
      description: 'desc',
      status: 'OPEN',
      priority: 'HIGH',
      category: 'Billing',
      requesterId: 2,
      requesterName: 'Maya Patel',
      requesterEmail: 'maya@example.com',
      assignedAdminId: null,
      assignedAdminName: null,
      commentCount: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      resolvedAt: null,
    },
  ]);

  const lines = csv.split('\r\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^Ticket Code,Title,Status,Priority/);
  assert.equal(lines[1].includes(`"'=1+1 Injection, test"`), true);
  assert.equal(lines[1].includes('Unassigned'), true);
});

