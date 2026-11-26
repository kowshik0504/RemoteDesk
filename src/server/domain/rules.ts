import type {
  PaginationMeta,
  TicketPriority,
  TicketStatus,
  UserRole,
} from '../../shared/types.ts';

export interface AccessUser {
  id: number;
  role: UserRole;
}

export interface AccessTicket {
  requesterId: number;
  status: TicketStatus;
}

export function canViewTicket(user: AccessUser, ticket: AccessTicket): boolean {
  if (user.role === 'ADMIN') return true;
  return ticket.requesterId === user.id;
}

export function canEditTicketDetails(user: AccessUser, ticket: AccessTicket): boolean {
  if (user.role === 'ADMIN') return true;
  if (ticket.requesterId !== user.id) return false;
  return ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS';
}

export function canDeleteTicket(user: AccessUser, ticket: AccessTicket): boolean {
  if (user.role === 'ADMIN') return true;
  if (ticket.requesterId !== user.id) return false;
  return ticket.status === 'OPEN';
}

export function canManageTicketStatus(user: AccessUser): boolean {
  return user.role === 'ADMIN';
}

export function canAddComment(
  user: AccessUser,
  ticket: AccessTicket,
  isInternal: boolean
): boolean {
  if (user.role === 'ADMIN') return true;
  if (isInternal) return false;
  return ticket.requesterId === user.id;
}

export function formatTicketCode(sequenceNumber: number): string {
  const safeNum = Math.max(1, Math.floor(sequenceNumber));
  return `TKT-${1000 + safeNum}`;
}

export function computeResolutionRate(resolvedOrClosed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((resolvedOrClosed / total) * 100);
}

export function calculatePaginationMeta(
  page: number,
  limit: number,
  total: number
): PaginationMeta {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const safeTotal = Math.max(0, Math.floor(total));
  const totalPages = Math.max(1, Math.ceil(safeTotal / safeLimit));
  const safePage = Math.max(1, Math.min(totalPages, Math.floor(page)));
  return {
    page: safePage,
    limit: safeLimit,
    total: safeTotal,
    totalPages,
  };
}

export function getPriorityWeight(priority: TicketPriority): number {
  switch (priority) {
    case 'URGENT':
      return 4;
    case 'HIGH':
      return 3;
    case 'MEDIUM':
      return 2;
    case 'LOW':
      return 1;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
