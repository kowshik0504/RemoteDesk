import type { TicketListItem } from '../shared/types';

/**
 * Escapes a single CSV field and neutralizes spreadsheet formula injection
 * (cells starting with =, +, -, @, tab, or carriage return).
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildTicketsCsv(tickets: TicketListItem[]): string {
  const headers = [
    'Ticket Code',
    'Title',
    'Status',
    'Priority',
    'Category',
    'Requester',
    'Requester Email',
    'Assigned Admin',
    'Comments',
    'Created At',
    'Updated At',
    'Resolved At',
  ];

  const rows = tickets.map((t) =>
    [
      t.ticketCode,
      t.title,
      t.status,
      t.priority,
      t.category,
      t.requesterName,
      t.requesterEmail,
      t.assignedAdminName ?? 'Unassigned',
      t.commentCount,
      t.createdAt,
      t.updatedAt,
      t.resolvedAt ?? '',
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  return [headers.join(','), ...rows].join('\r\n');
}

export function downloadCsvFile(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
