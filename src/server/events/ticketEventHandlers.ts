import { eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  activityLogs,
  emailOutbox,
  notifications,
  users,
} from '../../db/schema.ts';
import { ticketEventBus, type TicketEventPayload } from './ticketEventBus.ts';

let handlersRegistered = false;

function buildNotificationTitle(payload: TicketEventPayload): string {
  switch (payload.eventType) {
    case 'TICKET_CREATED':
      return `New ticket ${payload.ticketCode}`;
    case 'TICKET_UPDATED':
      return `Ticket ${payload.ticketCode} updated`;
    case 'STATUS_CHANGED':
      return `${payload.ticketCode} status: ${payload.metadata?.newStatus ?? 'Updated'}`;
    case 'COMMENT_ADDED':
      return `New reply on ${payload.ticketCode}`;
    case 'TICKET_RESOLVED':
      return `Ticket ${payload.ticketCode} resolved`;
    case 'TICKET_DELETED':
      return `Ticket ${payload.ticketCode} deleted`;
  }
}

function buildEmailSubject(payload: TicketEventPayload): string {
  switch (payload.eventType) {
    case 'TICKET_CREATED':
      return `[${payload.ticketCode}] Support ticket received: ${payload.ticketTitle}`;
    case 'STATUS_CHANGED':
      return `[${payload.ticketCode}] Status changed to ${payload.metadata?.newStatus ?? 'updated'}`;
    case 'TICKET_RESOLVED':
      return `[${payload.ticketCode}] Your support ticket has been resolved`;
    case 'COMMENT_ADDED':
      return `[${payload.ticketCode}] New response on "${payload.ticketTitle}"`;
    case 'TICKET_UPDATED':
      return `[${payload.ticketCode}] Ticket details updated`;
    case 'TICKET_DELETED':
      return `[${payload.ticketCode}] Ticket removed`;
  }
}

async function handleAuditLog(payload: TicketEventPayload): Promise<void> {
  try {
    await db.insert(activityLogs).values({
      eventType: payload.eventType,
      ticketId: payload.ticketId,
      ticketCode: payload.ticketCode,
      actorId: payload.actor.id,
      actorName: payload.actor.name,
      actorRole: payload.actor.role,
      summary: payload.summary,
      metadataJson: JSON.stringify(payload.metadata ?? {}),
    });
  } catch (err) {
    console.error('[EventHandler:AuditLog] Failed to record activity log:', err);
  }
}

async function handleNotificationsAndEmail(payload: TicketEventPayload): Promise<void> {
  // Internal admin notes should not notify or email the non-admin requester
  const isInternalComment =
    payload.eventType === 'COMMENT_ADDED' && payload.metadata?.isInternalComment === true;

  try {
    const title = buildNotificationTitle(payload);
    const subject = buildEmailSubject(payload);

    // 1. If a regular user creates a ticket or comments, notify all Admins
    if (
      payload.actor.role === 'USER' &&
      (payload.eventType === 'TICKET_CREATED' || payload.eventType === 'COMMENT_ADDED')
    ) {
      const admins = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.role, 'ADMIN'));

      if (admins.length > 0) {
        await db.insert(notifications).values(
          admins.map((admin) => ({
            userId: admin.id,
            ticketId: payload.ticketId,
            eventType: payload.eventType,
            title,
            message: payload.summary,
          }))
        );

        await db.insert(emailOutbox).values(
          admins.map((admin) => ({
            recipientEmail: admin.email,
            recipientName: admin.name,
            subject,
            body: `${payload.summary}\n\nTicket: ${payload.ticketCode} — ${payload.ticketTitle}\nSubmitted by: ${payload.requesterName} (${payload.requesterEmail})`,
            eventType: payload.eventType,
            ticketCode: payload.ticketCode,
            deliveryStatus: 'SENT',
          }))
        );
      }
    }

    // 2. Always send requester a confirmation email when they create a ticket
    if (payload.eventType === 'TICKET_CREATED') {
      await db.insert(emailOutbox).values({
        recipientEmail: payload.requesterEmail,
        recipientName: payload.requesterName,
        subject,
        body: `Hello ${payload.requesterName},\n\nYour support request "${payload.ticketTitle}" has been logged under reference ${payload.ticketCode}. Our team will review and respond shortly.`,
        eventType: payload.eventType,
        ticketCode: payload.ticketCode,
        deliveryStatus: 'SENT',
      });
    }

    // 3. When an Admin updates status, resolves a ticket, or adds a public comment,
    // notify and email the ticket requester (if actor !== requester)
    if (
      !isInternalComment &&
      payload.actor.id !== payload.requesterId &&
      (payload.eventType === 'STATUS_CHANGED' ||
        payload.eventType === 'TICKET_RESOLVED' ||
        payload.eventType === 'COMMENT_ADDED' ||
        payload.eventType === 'TICKET_UPDATED')
    ) {
      await db.insert(notifications).values({
        userId: payload.requesterId,
        ticketId: payload.ticketId,
        eventType: payload.eventType,
        title,
        message: payload.summary,
      });

      await db.insert(emailOutbox).values({
        recipientEmail: payload.requesterEmail,
        recipientName: payload.requesterName,
        subject,
        body: `Hello ${payload.requesterName},\n\n${payload.summary}\n\nTicket: ${payload.ticketCode} — ${payload.ticketTitle}`,
        eventType: payload.eventType,
        ticketCode: payload.ticketCode,
        deliveryStatus: 'SENT',
      });
    }
  } catch (err) {
    console.error('[EventHandler:Notifications] Failed to dispatch notifications:', err);
  }
}

export function registerTicketEventHandlers(): void {
  if (handlersRegistered) return;
  handlersRegistered = true;

  ticketEventBus.subscribe('*', handleAuditLog);
  ticketEventBus.subscribe('*', handleNotificationsAndEmail);
}
