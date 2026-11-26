import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash'),
    role: text('role').notNull().default('USER'), // 'USER' | 'ADMIN'
    authProvider: text('auth_provider').notNull().default('LOCAL'), // 'LOCAL' | 'FIREBASE'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('users_role_idx').on(table.role)]
);

export const tickets = pgTable(
  'tickets',
  {
    id: serial('id').primaryKey(),
    ticketCode: text('ticket_code').notNull().unique(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    category: text('category').notNull().default('Technical'),
    priority: text('priority').notNull().default('MEDIUM'), // 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
    status: text('status').notNull().default('OPEN'), // 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
    requesterId: integer('requester_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    assignedAdminId: integer('assigned_admin_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('tickets_requester_idx').on(table.requesterId),
    index('tickets_status_idx').on(table.status),
    index('tickets_priority_idx').on(table.priority),
    index('tickets_created_at_idx').on(table.createdAt),
  ]
);

export const comments = pgTable(
  'comments',
  {
    id: serial('id').primaryKey(),
    ticketId: integer('ticket_id')
      .references(() => tickets.id, { onDelete: 'cascade' })
      .notNull(),
    authorId: integer('author_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    body: text('body').notNull(),
    isInternal: boolean('is_internal').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('comments_ticket_idx').on(table.ticketId)]
);

export const activityLogs = pgTable(
  'activity_logs',
  {
    id: serial('id').primaryKey(),
    eventType: text('event_type').notNull(),
    ticketId: integer('ticket_id').references(() => tickets.id, {
      onDelete: 'set null',
    }),
    ticketCode: text('ticket_code').notNull(),
    actorId: integer('actor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    actorName: text('actor_name').notNull(),
    actorRole: text('actor_role').notNull(),
    summary: text('summary').notNull(),
    metadataJson: text('metadata_json').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('activity_logs_ticket_idx').on(table.ticketId),
    index('activity_logs_event_type_idx').on(table.eventType),
    index('activity_logs_created_at_idx').on(table.createdAt),
  ]
);

export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    ticketId: integer('ticket_id').references(() => tickets.id, {
      onDelete: 'set null',
    }),
    eventType: text('event_type').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('notifications_user_idx').on(table.userId),
    index('notifications_unread_idx').on(table.userId, table.isRead),
  ]
);

export const emailOutbox = pgTable(
  'email_outbox',
  {
    id: serial('id').primaryKey(),
    recipientEmail: text('recipient_email').notNull(),
    recipientName: text('recipient_name').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    eventType: text('event_type').notNull(),
    ticketCode: text('ticket_code').notNull(),
    deliveryStatus: text('delivery_status').notNull().default('SENT'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('email_outbox_created_at_idx').on(table.createdAt)]
);

export const usersRelations = relations(users, ({ many }) => ({
  submittedTickets: many(tickets, { relationName: 'ticketRequester' }),
  assignedTickets: many(tickets, { relationName: 'ticketAssignee' }),
  comments: many(comments),
  notifications: many(notifications),
  activityLogs: many(activityLogs),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  requester: one(users, {
    fields: [tickets.requesterId],
    references: [users.id],
    relationName: 'ticketRequester',
  }),
  assignedAdmin: one(users, {
    fields: [tickets.assignedAdminId],
    references: [users.id],
    relationName: 'ticketAssignee',
  }),
  comments: many(comments),
  activityLogs: many(activityLogs),
  notifications: many(notifications),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  ticket: one(tickets, {
    fields: [comments.ticketId],
    references: [tickets.id],
  }),
  author: one(users, {
    fields: [comments.authorId],
    references: [users.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  ticket: one(tickets, {
    fields: [activityLogs.ticketId],
    references: [tickets.id],
  }),
  actor: one(users, {
    fields: [activityLogs.actorId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  ticket: one(tickets, {
    fields: [notifications.ticketId],
    references: [tickets.id],
  }),
}));
