import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { createApiApp } from '../app.ts';
import { db } from '../../db/index.ts';
import { activityLogs, emailOutbox, users } from '../../db/schema.ts';
import { hashPassword, signAuthToken } from '../utils/security.ts';

const hasDbEnv = Boolean(
  process.env.SQL_HOST &&
    process.env.SQL_USER &&
    process.env.SQL_PASSWORD &&
    process.env.SQL_DB_NAME
);

const runId = crypto.randomBytes(4).toString('hex');
const userAEmail = `itest.usera.${runId}@resolvedesk.test`;
const userBEmail = `itest.userb.${runId}@resolvedesk.test`;
const adminEmail = `itest.admin.${runId}@resolvedesk.test`;

let server: http.Server;
let baseUrl = '';
let userAToken = '';
let userAId = 0;
let userBToken = '';
let adminToken = '';
let adminId = 0;
let createdTicketId = 0;
let createdTicketCode = '';

async function apiFetch(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {}
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

before(async () => {
  const app = createApiApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to bind ephemeral integration test port');
  }
  baseUrl = `http://127.0.0.1:${addr.port}`;

  if (hasDbEnv) {
    const adminHash = await hashPassword('AdminTestPass!2026');
    const [adminRow] = await db
      .insert(users)
      .values({
        uid: `itest_admin_${runId}`,
        name: `Integration Admin ${runId}`,
        email: adminEmail,
        passwordHash: adminHash,
        role: 'ADMIN',
        authProvider: 'LOCAL',
      })
      .returning();
    adminId = adminRow.id;
    adminToken = signAuthToken({
      sub: adminRow.id,
      uid: adminRow.uid,
      email: adminRow.email,
      role: 'ADMIN',
      name: adminRow.name,
    });
  }
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  if (hasDbEnv) {
    const testEmails = [userAEmail, userBEmail, adminEmail];
    await db
      .delete(emailOutbox)
      .where(inArray(emailOutbox.recipientEmail, testEmails))
      .catch(() => undefined);
    if (createdTicketCode) {
      await db
        .delete(activityLogs)
        .where(inArray(activityLogs.ticketCode, [createdTicketCode]))
        .catch(() => undefined);
    }
    await db
      .delete(users)
      .where(inArray(users.email, testEmails))
      .catch(() => undefined);
  }
});

