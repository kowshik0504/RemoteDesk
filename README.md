# RemoteDesk — Support Ticket Management System

**RemoteDesk** is a full-stack Helpdesk & Support Ticket Management System (with its internal application workspace and API service identified as `ResolveDesk` / `resolvedesk-api`) built with **Node.js**, **Express.js**, **TypeScript**, **PostgreSQL (Drizzle ORM)**, and **React 19 + Tailwind CSS**.

It provides structured support ticket intake, strict role-based access control (`USER` vs `ADMIN`), threaded public replies and internal admin triage notes, an event-driven audit/notification/email pipeline, and an interactive analytics dashboard.

---

## Key Features

### 1. Authentication & Role-Based Access Control (RBAC)
- **JWT Email/Password Authentication**: Registration (`POST /api/auth/register`) and Login (`POST /api/auth/login`) using per-user salted `crypto.scrypt` password hashing (`timingSafeEqual`) and 12-hour signed JWT Bearer tokens (`jsonwebtoken`).
- **Google Sign-In (Firebase Auth)**: Google OAuth sign-in on the client (`firebase`) verified server-side via `firebase-admin` and synchronized to PostgreSQL using idempotent Drizzle upserts.
- **First-Run Administrator Bootstrap**: One-time administrator setup (`POST /api/auth/claim-admin`) inside a PostgreSQL transaction, optionally gated by `ADMIN_SETUP_PASSCODE` (`GET /api/auth/admin-status`).
- **Strict Role Separation (`USER` vs `ADMIN`)**:
  - **Users** can create tickets, view only their own tickets, edit their own `OPEN` / `IN_PROGRESS` tickets, delete their own `OPEN` tickets, add public comments on their own tickets, and view their notifications and scoped activity history.
  - **Administrators** can view all tickets across users, filter/search/sort/paginate, transition statuses (`OPEN` -> `IN_PROGRESS` -> `RESOLVED` -> `CLOSED`), update priority/category, assign admins, post public replies or internal triage notes, manage user roles (`GET /api/admin/users`, `PATCH /api/admin/users/:id/role`), and inspect global dashboard metrics, audit logs, and email outbox records.

### 2. Event-Driven Workflow & Action Management
- Decoupled Node.js `EventEmitter`-backed domain event bus (`src/server/events/ticketEventBus.ts`) supporting:
  - `TICKET_CREATED`
  - `TICKET_UPDATED`
  - `STATUS_CHANGED`
  - `COMMENT_ADDED`
  - `TICKET_RESOLVED`
  - `TICKET_DELETED`
- Failure-isolated subscribers (`src/server/events/ticketEventHandlers.ts`) react to domain events to perform three independent actions:
  1. **Immutable Audit Logging**: Persists structured event records in PostgreSQL `activity_logs` (preserving `ticket_code` and actor snapshots even if a ticket is deleted).
  2. **Targeted In-App Notifications**: Alerts administrators on new user tickets/replies and alerts requesters on admin updates, public replies, status changes, and resolutions (`notifications`).
  3. **Email Notification Outbox**: Generates and records structured transactional email notifications (`email_outbox`) for lifecycle events while keeping internal admin notes private.

### 3. Search, Filtering, Dashboard & Developer Tooling
- Parameterized `ILIKE` search across `ticket_code`, `title`, and `description`, multi-faceted filtering (`status`, `priority`, `category`, and Admin `requesterId`), custom sorting (`createdAt`, `updatedAt`, `priority`), server-side pagination (`1`–`50` per page), and formula-injection-safe CSV export (`src/utils/csv.ts`).
- Role-aware Dashboard (`src/components/OverviewView.tsx`) with status counts, urgent ticket count, resolution rate calculation, priority/category breakdowns, live activity feed, and 30-second background notification polling.
- Lazy idempotent sample ticket seeder (`src/server/services/seedService.ts`) that populates non-admin sample tickets on first query when the `tickets` table is empty.
- Automated unit and Express HTTP integration test suite (`rules.test.ts`, `eventsAndSecurity.test.ts`, `api.integration.test.ts`) using Node's native test runner (`node:test` via `tsx --test`).
- Complete REST API documentation (`docs/API_DOCUMENTATION.md`), PostgreSQL schema & ERD (`docs/DATABASE_DESIGN.md`), and importable Postman v2.1 collection (`docs/ResolveDesk.postman_collection.json`).

---

## Technology Stack

| Layer | Technology |
| --- | --- |
| Backend Runtime | Node.js, Express.js 4, TypeScript |
| Validation & Auth | Zod, `jsonwebtoken`, `node:crypto` (`scrypt`), Firebase Auth / Admin SDK |
| Database & ORM | PostgreSQL (`postgres:16-alpine`), Drizzle ORM (`drizzle-orm`, `drizzle-kit`, `pg` Pool) |
| Frontend | React 19, Vite, Tailwind CSS v4, Lucide React, Motion |
| Testing | `node:test`, `node:assert/strict`, `tsx` |
| Local Services | Docker Compose (`docker-compose.yml`) |

