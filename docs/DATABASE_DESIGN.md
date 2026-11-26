# Database Design — ResolveDesk (PostgreSQL)

ResolveDesk uses a normalized relational schema in **PostgreSQL** managed via **Drizzle ORM** (`src/db/schema.ts`).

---

## Entity-Relationship Diagram

```text
┌──────────────────────┐         1 : N         ┌───────────────────────────┐
│        users         │◄──────────────────────│          tickets          │
├──────────────────────┤  requester_id (FK)    ├───────────────────────────┤
│ id (PK, serial)      │                       │ id (PK, serial)           │
│ uid (UNIQUE)         │◄ - - - - - - - - - - -│ ticket_code (UNIQUE)      │
│ name                 │  assigned_admin_id    │ title                     │
│ email (UNIQUE)       │  (FK, nullable)       │ description               │
│ password_hash        │                       │ category                  │
│ role ('USER'|'ADMIN')│                       │ priority                  │
│ auth_provider        │                       │ status                    │
│ created_at           │                       │ requester_id (FK)         │
│ updated_at           │                       │ assigned_admin_id (FK)    │
└──────────┬───────────┘                       │ resolved_at               │
           │                                   │ created_at / updated_at   │
           │ 1 : N                             └──────┬──────────┬─────────┘
           │                                          │ 1 : N    │ 1 : N
           ▼                                          ▼          │
┌──────────────────────┐               ┌──────────────────────┐  │
│    notifications     │               │       comments       │  │
├──────────────────────┤               ├──────────────────────┤  │
│ id (PK, serial)      │               │ id (PK, serial)      │  │
│ user_id (FK->users)  │               │ ticket_id (FK)       │  │
│ ticket_id (FK, null) │               │ author_id (FK->users)│  │
│ event_type           │               │ body                 │  │
│ title                │               │ is_internal (bool)   │  │
│ message              │               │ created_at           │  │
│ is_read (bool)       │               └──────────────────────┘  │
│ created_at           │                                         │
└──────────────────────┘                                         ▼
                                       ┌───────────────────────────────────┐
┌──────────────────────────────────┐   │           activity_logs           │
│          email_outbox            │   ├───────────────────────────────────┤
├──────────────────────────────────┤   │ id (PK, serial)                   │
│ id (PK, serial)                  │   │ event_type                        │
│ recipient_email                  │   │ ticket_id (FK, ON DELETE SET NULL)│
│ recipient_name                   │   │ ticket_code (preserved string)    │
│ subject                          │   │ actor_id (FK, ON DELETE SET NULL) │
│ body                             │   │ actor_name / actor_role           │
│ event_type                       │   │ summary                           │
│ ticket_code                      │   │ metadata_json                     │
│ delivery_status                  │   │ created_at                        │
│ created_at                       │   └───────────────────────────────────┘
└──────────────────────────────────┘
```

---

## Table Specifications & Design Rationale

### 1. `users`
Stores both local JWT email/password accounts and Firebase Google Sign-In accounts under a unified identity table.
- **Unique constraints**: `uid` (Firebase UID or `local_<uuid>`) and `email` (always normalized to lowercase).
- **Security**: `password_hash` stores salted `scrypt` output (`<16-byte-hex-salt>:<64-byte-hex-key>`). Plaintext passwords are never stored.
- **Indexes**: `users_role_idx` accelerates admin lookup when dispatching event notifications to all administrators.

### 2. `tickets`
Core helpdesk entity with strict foreign key links to `users`.
- `ticket_code`: Human-readable immutable reference (`TKT-1001`, etc.) with a `UNIQUE` index for quick search and email subject referencing.
- `requester_id`: `NOT NULL` foreign key to `users.id` (`ON DELETE CASCADE`).
- `assigned_admin_id`: Nullable foreign key to `users.id` (`ON DELETE SET NULL`) so removing an admin unassigns their tickets cleanly without losing ticket records.
- `resolved_at`: Populated automatically when an admin transitions status to `RESOLVED`; cleared if reopened.
- **Indexes**: `tickets_requester_idx`, `tickets_status_idx`, `tickets_priority_idx`, and `tickets_created_at_idx` optimize both User-scoped queries (`WHERE requester_id = $1`) and Admin queue filters/sorting.

### 3. `comments`
Chronological threaded replies associated with a ticket and author.
- `ticket_id` (`ON DELETE CASCADE`) and `author_id` (`ON DELETE CASCADE`).
- `is_internal`: Boolean flag allowing administrators to collaborate with internal triage notes that are filtered out at the SQL query level (`WHERE is_internal = false`) for non-admin requesters.
- **Index**: `comments_ticket_idx` speeds up loading ticket discussions and aggregating per-ticket comment counts.

### 4. `activity_logs`
Append-only audit trail populated automatically by the `TicketEventBus` audit handler.
- `ticket_id` uses `ON DELETE SET NULL` while `ticket_code`, `actor_name`, and `actor_role` are denormalized snapshot strings. This guarantees that even if a ticket is deleted (`TICKET_DELETED`), the compliance audit trail remains intact and readable.
- **Indexes**: `activity_logs_ticket_idx`, `activity_logs_event_type_idx`, and `activity_logs_created_at_idx`.

### 5. `notifications`
Per-user in-app alert inbox driven by ticket events.
- **Composite index**: `notifications_unread_idx (user_id, is_read)` provides fast unread badge count calculations.

### 6. `email_outbox`
Transactional email dispatch log created by the event notification subscriber, recording recipient, subject, body, triggering `event_type`, and delivery status.
- **Index**: `email_outbox_created_at_idx` for reverse-chronological inspection.
