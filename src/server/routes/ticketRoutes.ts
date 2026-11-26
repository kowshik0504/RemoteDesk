import { Router } from 'express';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { activityLogs, comments, tickets, users } from '../../db/schema.ts';
import {
  requireAdmin,
  requireAuth,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import { AppError } from '../middleware/errorHandler.ts';
import {
  adminUpdateTicketSchema,
  createCommentSchema,
  createTicketSchema,
  ticketQuerySchema,
  updateTicketSchema,
} from '../validators/schemas.ts';
import {
  calculatePaginationMeta,
  canAddComment,
  canDeleteTicket,
  canEditTicketDetails,
  canViewTicket,
  formatTicketCode,
} from '../domain/rules.ts';
import { ticketEventBus } from '../events/ticketEventBus.ts';
import { ensureSampleDataSeeded } from '../services/seedService.ts';
import type {
  TicketCategory,
  TicketListItem,
  TicketPriority,
  TicketStatus,
  UserRole,
} from '../../shared/types.ts';

const router = Router();

function parsePositiveIntId(raw: string, label = 'Ticket ID'): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, `Invalid ${label}.`, 'INVALID_ID');
  }
  return id;
}

async function hydrateTicketRows(
  rows: Array<typeof tickets.$inferSelect>
): Promise<TicketListItem[]> {
  if (rows.length === 0) return [];

  const userIds = new Set<number>();
  const ticketIds: number[] = [];
  for (const r of rows) {
    ticketIds.push(r.id);
    userIds.add(r.requesterId);
    if (r.assignedAdminId) userIds.add(r.assignedAdminId);
  }

  const userList = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, Array.from(userIds)));

  const userMap = new Map(userList.map((u) => [u.id, u]));

  const commentCounts = await db
    .select({
      ticketId: comments.ticketId,
      total: count(),
    })
    .from(comments)
    .where(inArray(comments.ticketId, ticketIds))
    .groupBy(comments.ticketId);

  const commentCountMap = new Map(
    commentCounts.map((c) => [c.ticketId, Number(c.total)])
  );

  return rows.map((row) => {
    const requester = userMap.get(row.requesterId);
    const assignee = row.assignedAdminId
      ? userMap.get(row.assignedAdminId)
      : undefined;

    return {
      id: row.id,
      ticketCode: row.ticketCode,
      title: row.title,
      description: row.description,
      category: row.category as TicketCategory,
      priority: row.priority as TicketPriority,
      status: row.status as TicketStatus,
      requesterId: row.requesterId,
      requesterName: requester?.name ?? 'Unknown User',
      requesterEmail: requester?.email ?? '',
      assignedAdminId: row.assignedAdminId ?? null,
      assignedAdminName: assignee?.name ?? null,
      commentCount: commentCountMap.get(row.id) ?? 0,
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

// GET /api/tickets — List tickets (RBAC scoped) with filtering, search, sorting & pagination
router.get('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    await ensureSampleDataSeeded();

    const authUser = req.authUser!;
    const query = ticketQuerySchema.parse(req.query);

    const conditions = [];

    if (authUser.role !== 'ADMIN') {
      conditions.push(eq(tickets.requesterId, authUser.id));
    } else if (query.requesterId !== undefined) {
      conditions.push(eq(tickets.requesterId, query.requesterId));
    }
    if (query.status !== 'ALL') {
      conditions.push(eq(tickets.status, query.status));
    }
    if (query.priority !== 'ALL') {
      conditions.push(eq(tickets.priority, query.priority));
    }
    if (query.category !== 'ALL') {
      conditions.push(eq(tickets.category, query.category));
    }
    if (query.search.length > 0) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(tickets.title, pattern),
          ilike(tickets.description, pattern),
          ilike(tickets.ticketCode, pattern)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ value: totalCount }] = await db
      .select({ value: count() })
      .from(tickets)
      .where(whereClause);

    const pagination = calculatePaginationMeta(
      query.page,
      query.limit,
      Number(totalCount)
    );
    const offset = (pagination.page - 1) * pagination.limit;

    const priorityRankExpr = sql`CASE ${tickets.priority}
      WHEN 'URGENT' THEN 4
      WHEN 'HIGH' THEN 3
      WHEN 'MEDIUM' THEN 2
      ELSE 1
    END`;

    const orderColumn =
      query.sortBy === 'priority'
        ? priorityRankExpr
        : query.sortBy === 'updatedAt'
        ? tickets.updatedAt
        : tickets.createdAt;

    const orderDirective =
      query.sortOrder === 'asc' ? asc(orderColumn) : desc(orderColumn);

    const rows = await db
      .select()
      .from(tickets)
      .where(whereClause)
      .orderBy(orderDirective, desc(tickets.id))
      .limit(pagination.limit)
      .offset(offset);

    const hydrated = await hydrateTicketRows(rows);

    return res.json({
      tickets: hydrated,
      pagination,
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/tickets — Create a new support ticket & emit TICKET_CREATED event
router.post('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const authUser = req.authUser!;
    const parsed = createTicketSchema.parse(req.body);

    const [{ maxId }] = await db
      .select({ maxId: sql<number>`COALESCE(MAX(${tickets.id}), 0)` })
      .from(tickets);

    let nextSeq = Number(maxId) + 1;
    let ticketCode = formatTicketCode(nextSeq);

    // Ensure uniqueness even if rows were deleted
    const existingCode = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(eq(tickets.ticketCode, ticketCode))
      .limit(1);
    if (existingCode.length > 0) {
      ticketCode = `TKT-${1000 + nextSeq}-${Date.now().toString().slice(-3)}`;
    }

    const [created] = await db
      .insert(tickets)
      .values({
        ticketCode,
        title: parsed.title,
        description: parsed.description,
        category: parsed.category,
        priority: parsed.priority,
        status: 'OPEN',
        requesterId: authUser.id,
      })
      .returning();

    await ticketEventBus.publish({
      eventType: 'TICKET_CREATED',
      ticketId: created.id,
      ticketCode: created.ticketCode,
      ticketTitle: created.title,
      requesterId: authUser.id,
      requesterName: authUser.name,
      requesterEmail: authUser.email,
      actor: {
        id: authUser.id,
        name: authUser.name,
        email: authUser.email,
        role: authUser.role,
      },
      summary: `${authUser.name} created ${created.ticketCode} (${created.priority} · ${created.category}): "${created.title}"`,
      metadata: {
        newStatus: 'OPEN',
        newPriority: created.priority as TicketPriority,
      },
    });

    const [hydrated] = await hydrateTicketRows([created]);
    return res.status(201).json({ ticket: hydrated });
  } catch (err) {
    return next(err);
  }
});

// GET /api/tickets/:id — View ticket details, comments & event history
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const authUser = req.authUser!;
    const ticketId = parsePositiveIntId(String(req.params.id));

    const [found] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!found) {
      throw new AppError(404, 'Support ticket not found.', 'TICKET_NOT_FOUND');
    }

    if (
      !canViewTicket(authUser, {
        requesterId: found.requesterId,
        status: found.status as TicketStatus,
      })
    ) {
      throw new AppError(
        403,
        'You do not have permission to view this ticket.',
        'FORBIDDEN'
      );
    }

    const [hydrated] = await hydrateTicketRows([found]);

    const commentConditions = [eq(comments.ticketId, ticketId)];
    if (authUser.role !== 'ADMIN') {
      commentConditions.push(eq(comments.isInternal, false));
    }

    const commentRows = await db
      .select({
        id: comments.id,
        ticketId: comments.ticketId,
        authorId: comments.authorId,
        body: comments.body,
        isInternal: comments.isInternal,
        createdAt: comments.createdAt,
        authorName: users.name,
        authorEmail: users.email,
        authorRole: users.role,
      })
      .from(comments)
      .innerJoin(users, eq(comments.authorId, users.id))
      .where(and(...commentConditions))
      .orderBy(asc(comments.createdAt));

    const eventRows = await db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.ticketId, ticketId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(30);

    return res.json({
      ticket: hydrated,
      comments: commentRows.map((c) => ({
        id: c.id,
        ticketId: c.ticketId,
        authorId: c.authorId,
        authorName: c.authorName,
        authorEmail: c.authorEmail,
        authorRole: c.authorRole as UserRole,
        body: c.body,
        isInternal: c.isInternal,
        createdAt: c.createdAt.toISOString(),
      })),
      activityLogs: eventRows.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        ticketId: e.ticketId,
        ticketCode: e.ticketCode,
        actorId: e.actorId,
        actorName: e.actorName,
        actorRole: e.actorRole,
        summary: e.summary,
        metadataJson: e.metadataJson,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/tickets/:id — Edit ticket details (owner when OPEN/IN_PROGRESS, or Admin)
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const authUser = req.authUser!;
    const ticketId = parsePositiveIntId(String(req.params.id));
    const parsed = updateTicketSchema.parse(req.body);

    const [existing] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!existing) {
      throw new AppError(404, 'Support ticket not found.', 'TICKET_NOT_FOUND');
    }

    if (
      !canEditTicketDetails(authUser, {
        requesterId: existing.requesterId,
        status: existing.status as TicketStatus,
      })
    ) {
      throw new AppError(
        403,
        'You can only edit your own active (Open or In Progress) tickets.',
        'FORBIDDEN'
      );
    }

    const changedFields: string[] = [];
    if (parsed.title !== undefined && parsed.title !== existing.title) {
      changedFields.push('title');
    }
    if (
      parsed.description !== undefined &&
      parsed.description !== existing.description
    ) {
      changedFields.push('description');
    }
    if (parsed.category !== undefined && parsed.category !== existing.category) {
      changedFields.push('category');
    }
    if (parsed.priority !== undefined && parsed.priority !== existing.priority) {
      changedFields.push('priority');
    }

    const [updated] = await db
      .update(tickets)
      .set({
        ...(parsed.title !== undefined ? { title: parsed.title } : {}),
        ...(parsed.description !== undefined
          ? { description: parsed.description }
          : {}),
        ...(parsed.category !== undefined ? { category: parsed.category } : {}),
        ...(parsed.priority !== undefined ? { priority: parsed.priority } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, ticketId))
      .returning();

    const [requester] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, existing.requesterId))
      .limit(1);

    await ticketEventBus.publish({
      eventType: 'TICKET_UPDATED',
      ticketId: updated.id,
      ticketCode: updated.ticketCode,
      ticketTitle: updated.title,
      requesterId: existing.requesterId,
      requesterName: requester?.name ?? 'User',
      requesterEmail: requester?.email ?? '',
      actor: {
        id: authUser.id,
        name: authUser.name,
        email: authUser.email,
        role: authUser.role,
      },
      summary: `${authUser.name} updated ${updated.ticketCode}${
        changedFields.length > 0 ? ` (${changedFields.join(', ')})` : ''
      }.`,
      metadata: {
        previousPriority: existing.priority as TicketPriority,
        newPriority: updated.priority as TicketPriority,
        changedFields,
      },
    });

    const [hydrated] = await hydrateTicketRows([updated]);
    return res.json({ ticket: hydrated });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/tickets/:id/admin — Admin-only status, priority, category & assignee management
router.patch(
  '/:id/admin',
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const authUser = req.authUser!;
      const ticketId = parsePositiveIntId(String(req.params.id));
      const parsed = adminUpdateTicketSchema.parse(req.body);

      const [existing] = await db
        .select()
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .limit(1);

      if (!existing) {
        throw new AppError(404, 'Support ticket not found.', 'TICKET_NOT_FOUND');
      }

      const previousStatus = existing.status as TicketStatus;
      const nextStatus = (parsed.status ?? existing.status) as TicketStatus;
      const statusChanged = nextStatus !== previousStatus;

      const previousPriority = existing.priority as TicketPriority;
      const nextPriority = (parsed.priority ??
        existing.priority) as TicketPriority;
      const priorityChanged = nextPriority !== previousPriority;

      let resolvedAtValue = existing.resolvedAt;
      if (statusChanged && nextStatus === 'RESOLVED') {
        resolvedAtValue = new Date();
      } else if (
        statusChanged &&
        (nextStatus === 'OPEN' || nextStatus === 'IN_PROGRESS')
      ) {
        resolvedAtValue = null;
      }

      const [updated] = await db
        .update(tickets)
        .set({
          ...(parsed.status !== undefined ? { status: parsed.status } : {}),
          ...(parsed.priority !== undefined ? { priority: parsed.priority } : {}),
          ...(parsed.category !== undefined ? { category: parsed.category } : {}),
          ...(parsed.assignedAdminId !== undefined
            ? { assignedAdminId: parsed.assignedAdminId }
            : {}),
          resolvedAt: resolvedAtValue,
          updatedAt: new Date(),
        })
        .where(eq(tickets.id, ticketId))
        .returning();

      const [requester] = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, existing.requesterId))
        .limit(1);

      const basePayload = {
        ticketId: updated.id,
        ticketCode: updated.ticketCode,
        ticketTitle: updated.title,
        requesterId: existing.requesterId,
        requesterName: requester?.name ?? 'User',
        requesterEmail: requester?.email ?? '',
        actor: {
          id: authUser.id,
          name: authUser.name,
          email: authUser.email,
          role: authUser.role,
        },
      };

      if (statusChanged) {
        await ticketEventBus.publish({
          ...basePayload,
          eventType: 'STATUS_CHANGED',
          summary: `${authUser.name} changed ${updated.ticketCode} status from ${previousStatus} to ${nextStatus}.`,
          metadata: {
            previousStatus,
            newStatus: nextStatus,
          },
        });

        if (nextStatus === 'RESOLVED') {
          await ticketEventBus.publish({
            ...basePayload,
            eventType: 'TICKET_RESOLVED',
            summary: `${authUser.name} marked ${updated.ticketCode} ("${updated.title}") as RESOLVED.`,
            metadata: {
              previousStatus,
              newStatus: 'RESOLVED',
            },
          });
        }
      }

      if (
        priorityChanged ||
        parsed.category !== undefined ||
        parsed.assignedAdminId !== undefined
      ) {
        const changes: string[] = [];
        if (priorityChanged) {
          changes.push(`priority ${previousPriority} → ${nextPriority}`);
        }
        if (
          parsed.category !== undefined &&
          parsed.category !== existing.category
        ) {
          changes.push(`category → ${parsed.category}`);
        }
        if (parsed.assignedAdminId !== undefined) {
          changes.push(
            parsed.assignedAdminId ? 'assignee updated' : 'unassigned'
          );
        }
        if (changes.length > 0) {
          await ticketEventBus.publish({
            ...basePayload,
            eventType: 'TICKET_UPDATED',
            summary: `${authUser.name} updated ${updated.ticketCode}: ${changes.join(', ')}.`,
            metadata: {
              previousPriority,
              newPriority: nextPriority,
              changedFields: changes,
            },
          });
        }
      }

      const [hydrated] = await hydrateTicketRows([updated]);
      return res.json({ ticket: hydrated });
    } catch (err) {
      return next(err);
    }
  }
);

