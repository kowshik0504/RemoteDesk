import type {
  TicketEventType,
  TicketPriority,
  TicketStatus,
} from '../shared/types';

export function formatStatusLabel(status: TicketStatus): string {
  switch (status) {
    case 'OPEN':
      return 'Open';
    case 'IN_PROGRESS':
      return 'In Progress';
    case 'RESOLVED':
      return 'Resolved';
    case 'CLOSED':
      return 'Closed';
  }
}

export function getStatusTextColor(status: TicketStatus): string {
  switch (status) {
    case 'OPEN':
      return 'text-[#2563EB] font-medium';
    case 'IN_PROGRESS':
      return 'text-[#D97706] font-medium';
    case 'RESOLVED':
      return 'text-[#16A34A] font-medium';
    case 'CLOSED':
      return 'text-slate-500 font-medium';
  }
}

export function formatPriorityLabel(priority: TicketPriority): string {
  switch (priority) {
    case 'URGENT':
      return 'Urgent';
    case 'HIGH':
      return 'High';
    case 'MEDIUM':
      return 'Medium';
    case 'LOW':
      return 'Low';
  }
}

export function getPriorityTextColor(priority: TicketPriority): string {
  switch (priority) {
    case 'URGENT':
      return 'text-[#DC2626] font-semibold';
    case 'HIGH':
      return 'text-[#D97706] font-medium';
    case 'MEDIUM':
      return 'text-slate-700 font-medium';
    case 'LOW':
      return 'text-slate-500 font-normal';
  }
}

export function formatEventLabel(eventType: TicketEventType): string {
  switch (eventType) {
    case 'TICKET_CREATED':
      return 'Ticket Created';
    case 'TICKET_UPDATED':
      return 'Ticket Updated';
    case 'STATUS_CHANGED':
      return 'Status Changed';
    case 'COMMENT_ADDED':
      return 'Comment Added';
    case 'TICKET_RESOLVED':
      return 'Ticket Resolved';
    case 'TICKET_DELETED':
      return 'Ticket Deleted';
  }
}

export function getEventTextColor(eventType: TicketEventType): string {
  switch (eventType) {
    case 'TICKET_CREATED':
      return 'text-[#2563EB]';
    case 'TICKET_RESOLVED':
      return 'text-[#16A34A]';
    case 'STATUS_CHANGED':
      return 'text-[#D97706]';
    case 'TICKET_DELETED':
      return 'text-[#DC2626]';
    case 'COMMENT_ADDED':
      return 'text-slate-800';
    case 'TICKET_UPDATED':
      return 'text-slate-700';
  }
}

export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
