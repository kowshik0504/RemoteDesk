import { Router } from 'express';
import { and, count, desc, eq, inArray, or } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  activityLogs,
  comments,
  emailOutbox,
  notifications,
  tickets,
  users,
} from '../../db/schema.ts';
import {
  requireAdmin,
  requireAuth,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import { AppError } from '../middleware/errorHandler.ts';
import {
  activityQuerySchema,
  updateUserRoleSchema,
} from '../validators/schemas.ts';
import {
  calculatePaginationMeta,
  computeResolutionRate,
} from '../domain/rules.ts';
import { ensureSampleDataSeeded } from '../services/seedService.ts';
import {
  TICKET_PRIORITIES,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
  type UserRole,
} from '../../shared/types.ts';

const router = Router();

// GET /api/dashboard/stats — Role-scoped dashboard KPI metrics & distributions
router.get(
  '/dashboard/stats',
  requireAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      await ensureSampleDataSeeded();
      const authUser = req.authUser!;
      const ticketScope =
        authUser.role === 'ADMIN'
          ? undefined
          : eq(tickets.requesterId, authUser.id);

      const scopedTickets = await db
        .select()
        .from(tickets)
        .where(ticketScope)
        .orderBy(desc(tickets.updatedAt));

      let open = 0;
      let inProgress = 0;
      let resolved = 0;
      let closed = 0;
      let urgent = 0;

      const priorityCounts = new Map<TicketPriority, number>([
        ['URGENT', 0],
        ['HIGH', 0],
        ['MEDIUM', 0],
        ['LOW', 0],
      ]);
      const categoryCounts = new Map<string, number>();

      for (const t of scopedTickets) {
        if (t.status === 'OPEN') open++;
        else if (t.status === 'IN_PROGRESS') inProgress++;
        else if (t.status === 'RESOLVED') resolved++;
        else if (t.status === 'CLOSED') closed++;

        if (t.priority === 'URGENT' && t.status !== 'CLOSED' && t.status !== 'RESOLVED') {
          urgent++;
        }

        const p = t.priority as TicketPriority;
        priorityCounts.set(p, (priorityCounts.get(p) ?? 0) + 1);
        categoryCounts.set(t.category, (categoryCounts.get(t.category) ?? 0) + 1);
      }

      const total = scopedTickets.length;
      const resolutionRate = computeResolutionRate(resolved + closed, total);

      // Hydrate top 5 recent tickets
      const top5 = scopedTickets.slice(0, 5);
      const userIds = new Set<number>();
      top5.forEach((t) => {
        userIds.add(t.requesterId);
        if (t.assignedAdminId) userIds.add(t.assignedAdminId);
      });

      const userRows =
        userIds.size > 0
          ? await db
              .select({ id: users.id, name: users.name, email: users.email })
              .from(users)
              .where(inArray(users.id, Array.from(userIds)))
          : [];
      const userMap = new Map(userRows.map((u) => [u.id, u]));

      const commentCounts =
        top5.length > 0
          ? await db
              .select({ ticketId: comments.ticketId, total: count() })
              .from(comments)
              .where(
                inArray(
                  comments.ticketId,
                  top5.map((t) => t.id)
                )
              )
              .groupBy(comments.ticketId)
          : [];
      const commentMap = new Map(
        commentCounts.map((c) => [c.ticketId, Number(c.total)])
      );

      const recentTickets = top5.map((t) => ({
        id: t.id,
        ticketCode: t.ticketCode,
        title: t.title,
        description: t.description,
        category: t.category as TicketCategory,
        priority: t.priority as TicketPriority,
        status: t.status as TicketStatus,
        requesterId: t.requesterId,
        requesterName: userMap.get(t.requesterId)?.name ?? 'User',
        requesterEmail: userMap.get(t.requesterId)?.email ?? '',
        assignedAdminId: t.assignedAdminId ?? null,
        assignedAdminName: t.assignedAdminId
          ? userMap.get(t.assignedAdminId)?.name ?? null
          : null,
        commentCount: commentMap.get(t.id) ?? 0,
        resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      }));

      // Scoped recent activity logs
      let recentActivityRows: Array<typeof activityLogs.$inferSelect> = [];
      if (authUser.role === 'ADMIN') {
        recentActivityRows = await db
          .select()
          .from(activityLogs)
          .orderBy(desc(activityLogs.createdAt))
          .limit(8);
      } else {
        const ownedTicketIds = scopedTickets.map((t) => t.id);
        recentActivityRows = await db
          .select()
          .from(activityLogs)
          .where(
            ownedTicketIds.length > 0
              ? or(
                  inArray(activityLogs.ticketId, ownedTicketIds),
                  eq(activityLogs.actorId, authUser.id)
                )
              : eq(activityLogs.actorId, authUser.id)
          )
          .orderBy(desc(activityLogs.createdAt))
          .limit(8);
      }

      return res.json({
        summary: {
          total,
          open,
          inProgress,
          resolved,
          closed,
          urgent,
          resolutionRate,
        },
        byPriority: TICKET_PRIORITIES.map((priority) => ({
          priority,
          count: priorityCounts.get(priority) ?? 0,
        })),
        byCategory: Array.from(categoryCounts.entries())
          .map(([category, cnt]) => ({ category, count: cnt }))
          .sort((a, b) => b.count - a.count),
        recentTickets,
        recentActivity: recentActivityRows.map((a) => ({
          id: a.id,
          eventType: a.eventType,
          ticketId: a.ticketId,
          ticketCode: a.ticketCode,
          actorId: a.actorId,
          actorName: a.actorName,
          actorRole: a.actorRole,
          summary: a.summary,
          metadataJson: a.metadataJson,
          createdAt: a.createdAt.toISOString(),
        })),
      });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/activity — Event-driven Activity Audit Log
router.get(
  '/activity',
  requireAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const authUser = req.authUser!;
      const query = activityQuerySchema.parse(req.query);
      const conditions = [];

      if (query.eventType !== 'ALL') {
        conditions.push(eq(activityLogs.eventType, query.eventType));
      }

      if (authUser.role !== 'ADMIN') {
        const owned = await db
          .select({ id: tickets.id })
          .from(tickets)
          .where(eq(tickets.requesterId, authUser.id));
        const ownedIds = owned.map((o) => o.id);
        conditions.push(
          ownedIds.length > 0
            ? or(
                inArray(activityLogs.ticketId, ownedIds),
                eq(activityLogs.actorId, authUser.id)
              )
            : eq(activityLogs.actorId, authUser.id)
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [{ value: totalCount }] = await db
        .select({ value: count() })
        .from(activityLogs)
        .where(whereClause);

      const pagination = calculatePaginationMeta(
        query.page,
        query.limit,
        Number(totalCount)
      );
      const offset = (pagination.page - 1) * pagination.limit;

      const rows = await db
        .select()
        .from(activityLogs)
        .where(whereClause)
        .orderBy(desc(activityLogs.createdAt))
        .limit(pagination.limit)
        .offset(offset);

      return res.json({
        logs: rows.map((a) => ({
          id: a.id,
          eventType: a.eventType,
          ticketId: a.ticketId,
          ticketCode: a.ticketCode,
          actorId: a.actorId,
          actorName: a.actorName,
          actorRole: a.actorRole,
          summary: a.summary,
          metadataJson: a.metadataJson,
          createdAt: a.createdAt.toISOString(),
        })),
        pagination,
      });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/notifications — Current user's in-app notifications
router.get(
  '/notifications',
  requireAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const authUser = req.authUser!;
      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, authUser.id))
        .orderBy(desc(notifications.createdAt))
        .limit(30);

      const unreadCount = rows.filter((r) => !r.isRead).length;

      return res.json({
        notifications: rows.map((n) => ({
          id: n.id,
          userId: n.userId,
          ticketId: n.ticketId,
          eventType: n.eventType,
          title: n.title,
          message: n.message,
          isRead: n.isRead,
          createdAt: n.createdAt.toISOString(),
        })),
        unreadCount,
      });
    } catch (err) {
      return next(err);
    }
  }
);

// PATCH /api/notifications/:id/read — Mark single notification as read
router.patch(
  '/notifications/:id/read',
  requireAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const authUser = req.authUser!;
      const notificationId = Number(req.params.id);
      if (!Number.isInteger(notificationId) || notificationId <= 0) {
        throw new AppError(400, 'Invalid notification ID.', 'INVALID_ID');
      }

      const [updated] = await db
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            eq(notifications.id, notificationId),
            eq(notifications.userId, authUser.id)
          )
        )
        .returning();

      if (!updated) {
        throw new AppError(404, 'Notification not found.', 'NOT_FOUND');
      }

      return res.json({ id: updated.id, isRead: true });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/notifications/read-all — Mark all notifications for current user as read
