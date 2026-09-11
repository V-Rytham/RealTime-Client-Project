# Velozity Global Solutions — Real-Time Client Project Dashboard

Full-stack: **React + TypeScript** frontend, **Node.js + Express** backend, **PostgreSQL + raw SQL (pg)**, **Socket.io**, **node-cron**.

## 1. Quick start (Docker — preferred)

```bash
docker compose up --build
# frontend: http://localhost:5173
# backend:  http://localhost:4000/health
# postgres: localhost:5432 (postgres/postgres, db velozity)
```

Run migrations + seed (in another terminal):

```bash
cd backend
cp .env.example .env
npm install
npm run migrate
npm run seed
npm run dev
```

Frontend:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev  # http://localhost:5173
```

Seed logins (password `Password123!`):
- `admin@velozity.com` (ADMIN)
- `pm1@velozity.com`, `pm2@velozity.com` (PM)
- `dev1@velozity.com` … `dev4@velozity.com` (DEVELOPER)

## 2. Database schema

```
users (id PK, name, email UNIQUE, password_hash, role ENUM[ADMIN|PM|DEVELOPER], created_at)
clients (id PK, name, contact_email, created_by FK→users, created_at)
projects (id PK, name, description, client_id FK→clients, created_by FK→users, created_at)
tasks (id PK, project_id FK→projects CASCADE, title, description, assigned_to FK→users,
       status ENUM[TODO|IN_PROGRESS|IN_REVIEW|DONE], priority ENUM[LOW|MEDIUM|HIGH|CRITICAL],
       due_date, is_overdue BOOL, created_by FK→users, created_at, updated_at)
task_status_history (id PK, task_id FK→tasks CASCADE, old_status, new_status, changed_by FK→users, created_at)
activity_logs (id PK, project_id FK→projects CASCADE, task_id FK→tasks CASCADE, actor_id FK→users,
               action, message, metadata JSONB, created_at)