test('API: GET /api/health returns 200 OK', async () => {
  const res = await apiFetch('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.data.status, 'ok');
});

test('API: unauthenticated access to /api/tickets returns 401', async () => {
  const res = await apiFetch('/api/tickets');
  assert.equal(res.status, 401);
});

test('API: full User + Admin lifecycle, RBAC isolation, comments, and event workflow', {
  skip: !hasDbEnv ? 'Database env vars not set' : false,
}, async () => {
  // 1. Register User A & User B
  const regA = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: { name: 'Integration User A', email: userAEmail, password: 'UserPass!2026' },
  });
  assert.equal(regA.status, 201);
  assert.equal(regA.data.user.role, 'USER');
  userAToken = regA.data.token;
  userAId = regA.data.user.id;

  // Duplicate email returns 409 Conflict
  const dupA = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: { name: 'Dup User', email: userAEmail, password: 'UserPass!2026' },
  });
  assert.equal(dupA.status, 409);

  // Login verifies credentials and issues JWT
  const loginA = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: { email: userAEmail, password: 'UserPass!2026' },
  });
  assert.equal(loginA.status, 200);
  assert.ok(loginA.data.token);

  const regB = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: { name: 'Integration User B', email: userBEmail, password: 'UserPass!2026' },
  });
  assert.equal(regB.status, 201);
  userBToken = regB.data.token;

  // 2. User A creates a support ticket
  const created = await apiFetch('/api/tickets', {
    method: 'POST',
    token: userAToken,
    body: {
      title: `Integration webhook outage ${runId}`,
      description: 'Webhook requests to our production endpoint are failing with HTTP 502.',
      category: 'Technical',
      priority: 'HIGH',
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.ticket.status, 'OPEN');
  createdTicketId = created.data.ticket.id;
  createdTicketCode = created.data.ticket.ticketCode;

  // 3. RBAC isolation: User B cannot view, edit, comment on, or delete User A's ticket
  const viewByB = await apiFetch(`/api/tickets/${createdTicketId}`, { token: userBToken });
  assert.equal(viewByB.status, 403);

  const editByB = await apiFetch(`/api/tickets/${createdTicketId}`, {
    method: 'PATCH',
    token: userBToken,
    body: { title: 'Unauthorized edit attempt' },
  });
  assert.equal(editByB.status, 403);

  const adminRouteByUser = await apiFetch(`/api/tickets/${createdTicketId}/admin`, {
    method: 'PATCH',
    token: userAToken,
    body: { status: 'RESOLVED' },
  });
  assert.equal(adminRouteByUser.status, 403);

  const adminUsersByUser = await apiFetch('/api/admin/users', { token: userAToken });
  assert.equal(adminUsersByUser.status, 403);

  // 4. User A edits own OPEN ticket and posts a comment
  const editByA = await apiFetch(`/api/tickets/${createdTicketId}`, {
    method: 'PATCH',
    token: userAToken,
    body: { priority: 'URGENT' },
  });
  assert.equal(editByA.status, 200);
  assert.equal(editByA.data.ticket.priority, 'URGENT');

  const commentByA = await apiFetch(`/api/tickets/${createdTicketId}/comments`, {
    method: 'POST',
    token: userAToken,
    body: { body: 'Confirmed reproducible on EU-West nodes as well.' },
  });
  assert.equal(commentByA.status, 201);

  // 5. Admin filters by requesterId, adds internal note + public reply, and marks RESOLVED
  const adminFiltered = await apiFetch(
    `/api/tickets?requesterId=${userAId}&priority=URGENT`,
    { token: adminToken }
  );
  assert.equal(adminFiltered.status, 200);
  assert.equal(adminFiltered.data.tickets.length, 1);
  assert.equal(adminFiltered.data.tickets[0].id, createdTicketId);

  const internalNote = await apiFetch(`/api/tickets/${createdTicketId}/comments`, {
    method: 'POST',
    token: adminToken,
    body: { body: 'Internal engineering note: upstream nginx timeout.', isInternal: true },
  });
  assert.equal(internalNote.status, 201);
  assert.equal(internalNote.data.comment.isInternal, true);

  const resolveByAdmin = await apiFetch(`/api/tickets/${createdTicketId}/admin`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'RESOLVED', assignedAdminId: adminId },
  });
  assert.equal(resolveByAdmin.status, 200);
  assert.equal(resolveByAdmin.data.ticket.status, 'RESOLVED');
  assert.ok(resolveByAdmin.data.ticket.resolvedAt);

  // 6. User A sees ticket detail without internal note, cannot edit/delete RESOLVED ticket
  const detailForA = await apiFetch(`/api/tickets/${createdTicketId}`, { token: userAToken });
  assert.equal(detailForA.status, 200);
  assert.equal(
    detailForA.data.comments.some((c: { isInternal: boolean }) => c.isInternal),
    false,
    'Internal admin notes must be hidden from non-admin requesters'
  );

  const editResolvedByA = await apiFetch(`/api/tickets/${createdTicketId}`, {
    method: 'PATCH',
    token: userAToken,
    body: { title: 'Should be blocked after resolve' },
  });
  assert.equal(editResolvedByA.status, 403);

  // 7. Verify event-driven audit logs and User A notifications
  const activity = await apiFetch('/api/activity?eventType=TICKET_RESOLVED', {
    token: adminToken,
  });
  assert.equal(activity.status, 200);
  assert.ok(
    activity.data.logs.some(
      (l: { ticketCode: string }) => l.ticketCode === createdTicketCode
    )
  );

  const notifsA = await apiFetch('/api/notifications', { token: userAToken });
  assert.equal(notifsA.status, 200);
  assert.ok(notifsA.data.unreadCount >= 1);

  const readAll = await apiFetch('/api/notifications/read-all', {
    method: 'POST',
    token: userAToken,
  });
  assert.equal(readAll.status, 200);

  // 8. Admin deletes test ticket cleanly
  const delByAdmin = await apiFetch(`/api/tickets/${createdTicketId}`, {
    method: 'DELETE',
    token: adminToken,
  });
  assert.equal(delByAdmin.status, 200);
  assert.equal(delByAdmin.data.deleted, true);
});