router.post(
  '/notifications/read-all',
  requireAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const authUser = req.authUser!;
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            eq(notifications.userId, authUser.id),
            eq(notifications.isRead, false)
          )
        );
      return res.json({ updated: true });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/email-outbox — Event-triggered email notification log
router.get(
  '/email-outbox',
  requireAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const authUser = req.authUser!;
      const whereClause =
        authUser.role === 'ADMIN'
          ? undefined
          : eq(emailOutbox.recipientEmail, authUser.email);

      const rows = await db
        .select()
        .from(emailOutbox)
        .where(whereClause)
        .orderBy(desc(emailOutbox.createdAt))
        .limit(30);

      return res.json({
        emails: rows.map((e) => ({
          id: e.id,
          recipientEmail: e.recipientEmail,
          recipientName: e.recipientName,
          subject: e.subject,
          body: e.body,
          eventType: e.eventType,
          ticketCode: e.ticketCode,
          deliveryStatus: e.deliveryStatus,
          createdAt: e.createdAt.toISOString(),
        })),
      });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/admin/users — Admin-only user directory with submitted ticket counts
router.get(
  '/admin/users',
  requireAuth,
  requireAdmin,
  async (_req: AuthenticatedRequest, res, next) => {
    try {
      const allUsers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          authProvider: users.authProvider,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt));

      const ticketCounts = await db
        .select({
          requesterId: tickets.requesterId,
          total: count(),
        })
        .from(tickets)
        .groupBy(tickets.requesterId);

      const countMap = new Map(
        ticketCounts.map((t) => [t.requesterId, Number(t.total)])
      );

      return res.json({
        users: allUsers.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role as UserRole,
          authProvider: u.authProvider,
          ticketCount: countMap.get(u.id) ?? 0,
          createdAt: u.createdAt.toISOString(),
        })),
      });
    } catch (err) {
      return next(err);
    }
  }
);

// PATCH /api/admin/users/:id/role — Admin-only role promotion/demotion
router.patch(
  '/admin/users/:id/role',
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const targetUserId = Number(req.params.id);
      if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        throw new AppError(400, 'Invalid user ID.', 'INVALID_ID');
      }

      const parsed = updateUserRoleSchema.parse(req.body);

      const [target] = await db
        .select()
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);

      if (!target) {
        throw new AppError(404, 'User account not found.', 'USER_NOT_FOUND');
      }

      if (target.role === 'ADMIN' && parsed.role === 'USER') {
        const [{ value: adminCount }] = await db
          .select({ value: count() })
          .from(users)
          .where(eq(users.role, 'ADMIN'));

        if (Number(adminCount) <= 1) {
          throw new AppError(
            400,
            'Cannot demote the last remaining administrator.',
            'LAST_ADMIN_PROTECTED'
          );
        }
      }

      const [updated] = await db
        .update(users)
        .set({ role: parsed.role, updatedAt: new Date() })
        .where(eq(users.id, targetUserId))
        .returning();

      return res.json({
        user: {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          role: updated.role as UserRole,
          authProvider: updated.authProvider,
          createdAt: updated.createdAt.toISOString(),
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