---

## Project Structure

```text
├── server.ts                                # Express + Vite dev / static production entry point
├── index.html                               # Frontend HTML entry
├── package.json                             # Scripts & dependencies
├── tsconfig.json                            # TypeScript compiler configuration
├── vite.config.ts                           # Vite + Tailwind v4 configuration
├── docker-compose.yml                       # PostgreSQL 16 + app service orchestration
├── firebase-applet-config.json              # Firebase web client project configuration
├── .env.example                             # Environment variable template
├── docs/
│   ├── API_DOCUMENTATION.md                 # Full REST API specification
│   ├── DATABASE_DESIGN.md                   # ERD, tables, constraints, indexing rationale
│   └── ResolveDesk.postman_collection.json  # Ready-to-import Postman v2.1 collection
└── src/
    ├── App.tsx                              # Workspace shell, navigation & notification polling
    ├── main.tsx                             # React mount point
    ├── index.css                            # Tailwind CSS v4 styles
    ├── components/                          # Modular React views (Auth, Overview, Tickets, Activity, etc.)
    ├── context/AuthContext.tsx              # In-memory JWT & Firebase session context
    ├── db/
    │   ├── schema.ts                        # Drizzle PostgreSQL schema & relations
    │   ├── index.ts                         # pg Pool + Drizzle client
    │   └── drizzle.config.ts                # Drizzle Kit configuration
    ├── lib/
    │   ├── api.ts                           # Typed frontend API client
    │   ├── firebase.ts                      # Firebase client Auth initialization
    │   └── firebase-admin.ts                # Firebase Admin token verification setup
    ├── shared/
    │   └── types.ts                         # Shared domain types & DTOs
    ├── utils/
    │   ├── csv.ts                           # Formula-safe CSV export helper
    │   └── format.ts                        # Status, priority, event & date formatters
    └── server/
        ├── app.ts                           # Express app factory & security headers
        ├── domain/rules.ts                  # Pure RBAC & ticket lifecycle rules
        ├── events/
        │   ├── ticketEventBus.ts            # Typed EventEmitter domain bus
        │   └── ticketEventHandlers.ts       # Audit log, notification & email subscribers
        ├── middleware/
        │   ├── auth.ts                      # Dual JWT + Firebase Bearer verification & requireAdmin
        │   └── errorHandler.ts              # Structured error mapping (AppError, Zod, PG codes)
        ├── routes/
        │   ├── authRoutes.ts                # /api/auth/*
        │   ├── ticketRoutes.ts              # /api/tickets/* & comments
        │   └── adminAndActivityRoutes.ts    # /api/dashboard, /api/activity, /api/notifications, /api/email-outbox, /api/admin
        ├── services/seedService.ts          # Lazy idempotent sample ticket seeder
        ├── utils/security.ts                # scrypt hashing, JWT sign/verify, timingSafeEqual
        ├── validators/schemas.ts            # Zod input schemas
        └── __tests__/                       # Unit & HTTP integration tests
```

---

## Local Setup Instructions

1. **Install dependencies**:
   ```bash
   npm install
   # or: bun install
   ```

2. **Configure environment variables**:
   Copy `.env.example` to `.env` and configure your PostgreSQL connection (`SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD`) along with optional `JWT_SECRET` (16+ characters for persistent signing across restarts), `ADMIN_SETUP_PASSCODE`, and `PORT` (defaults to `3000`).

3. **Start PostgreSQL** (via Docker Compose or local PostgreSQL):
   ```bash
   docker compose up -d postgres
   ```
   *(Note: `docker-compose.yml` also defines an `app` container service expecting a `Dockerfile` if you add one for containerized app builds.)*

4. **Push PostgreSQL schema**:
   ```bash
   npx drizzle-kit push --config=src/db/drizzle.config.ts
   ```

5. **Start the development server (Port `3000`)**:
   ```bash
   npm run dev
   ```
   For a production build:
   ```bash
   npm run build
   npm start
   ```

6. **Run automated tests & type checks**:
   ```bash
   npm test
   npm run lint
   ```

---

## Key Implementation Decisions

- **In-Memory Token Storage**: The React frontend keeps JWT and Firebase ID tokens strictly in memory (`AuthContext`) rather than `localStorage` or `sessionStorage` to reduce XSS token-exfiltration exposure.
- **Separated Domain Logic**: RBAC permission checks, ticket code generation, resolution rate math, and pagination clamping live in `src/server/domain/rules.ts` as pure functions so they can be verified deterministically with `node:test`.
- **Two-Layer Database Error Sanitization**: Raw PostgreSQL driver exceptions (`23505`, `23503`, etc.) are caught and translated into sanitized HTTP error payloads (`400`, `409`, `500`) in `src/server/middleware/errorHandler.ts` so internal schema details never leak to API clients.
- **Event Handler Failure Isolation**: `TicketEventBus.publish()` isolates subscriber failures so a transient notification or email outbox error never rolls back a persisted ticket mutation.