// DELETE /api/tickets/:id — Delete ticket (Owner if OPEN, or Admin)
router.delete(
  '/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const authUser = req.authUser!;
      const ticketId = parsePositiveIntId(String(req.params.id));

      const [existing] = await db
        .select()
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .limit(1);

      if (!existing) {
        throw new AppError(404, 'Support ticket not found.', 'TICKET_NOT_FOUND');
      }

      if (
        !canDeleteTicket(authUser, {
          requesterId: existing.requesterId,
          status: existing.status as TicketStatus,
        })
      ) {
        throw new AppError(
          403,
          'Only open tickets you submitted (or administrator actions) can be deleted.',
          'FORBIDDEN'
        );
      }

      const [requester] = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, existing.requesterId))
        .limit(1);

      await db.delete(tickets).where(eq(tickets.id, ticketId));

      await ticketEventBus.publish({
        eventType: 'TICKET_DELETED',
        ticketId: null,
        ticketCode: existing.ticketCode,
        ticketTitle: existing.title,
        requesterId: existing.requesterId,
        requesterName: requester?.name ?? 'User',
        requesterEmail: requester?.email ?? '',
        actor: {
          id: authUser.id,
          name: authUser.name,
          email: authUser.email,
          role: authUser.role,
        },
        summary: `${authUser.name} deleted ticket ${existing.ticketCode} ("${existing.title}").`,
      });

      return res.json({ deleted: true, id: ticketId, ticketCode: existing.ticketCode });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/tickets/:id/comments — Add a comment to a ticket & emit COMMENT_ADDED
