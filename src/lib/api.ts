import type {
  ActivityLogItem,
  AdminUserSummary,
  AuthUser,
  CommentItem,
  DashboardStatsResponse,
  EmailOutboxItem,
  NotificationItem,
  PaginationMeta,
  TicketCategory,
  TicketDetailResponse,
  TicketEventType,
  TicketListItem,
  TicketPriority,
  TicketStatus,
  TicketsListResponse,
  UserRole,
} from '../shared/types';

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: Record<string, string[]>;

  constructor(
    status: number,
    message: string,
    code = 'API_ERROR',
    details?: Record<string, string[]>
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiClientError(
      res.status,
      typeof data.error === 'string'
        ? data.error
        : 'Request failed. Please try again.',
      typeof data.code === 'string' ? data.code : 'API_ERROR',
      data.details
    );
  }

  return data as T;
}

export const api = {
  // Auth
  getAdminStatus: () =>
    request<{
      hasAdmin: boolean;
      passcodeRequired: boolean;
      canClaimFirstAdmin: boolean;
    }>('/api/auth/admin-status'),

  claimAdmin: (body: {
    name: string;
    email: string;
    password: string;
    passcode?: string;
  }) =>
    request<{ token: string; user: AuthUser }>('/api/auth/claim-admin', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  register: (body: { name: string; email: string; password: string }) =>
    request<{ token: string; user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  login: (body: { email: string; password: string }) =>
    request<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  me: (token: string) => request<{ user: AuthUser }>('/api/auth/me', {}, token),

  // Dashboard
  getDashboardStats: (token: string) =>
    request<DashboardStatsResponse>('/api/dashboard/stats', {}, token),

  // Tickets
  listTickets: (
    token: string,
    params: {
      status?: string;
      priority?: string;
      category?: string;
      requesterId?: number | string;
      search?: string;
      sortBy?: string;
      sortOrder?: string;
      page?: number;
      limit?: number;
    }
  ) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    });
    return request<TicketsListResponse>(`/api/tickets?${qs.toString()}`, {}, token);
  },

  createTicket: (
    token: string,
    body: {
      title: string;
      description: string;
      category: TicketCategory;
      priority: TicketPriority;
    }
  ) =>
    request<{ ticket: TicketListItem }>(
      '/api/tickets',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      token
    ),

  getTicketDetail: (token: string, id: number) =>
    request<TicketDetailResponse>(`/api/tickets/${id}`, {}, token),

  updateTicketDetails: (
    token: string,
    id: number,
    body: {
      title?: string;
      description?: string;
      category?: TicketCategory;
      priority?: TicketPriority;
    }
  ) =>
    request<{ ticket: TicketListItem }>(
      `/api/tickets/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      },
      token
    ),

  adminUpdateTicket: (
    token: string,
    id: number,
    body: {
      status?: TicketStatus;
      priority?: TicketPriority;
      category?: TicketCategory;
      assignedAdminId?: number | null;
    }
  ) =>
    request<{ ticket: TicketListItem }>(
      `/api/tickets/${id}/admin`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      },
      token
    ),

  deleteTicket: (token: string, id: number) =>
    request<{ deleted: boolean; id: number; ticketCode: string }>(
      `/api/tickets/${id}`,
      {
        method: 'DELETE',
      },
      token
    ),

  addComment: (
    token: string,
    ticketId: number,
    body: { body: string; isInternal?: boolean }
  ) =>
    request<{ comment: CommentItem }>(
      `/api/tickets/${ticketId}/comments`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      token
    ),

  // Activity, Notifications & Email Outbox
  listActivity: (
    token: string,
    params: { eventType?: TicketEventType | 'ALL'; page?: number; limit?: number }
  ) => {
    const qs = new URLSearchParams();
    if (params.eventType) qs.set('eventType', params.eventType);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    return request<{ logs: ActivityLogItem[]; pagination: PaginationMeta }>(
      `/api/activity?${qs.toString()}`,
      {},
      token
    );
  },

  listNotifications: (token: string) =>
    request<{ notifications: NotificationItem[]; unreadCount: number }>(
      '/api/notifications',
      {},
      token
    ),

  markNotificationRead: (token: string, id: number) =>
    request<{ id: number; isRead: boolean }>(
      `/api/notifications/${id}/read`,
      { method: 'PATCH' },
      token
    ),

  markAllNotificationsRead: (token: string) =>
    request<{ updated: boolean }>(
      '/api/notifications/read-all',
      { method: 'POST' },
      token
    ),

  listEmailOutbox: (token: string) =>
    request<{ emails: EmailOutboxItem[] }>('/api/email-outbox', {}, token),

  // Admin Users
  listAdminUsers: (token: string) =>
    request<{ users: AdminUserSummary[] }>('/api/admin/users', {}, token),

  updateUserRole: (token: string, userId: number, role: UserRole) =>
    request<{ user: AuthUser }>(
      `/api/admin/users/${userId}/role`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      },
      token
    ),
};
