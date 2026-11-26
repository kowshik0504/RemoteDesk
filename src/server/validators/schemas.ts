import { z } from 'zod';
import {
  TICKET_CATEGORIES,
  TICKET_EVENT_TYPES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from '../../shared/types.ts';

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters.')
    .max(80, 'Full name cannot exceed 80 characters.'),
  email: z
    .string()
    .trim()
    .email('Please enter a valid email address.')
    .max(160, 'Email cannot exceed 160 characters.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password cannot exceed 128 characters.'),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

export const claimAdminSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Administrator name must be at least 2 characters.')
    .max(80, 'Administrator name cannot exceed 80 characters.'),
  email: z
    .string()
    .trim()
    .email('Please enter a valid email address.')
    .max(160, 'Email cannot exceed 160 characters.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password cannot exceed 128 characters.'),
  passcode: z.string().optional(),
});

export const createTicketSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, 'Title must be at least 5 characters.')
    .max(160, 'Title cannot exceed 160 characters.'),
  description: z
    .string()
    .trim()
    .min(10, 'Description must be at least 10 characters.')
    .max(4000, 'Description cannot exceed 4000 characters.'),
  category: z.enum(TICKET_CATEGORIES as unknown as [string, ...string[]]),
  priority: z.enum(TICKET_PRIORITIES as unknown as [string, ...string[]]),
});

export const updateTicketSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(5, 'Title must be at least 5 characters.')
      .max(160, 'Title cannot exceed 160 characters.')
      .optional(),
    description: z
      .string()
      .trim()
      .min(10, 'Description must be at least 10 characters.')
      .max(4000, 'Description cannot exceed 4000 characters.')
      .optional(),
    category: z.enum(TICKET_CATEGORIES as unknown as [string, ...string[]]).optional(),
    priority: z.enum(TICKET_PRIORITIES as unknown as [string, ...string[]]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update.',
  });

export const adminUpdateTicketSchema = z
  .object({
    status: z.enum(TICKET_STATUSES as unknown as [string, ...string[]]).optional(),
    priority: z.enum(TICKET_PRIORITIES as unknown as [string, ...string[]]).optional(),
    category: z.enum(TICKET_CATEGORIES as unknown as [string, ...string[]]).optional(),
    assignedAdminId: z.number().int().positive().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one administrative field must be provided.',
  });

export const createCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(2, 'Comment cannot be empty.')
    .max(3000, 'Comment cannot exceed 3000 characters.'),
  isInternal: z.boolean().optional().default(false),
});

export const ticketQuerySchema = z.object({
  status: z.enum(['ALL', ...TICKET_STATUSES] as [string, ...string[]]).optional().default('ALL'),
  priority: z
    .enum(['ALL', ...TICKET_PRIORITIES] as [string, ...string[]])
    .optional()
    .default('ALL'),
  category: z
    .enum(['ALL', ...TICKET_CATEGORIES] as [string, ...string[]])
    .optional()
    .default('ALL'),
  requesterId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(120).optional().default(''),
  sortBy: z.enum(['createdAt', 'updatedAt', 'priority']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

export const activityQuerySchema = z.object({
  eventType: z
    .enum(['ALL', ...TICKET_EVENT_TYPES] as [string, ...string[]])
    .optional()
    .default('ALL'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(['USER', 'ADMIN']),
});
