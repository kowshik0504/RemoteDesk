import { count } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  activityLogs,
  comments,
  emailOutbox,
  tickets,
  users,
} from '../../db/schema.ts';

let seedCheckedThisProcess = false;

/**
 * Lazily seeds realistic helpdesk sample tickets (owned by non-admin sample requesters)
 * ONLY when the tickets table is completely empty.
 * Note: Deliberately does NOT seed any ADMIN user or hardcoded passwords so the
 * one-time first-run administrator setup remains cleanly claimable.
 */
export async function ensureSampleDataSeeded(): Promise<void> {
  if (seedCheckedThisProcess) return;

  try {
    const [{ value: ticketCount }] = await db.select({ value: count() }).from(tickets);
    if (Number(ticketCount) > 0) {
      seedCheckedThisProcess = true;
      return;
    }

    const sampleRequesters = [
      {
        uid: 'seed_user_maya_patel',
        name: 'Maya Patel',
        email: 'maya.patel@northstar.io',
        role: 'USER',
        authProvider: 'SEED',
      },
      {
        uid: 'seed_user_david_chen',
        name: 'David Chen',
        email: 'david.chen@meridianlabs.co',
        role: 'USER',
        authProvider: 'SEED',
      },
      {
        uid: 'seed_user_elena_rostova',
        name: 'Elena Rostova',
        email: 'elena.rostova@vervecloud.net',
        role: 'USER',
        authProvider: 'SEED',
      },
    ];

    const insertedUsers: Array<{ id: number; name: string; email: string }> = [];
    for (const u of sampleRequesters) {
      const [row] = await db
        .insert(users)
        .values(u)
        .onConflictDoUpdate({
          target: users.email,
          set: { name: u.name },
        })
        .returning({ id: users.id, name: users.name, email: users.email });
      insertedUsers.push(row);
    }

    const [maya, david, elena] = insertedUsers;
    const now = Date.now();
    const hoursAgo = (h: number) => new Date(now - h * 60 * 60 * 1000);

    const sampleTickets = [
      {
        ticketCode: 'TKT-1001',
        title: 'Production webhook deliveries returning HTTP 504 timeout',
        description:
          'Starting at 09:15 UTC, outbound invoice webhooks to our billing endpoint have been timing out after 30 seconds. Retry queues are backing up and affecting customer receipt dispatch.',
        category: 'Technical',
        priority: 'URGENT',
        status: 'OPEN',
        requesterId: maya.id,
        createdAt: hoursAgo(2),
        updatedAt: hoursAgo(2),
      },
      {
        ticketCode: 'TKT-1002',
        title: 'Duplicate charge on annual Enterprise seat renewal invoice',
        description:
          'Our finance team noticed two identical line items for 25 seats on invoice #INV-2026-8841. Please review the billing ledger and issue a credit memo for the duplicate entry.',
        category: 'Billing',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        requesterId: david.id,
        createdAt: hoursAgo(7),
        updatedAt: hoursAgo(4),
      },
      {
        ticketCode: 'TKT-1003',
        title: 'SAML SSO metadata certificate rotation before December expiry',
        description:
          'Our Okta identity provider certificate expires in 14 days. We have uploaded the new X.509 certificate bundle and need helpdesk verification before cutting over production logins.',
        category: 'Security',
        priority: 'HIGH',
        status: 'OPEN',
        requesterId: elena.id,
        createdAt: hoursAgo(11),
        updatedAt: hoursAgo(11),
      },
      {
        ticketCode: 'TKT-1004',
        title: 'Export ticket audit trail as scheduled weekly CSV report',
        description:
          'Our compliance team reviews support SLAs every Monday morning. Having an automated CSV export or scheduled summary for resolved tickets would eliminate manual exports.',
        category: 'Feature Request',
        priority: 'LOW',
        status: 'OPEN',
        requesterId: maya.id,
        createdAt: hoursAgo(20),
        updatedAt: hoursAgo(20),
      },
      {
        ticketCode: 'TKT-1005',
        title: 'Unable to add regional team members to APAC workspace role',
        description:
          'When inviting three engineers from our Singapore office, the role dropdown stays disabled after entering their email addresses. Verified on Chrome 130 and Safari 18.',
        category: 'Account',
        priority: 'MEDIUM',
        status: 'IN_PROGRESS',
        requesterId: david.id,
        createdAt: hoursAgo(28),
        updatedAt: hoursAgo(16),
      },
      {
        ticketCode: 'TKT-1006',
        title: 'PostgreSQL read-replica latency spike during nightly analytics sync',
        description:
          'Reporting queries between 02:00 and 02:30 UTC showed elevated p95 latency (~1.8s). Requesting query plan review and connection pool sizing guidance.',
        category: 'Technical',
        priority: 'MEDIUM',
        status: 'RESOLVED',
        requesterId: elena.id,
        resolvedAt: hoursAgo(6),
        createdAt: hoursAgo(48),
        updatedAt: hoursAgo(6),
      },
      {
        ticketCode: 'TKT-1007',
        title: 'Update company VAT tax identification number on future receipts',
        description:
          'We recently completed our EU subsidiary registration and need our new VAT ID reflected on all upcoming monthly billing statements.',
        category: 'Billing',
        priority: 'LOW',
        status: 'CLOSED',
        requesterId: maya.id,
        resolvedAt: hoursAgo(36),
        createdAt: hoursAgo(72),
        updatedAt: hoursAgo(30),
      },
    ];

    const createdTickets = await db
      .insert(tickets)
      .values(sampleTickets)
      .onConflictDoNothing()
      .returning();

    if (createdTickets.length > 0) {
      const t1 = createdTickets.find((t) => t.ticketCode === 'TKT-1001');
      const t2 = createdTickets.find((t) => t.ticketCode === 'TKT-1002');
      const t6 = createdTickets.find((t) => t.ticketCode === 'TKT-1006');

      if (t2) {
        await db.insert(comments).values({
          ticketId: t2.id,
          authorId: david.id,
          body: 'Attached internal reference #INV-2026-8841 from our AP system. Please let us know once the ledger adjustment is queued.',
          isInternal: false,
          createdAt: hoursAgo(5),
        });
      }

      if (t6) {
        await db.insert(comments).values({
          ticketId: t6.id,
          authorId: elena.id,
          body: 'Confirmed p95 latency is back below 95ms after adding the composite index. Thank you for the quick turnaround.',
          isInternal: false,
          createdAt: hoursAgo(5),
        });
      }

      await db.insert(activityLogs).values(
        createdTickets.map((t) => {
          const owner =
            insertedUsers.find((u) => u.id === t.requesterId) ?? maya;
          return {
            eventType: 'TICKET_CREATED',
            ticketId: t.id,
            ticketCode: t.ticketCode,
            actorId: owner.id,
            actorName: owner.name,
            actorRole: 'USER',
            summary: `${owner.name} submitted ${t.ticketCode} (${t.priority} priority): "${t.title}"`,
            metadataJson: JSON.stringify({
              priority: t.priority,
              category: t.category,
            }),
            createdAt: t.createdAt,
          };
        })
      );

      if (t6) {
        await db.insert(activityLogs).values({
          eventType: 'TICKET_RESOLVED',
          ticketId: t6.id,
          ticketCode: t6.ticketCode,
          actorId: null,
          actorName: 'Support Operations',
          actorRole: 'ADMIN',
          summary: `Ticket ${t6.ticketCode} marked as RESOLVED after index optimization.`,
          metadataJson: JSON.stringify({
            previousStatus: 'IN_PROGRESS',
            newStatus: 'RESOLVED',
          }),
          createdAt: hoursAgo(6),
        });
      }

      if (t1) {
        await db.insert(emailOutbox).values({
          recipientEmail: maya.email,
          recipientName: maya.name,
          subject: `[${t1.ticketCode}] Support ticket received: ${t1.title}`,
          body: `Hello ${maya.name},\n\nYour URGENT support ticket ${t1.ticketCode} has been logged and routed to on-call engineering.`,
          eventType: 'TICKET_CREATED',
          ticketCode: t1.ticketCode,
          deliveryStatus: 'SENT',
          createdAt: t1.createdAt,
        });
      }
    }

    seedCheckedThisProcess = true;
  } catch (err) {
    console.error('[SeedService] Lazy seed skipped due to error:', err);
  }
}
