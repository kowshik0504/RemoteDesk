# REST API Documentation — ResolveDesk

Base URL: `http://localhost:3000/api`

All protected endpoints require an `Authorization: Bearer <token>` header containing either:
- A signed **JWT** returned by `POST /api/auth/login`, `POST /api/auth/register`, or `POST /api/auth/claim-admin`, OR
- A verified **Firebase ID Token** from Google Sign-In.

---

## 1. Health Check

### `GET /api/health`
Returns service readiness status.
- **Auth**: Public
- **Response `200 OK`**:
  ```json
  { "status": "ok", "service": "resolvedesk-api" }
  ```

---

## 2. Authentication (`/api/auth`)

### `GET /api/auth/admin-status`
Checks whether an initial administrator has been configured and whether `ADMIN_SETUP_PASSCODE` is enforced.
- **Auth**: Public
- **Response `200 OK`**:
  ```json
  { "hasAdmin": false, "passcodeRequired": false, "canClaimFirstAdmin": true }
  ```

### `POST /api/auth/claim-admin`
One-time first-run administrator creation (locked once an admin exists unless `ADMIN_SETUP_PASSCODE` is configured and supplied).
- **Auth**: Public (one-time / passcode protected)
- **Body**:
  ```json
  {
    "name": "Priya Nair",
    "email": "admin@company.com",
    "password": "SecurePassword123!",
    "passcode": "optional-if-env-configured"
  }
  ```
- **Response `201 Created`**: `{ "token": "<jwt>", "user": { ... } }`

### `POST /api/auth/register`
Creates a standard `USER` account (role is always enforced server-side as `USER`).
- **Auth**: Public
- **Body**:
  ```json
  {
    "name": "Alex Rivera",
    "email": "alex@company.com",
    "password": "Password123!"
  }
  ```
- **Response `201 Created`**: `{ "token": "<jwt>", "user": { ... } }`
- **Errors**: `400` Validation error, `409` Email already registered

### `POST /api/auth/login`
Authenticates an existing user and issues a 12-hour JWT.
- **Auth**: Public
- **Body**:
  ```json
  { "email": "alex@company.com", "password": "Password123!" }
  ```
- **Response `200 OK`**: `{ "token": "<jwt>", "user": { ... } }`
- **Errors**: `401` Invalid email or password

### `GET /api/auth/me`
Returns the authenticated user's profile.
- **Auth**: `USER` or `ADMIN`
- **Response `200 OK`**: `{ "user": { "id": 1, "name": "...", "email": "...", "role": "USER" } }`

---

## 3. Tickets (`/api/tickets`)

### `GET /api/tickets`
Lists tickets scoped by role (`USER` sees own tickets only; `ADMIN` sees all tickets).
- **Auth**: `USER` or `ADMIN`
- **Query Parameters**:
  - `status`: `ALL` | `OPEN` | `IN_PROGRESS` | `RESOLVED` | `CLOSED`
  - `priority`: `ALL` | `LOW` | `MEDIUM` | `HIGH` | `URGENT`
  - `category`: `ALL` | `Technical` | `Billing` | `Account` | `Feature Request` | `Security` | `General`
  - `requesterId` *(Admin only)*: Positive integer user ID to filter tickets submitted by a specific requester (ignored for `USER` role, which is always scoped to self)
  - `search`: Case-insensitive partial match against `ticket_code`, `title`, or `description`
  - `sortBy`: `createdAt` | `updatedAt` | `priority`
  - `sortOrder`: `asc` | `desc`
  - `page`: Integer >= 1 (default `1`)
  - `limit`: Integer 1–50 (default `10`)
- **Response `200 OK`**:
  ```json
  {
    "tickets": [ ... ],
    "pagination": { "page": 1, "limit": 10, "total": 7, "totalPages": 1 }
  }
  ```

### `POST /api/tickets`
Creates a new support ticket (default status `OPEN`) and emits `TICKET_CREATED`.
- **Auth**: `USER` or `ADMIN`
- **Body**:
  ```json
  {
    "title": "Unable to generate monthly VAT invoice",
    "description": "Clicking download returns an empty PDF for October billing.",
    "category": "Billing",
    "priority": "HIGH"
  }
  ```
- **Response `201 Created`**: `{ "ticket": { ... } }`

### `GET /api/tickets/:id`
Returns ticket details, threaded comments (excluding internal notes for non-admins), and ticket-scoped activity logs.
- **Auth**: Ticket owner or `ADMIN`
- **Errors**: `403` Forbidden (if not owner/admin), `404` Not found

### `PATCH /api/tickets/:id`
Updates ticket details (`title`, `description`, `category`, `priority`) and emits `TICKET_UPDATED`.
- **Auth**: Ticket owner (while status is `OPEN` or `IN_PROGRESS`) or `ADMIN`
- **Errors**: `403` Forbidden (e.g., user attempting to edit another user's ticket or a `RESOLVED`/`CLOSED` ticket)

### `PATCH /api/tickets/:id/admin`
Admin-only triage update for `status`, `priority`, `category`, and `assignedAdminId`.
- **Auth**: `ADMIN` only (`403` for `USER`)
- **Events Emitted**:
  - `STATUS_CHANGED` when status changes
  - `TICKET_RESOLVED` when status transitions to `RESOLVED`
  - `TICKET_UPDATED` when priority, category, or assignee changes
- **Body**:
  ```json
  {
    "status": "RESOLVED",
    "priority": "HIGH",
    "assignedAdminId": 1
  }
  ```

### `DELETE /api/tickets/:id`
Deletes a ticket and emits `TICKET_DELETED` (preserving the audit log record).
- **Auth**: Ticket owner (only when status is `OPEN`) or `ADMIN`

---

## 4. Comments (`/api/tickets/:id/comments`)

### `POST /api/tickets/:id/comments`
Adds a comment to a ticket and emits `COMMENT_ADDED`.
- **Auth**: Ticket owner (`isInternal` forced to `false`) or `ADMIN` (`isInternal` optional boolean)
- **Body**:
  ```json
  {
    "body": "We have identified the root cause and deployed a hotfix.",
    "isInternal": false
  }
  ```
- **Response `201 Created`**: `{ "comment": { ... } }`

---

## 5. Dashboard, Events, Notifications & Admin Users

| Method & Path | Role | Description |
| --- | --- | --- |
| `GET /api/dashboard/stats` | `USER`, `ADMIN` | Role-scoped KPI metrics, resolution rate, priority/category breakdowns, recent tickets & events |
| `GET /api/activity` | `USER`, `ADMIN` | Paginated event audit log (`eventType`, `page`, `limit`) |
| `GET /api/notifications` | `USER`, `ADMIN` | Current user's in-app notifications & `unreadCount` |
| `PATCH /api/notifications/:id/read` | `USER`, `ADMIN` | Marks a single notification owned by the user as read |
| `POST /api/notifications/read-all` | `USER`, `ADMIN` | Marks all unread notifications for the user as read |
| `GET /api/email-outbox` | `USER`, `ADMIN` | Event-triggered email notifications (Admin: all; User: own email) |
| `GET /api/admin/users` | `ADMIN` | User directory with submitted ticket counts |
| `PATCH /api/admin/users/:id/role` | `ADMIN` | Promotes/demotes a user (`{ "role": "ADMIN" | "USER" }`), protecting the last remaining Admin |

---

## Error Format
All errors return a consistent JSON structure:
```json
{
  "error": "Human-readable error explanation.",
  "code": "VALIDATION_ERROR",
  "details": {
    "title": ["Title must be at least 5 characters."]
  }
}
```
