export type UserRole = 'USER' | 'ADMIN';

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type TicketCategory =
  | 'Technical'
  | 'Billing'
  | 'Account'
  | 'Feature Request'
  | 'Security'
  | 'General';

export type TicketEventType =
  | 'TICKET_CREATED'
  | 'TICKET_UPDATED'
  | 'STATUS_CHANGED'
  | 'COMMENT_ADDED'
  | 'TICKET_RESOLVED'
  | 'TICKET_DELETED';

export const TICKET_STATUSES: readonly TicketStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
] as const;

export const TICKET_PRIORITIES: readonly TicketPriority[] = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT',
] as const;

export const TICKET_CATEGORIES: readonly TicketCategory[] = [
  'Technical',
  'Billing',
  'Account',
  'Feature Request',
  'Security',
  'General',
] as const;

export const TICKET_EVENT_TYPES: readonly TicketEventType[] = [
  'TICKET_CREATED',
  'TICKET_UPDATED',
  'STATUS_CHANGED',
  'COMMENT_ADDED',
  'TICKET_RESOLVED',
  'TICKET_DELETED',
] as const;

export interface AuthUser {
  id: number;
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  authProvider: string;
  createdAt?: string;
}

export interface TicketListItem {
  id: number;
  ticketCode: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  requesterId: number;
  requesterName: string;
  requesterEmail: string;
  assignedAdminId: number | null;
  assignedAdminName: string | null;
  commentCount: number;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommentItem {
  id: number;
  ticketId: number;
  authorId: number;
  authorName: string;
  authorEmail: string;
  authorRole: UserRole;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

export interface ActivityLogItem {
  id: number;
  eventType: TicketEventType;
  ticketId: number | null;
  ticketCode: string;
  actorId: number | null;
  actorName: string;
  actorRole: string;
  summary: string;
  metadataJson: string;
  createdAt: string;
}

export interface NotificationItem {
  id: number;
  userId: number;
  ticketId: number | null;
  eventType: TicketEventType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface EmailOutboxItem {
  id: number;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  body: string;
  eventType: TicketEventType;
  ticketCode: string;
  deliveryStatus: string;
  createdAt: string;
}

export interface TicketDetailResponse {
  ticket: TicketListItem;
  comments: CommentItem[];
  activityLogs: ActivityLogItem[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface TicketsListResponse {
  tickets: TicketListItem[];
  pagination: PaginationMeta;
}

export interface DashboardStatsResponse {
  summary: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
    urgent: number;
    resolutionRate: number;
  };
  byPriority: Array<{ priority: TicketPriority; count: number }>;
  byCategory: Array<{ category: string; count: number }>;
  recentTickets: TicketListItem[];
  recentActivity: ActivityLogItem[];
}

export interface AdminUserSummary {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  authProvider: string;
  ticketCount: number;
  createdAt: string;
}