router.post(
  '/:id/comments',
  requireAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const authUser = req.authUser!;
      const ticketId = parsePositiveIntId(String(req.params.id));
      const parsed = createCommentSchema.parse(req.body);

      const [existing] = await db
        .select()
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .limit(1);

      if (!existing) {
        throw new AppError(404, 'Support ticket not found.', 'TICKET_NOT_FOUND');
      }

      const isInternal = authUser.role === 'ADMIN' ? parsed.isInternal : false;

      if (
        !canAddComment(
          authUser,
          {
            requesterId: existing.requesterId,
            status: existing.status as TicketStatus,
          },
          isInternal
        )
      ) {
        throw new AppError(
          403,
          'You do not have permission to comment on this ticket.',
          'FORBIDDEN'
        );
      }

      const [inserted] = await db
        .insert(comments)
        .values({
          ticketId,
          authorId: authUser.id,
          body: parsed.body,
          isInternal,
        })
        .returning();

      await db
        .update(tickets)
        .set({ updatedAt: new Date() })
        .where(eq(tickets.id, ticketId));

      const [requester] = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, existing.requesterId))
        .limit(1);

      const preview =
        parsed.body.length > 90 ? `${parsed.body.slice(0, 90)}…` : parsed.body;

      await ticketEventBus.publish({
        eventType: 'COMMENT_ADDED',
        ticketId: existing.id,
        ticketCode: existing.ticketCode,
        ticketTitle: existing.title,
        requesterId: existing.requesterId,
        requesterName: requester?.name ?? 'User',
        requesterEmail: requester?.email ?? '',
        actor: {
          id: authUser.id,
          name: authUser.name,
          email: authUser.email,
          role: authUser.role,
        },
        summary: `${authUser.name} ${
          isInternal ? 'added an internal note on' : 'commented on'
        } ${existing.ticketCode}: "${preview}"`,
        metadata: {
          commentPreview: preview,
          isInternalComment: isInternal,
        },
      });

      return res.status(201).json({
        comment: {
          id: inserted.id,
          ticketId: inserted.ticketId,
          authorId: inserted.authorId,
          authorName: authUser.name,
          authorEmail: authUser.email,
          authorRole: authUser.role,
          body: inserted.body,
          isInternal: inserted.isInternal,
          createdAt: inserted.createdAt.toISOString(),
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