notifications (id PK, user_id FK→users CASCADE, type, title, body, task_id FK, project_id FK, is_read, created_at)
refresh_tokens (id PK, user_id FK→users CASCADE, token_hash UNIQUE, expires_at, created_at)
```

Relationships: one client → many projects; one project → many tasks; one task → many history/activity rows; one user → many notifications/tokens. All FKs enforced in Postgres (`schema.sql`). SQL is centralized in `src/config/db.ts`, `src/services/`, route files — never string-concatenated in controllers (all parameterized `$1…`).

### Indexing decisions
| Index | Why |
|---|---|
| `users(email)` UNIQUE | login lookup on every auth |
| `users(role)` | role-filtered lists |
| `projects(client_id)`, `projects(created_by)` | PM "my projects" + client join |
| `tasks(project_id)`, `tasks(assigned_to)` | project view + developer "my tasks" (hottest queries) |
| `tasks(status)`, `tasks(priority)`, `tasks(due_date)` | dashboard filters via query params |
| `tasks(is_overdue) partial` | overdue cron + admin count scans only overdue rows |
| `tasks(project_id,status)`, `tasks(assigned_to,status)` composite | combined filter (project + status) without bitmap heap |
| `activity_logs(project_id,created_at DESC)`, `(task_id,created_at DESC)` | feed pagination per project/task, last-20 catchup |
| `activity_logs(created_at DESC)` | global admin feed |
| `notifications(user_id,is_read,created_at DESC)` | badge count + dropdown in one index scan |

## 3. Architectural decisions (as required)

**1) Raw SQL — chosen over Prisma. Justification:** the task explicitly allows "Prisma or raw SQL" and forbids randomly mixing SQL into controllers. Raw SQL via `pg` with a thin `query()` helper gives full visibility into joins, indexes, and transactions; no codegen/migration black box; parameterized queries prevent injection; all SQL lives in `db/schema.sql`, `services/`, and route-level repositories — so review of schema quality and indexing is trivial. For a small relational domain (8 tables, heavy filtered reads) Prisma adds client overhead and obscures the exact SQL being evaluated (20% of marks are DB design). Trade-off: manual mapping, accepted.

**2) Backend: Node.js + Express — chosen over Fastify. Justification:** Express has the largest middleware ecosystem (`helmet`, `cors`, `cookie-parser`), simplest Socket.io attachment to the same HTTP server, and lowest hiring/onboarding friction for an agency team. Fastify is faster on synthetic benchmarks, but this app is I/O-bound (Postgres + WS fan-out) where framework overhead is negligible. All inputs validated with `zod`, errors via structured `HttpError` middleware (no stack traces).

**3) ORM: none — raw SQL (pg).** See (1). "ORM: SQL" = direct SQL, centralized, parameterized.

**4) Background jobs: node-cron — chosen over BullMQ. Justification:** overdue-flagging is a single idempotent `UPDATE … WHERE due_date < NOW() AND status<>'DONE' RETURNING *` run once a minute. BullMQ requires Redis, extra infra, and queue semantics (retries, concurrency) we don't need. node-cron is zero-infra, runs in-process, logs clearly, and is trivially moved to hourly (`0 * * * *`) in prod. Documented limitation: multi-instance deployments would double-run — use advisory lock or BullMQ + Redis then.

**WebSocket library: Socket.io — chosen over native `ws`. Justification:** rooms (`project:{id}`, `user:{id}`, `role:ADMIN`), automatic reconnection, auth middleware, and fallback transports. Native WS would require hand-rolling rooms, presence, and reconnect + missed-event logic. Presence (online count) is an in-memory `Map<userId,socketCount>` broadcast as `presence:update`; missed events are **always fetched from DB** (`GET /api/activity?limit=20`), never memory.

**Token storage:** access JWT (15m) in memory only (React state); refresh JWT (7d, rotated) hashed with SHA-256 in `refresh_tokens` table + `HttpOnly; SameSite=Lax; Path=/api/auth` cookie. Frontend uses `withCredentials` + silent `/refresh` on 401. Role is re-verified server-side from signed JWT on **every** request plus ownership checks (PM `created_by`, Developer `assigned_to`) — frontend hiding is cosmetic only.

## 4. Role enforcement (API level)
- `requireAuth` verifies JWT; `requireRole(...)` gates route groups.
- Projects: PM `WHERE created_by = me`; Developer only projects containing their tasks.
- Tasks: Developer `WHERE assigned_to = me`; status PATCH allowed iff ADMIN / owning PM / assignee.
- Activity: `listActivityFor()` issues three different SQL queries per role — Developer joins `tasks mine ON mine.assigned_to = me`.
- Socket `project:join` re-checks the same ownership query before adding to room.

## 5. Real-time flow
1. `PATCH /api/tasks/:id/status` → update + `task_status_history` insert + `activity_logs` insert (message like "Ravi moved Task #12 from In Progress → In Review").
2. `emitActivity()` → `project:{id}` room + `role:ADMIN` + targeted `user:{assignee}` / `user:{pmOwner}`.
3. Notifications inserted in DB and emitted as `notification:new` with fresh unread count — badge updates with **no polling**.
4. Offline user reconnects → `GET /api/activity?limit=20` (role-filtered SQL) repopulates feed.

## 6. Filters
`GET /api/tasks?status=&priority=&dueFrom=&dueTo=&projectId=` — frontend syncs filters to `URLSearchParams` so URLs are shareable.

## 7. Known limitations
- Presence is in-memory (single instance; use Redis adapter for multi-instance).
- Cron runs per-instance (use pg advisory lock or BullMQ for HA).
- No file uploads / comments (out of scope).
- Refresh cookie `Secure=false` for local dev; set `COOKIE_SECURE=true` + HTTPS in prod.

## 8. Explanation (submission field, 198 words)
The hardest problem was the role-filtered real-time feed without leaking data. Broadcasting to a project room is easy, but a Developer must never receive another developer's events even if they join a room manually. I solved it with defense in depth: the server authorizes every `project:join` with the same SQL ownership check as REST, emits targeted copies to `user:{id}` rooms for assignees/owners, and treats socket events as hints — the client always revalidates via role-filtered `GET /api/activity`, and reconnect catchup reads the last 20 rows from Postgres, never memory. Presence stays in-memory only for the live count. The overdue flag is a node-cron `UPDATE…RETURNING` that writes activity + notification rows so offline users see them on return. If I did one thing differently, I'd add Redis (Socket.io adapter + BullMQ) from day one: the current in-process presence and cron are correct for a single instance but would double-emit under horizontal scaling, and a `LISTEN/NOTIFY` or queue would make the feed robust across instances.
