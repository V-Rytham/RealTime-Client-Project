# Velozity Global Solutions - Real-Time Client Project Dashboard

A full-stack project management dashboard built for managing clients, projects, tasks, activity, and notifications in real time.

### Tech Stack

* **Frontend:** React, TypeScript
* **Backend:** Node.js, Express
* **Database:** PostgreSQL
* **Database access:** `pg` with raw SQL
* **Real-time communication:** Socket.io
* **Scheduled jobs:** node-cron

---

## 1. Getting Started

### Docker

Docker is the preferred way to start the application.

```bash
docker compose up --build
```

Once the containers are running:

* Frontend: http://localhost:5173
* Backend health check: http://localhost:4000/health
* PostgreSQL: `localhost:5432`
* Database: `velozity`
* PostgreSQL user: `postgres`
* PostgreSQL password: `postgres`

### Database setup

If running the backend outside Docker, create the environment file first:

```bash
cd backend
cp .env.example .env
npm install
npm run migrate
npm run seed
npm run dev
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

The frontend will be available at:

http://localhost:5173

### Seed users

All seeded users use:

```text
Password123!
```

| Email                | Role      |
| -------------------- | --------- |
| `admin@velozity.com` | ADMIN     |
| `pm1@velozity.com`   | PM        |
| `pm2@velozity.com`   | PM        |
| `dev1@velozity.com`  | DEVELOPER |
| `dev2@velozity.com`  | DEVELOPER |
| `dev3@velozity.com`  | DEVELOPER |
| `dev4@velozity.com`  | DEVELOPER |

---

## 2. Database

The application uses PostgreSQL with eight main tables:

* `users`
* `clients`
* `projects`
* `tasks`
* `task_status_history`
* `activity_logs`
* `notifications`
* `refresh_tokens`

The main relationships are:

```text
User
 ├── Clients
 ├── Projects
 ├── Tasks
 ├── Notifications
 └── Refresh Tokens

Client
 └── Projects
      └── Tasks
           ├── Status History
           └── Activity Logs
```

Foreign keys are enforced at the database level. Tasks, activity logs, and related records are deleted according to the relationships defined in `schema.sql`.

All database queries use parameterized SQL (`$1`, `$2`, etc.). SQL is kept outside controllers and is handled through the database/service layer.

### Important indexes

Indexes were added mainly around the queries used by the dashboard:

| Index                                              | Purpose                       |
| -------------------------------------------------- | ----------------------------- |
| `users(email)`                                     | Login lookup                  |
| `projects(client_id)`                              | Finding projects for a client |
| `projects(created_by)`                             | PM project filtering          |
| `tasks(project_id)`                                | Loading project tasks         |
| `tasks(assigned_to)`                               | Developer's tasks             |
| `tasks(status)`                                    | Status filtering              |
| `tasks(priority)`                                  | Priority filtering            |
| `tasks(due_date)`                                  | Due-date filtering            |
| `tasks(is_overdue)` partial                        | Overdue task queries          |
| `tasks(project_id, status)`                        | Project + status filtering    |
| `tasks(assigned_to, status)`                       | Developer + status filtering  |
| `activity_logs(project_id, created_at DESC)`       | Project activity feed         |
| `activity_logs(task_id, created_at DESC)`          | Task activity feed            |
| `activity_logs(created_at DESC)`                   | Admin activity feed           |
| `notifications(user_id, is_read, created_at DESC)` | Notification queries          |

---

## 3. Why raw SQL?

The project uses `pg` instead of an ORM.

The assignment allowed either Prisma or raw SQL, and I used raw SQL because it gives direct control over the queries and makes it easier to see exactly how the database is being accessed.

This was particularly useful for the filtered task lists and activity feed, where joins, indexes, and role-based conditions are important.

The trade-off is that some mapping and validation has to be handled manually, but for this size of application that was reasonable.

---

## 4. Backend

The backend is built with Node.js and Express.

Some of the main pieces are:

* Express for HTTP APIs
* Zod for request validation
* `pg` for PostgreSQL access
* Socket.io for real-time events
* JWT for authentication
* `cookie-parser` for refresh-token cookies
* Helmet and CORS for basic HTTP security
* node-cron for the overdue-task job

Errors are handled through centralized error middleware so API responses remain consistent and internal stack traces are not exposed.

---

## 5. Authentication

The application uses short-lived access tokens and refresh tokens.

* Access JWT: **15 minutes**
* Refresh JWT: **7 days**
* Access token is kept in frontend memory.
* Refresh token is stored as a hash in PostgreSQL.
* The refresh token itself is stored in an `HttpOnly` cookie.
* Refresh tokens are rotated when used.

The refresh cookie uses:

```text
HttpOnly
SameSite=Lax
Path=/api/auth
```

For local development, `Secure` is disabled. In production it should be enabled when using HTTPS.

Authentication and authorization are handled on the server. Frontend role checks are only used to control the UI and are not treated as security controls.

---

## 6. Role-based access

There are three roles:

```text
ADMIN
PM
DEVELOPER
```

The API checks the authenticated user's role and ownership before returning or modifying data.

### Admin

Can access the overall project/task information and activity feed.

### Project Manager

Can access projects they created and manage the tasks associated with those projects.

### Developer

Can access tasks assigned to them and the projects associated with those tasks.

For example, developer task queries use:

```sql
WHERE assigned_to = $1
```

rather than relying on the frontend to hide other users' tasks.

The same authorization rules are applied to Socket.io room joins. A user cannot simply send a `project:join` event and gain access to another project's events.

---

## 7. Real-time updates

Socket.io is attached to the same HTTP server as the Express application.

Rooms are used for different types of updates:

```text
project:{id}
user:{id}
role:ADMIN
```

For example, when a task status changes:

```text
PATCH /api/tasks/:id/status
        |
        v
Update task
        |
        +--> task_status_history
        |
        +--> activity_logs
        |
        +--> notifications
        |
        v
Socket.io events
```

The relevant users then receive the update without polling the API.

Notifications are stored in PostgreSQL as well as emitted through Socket.io. This means a user who was offline can still see the notification after logging back in.

---

## 8. Activity feed

The activity feed is stored in PostgreSQL rather than only in memory.

When a task changes, an activity record is created with information such as:

* project
* task
* user who made the change
* action
* message
* metadata
* timestamp

The activity API applies the same role restrictions as the rest of the application.

On reconnect, the frontend fetches recent activity again:

```text
GET /api/activity?limit=20
```

This is also used as a catch-up mechanism for events that may have been missed while the client was disconnected.

---

## 9. Task filters

Tasks can be filtered through query parameters:

```text
GET /api/tasks?status=&priority=&dueFrom=&dueTo=&projectId=
```

The frontend keeps these filters in the URL using `URLSearchParams`.

This means a filtered dashboard can be refreshed or shared without losing the current filter state.

---

## 10. Overdue tasks

A scheduled node-cron job checks for overdue tasks once a minute.

The main update is effectively:

```sql
UPDATE tasks
SET is_overdue = true
WHERE due_date < NOW()
  AND status <> 'DONE'
  AND is_overdue = false
RETURNING *;
```

Only newly overdue tasks are returned. Those tasks are then used to create the corresponding activity and notification records.

For a single application instance, node-cron is sufficient and avoids adding another service such as Redis.

---

## 11. Architectural decisions

### PostgreSQL + raw SQL

Raw SQL was used instead of Prisma to keep the database layer explicit. The project has a relatively small schema, and the important queries are straightforward enough to manage without an ORM.

### Express

Express was used for the REST API because it integrates cleanly with the rest of the Node.js stack and Socket.io.

### Socket.io

Socket.io provides rooms, reconnection handling, authentication middleware, and convenient event-based communication.

Using native WebSockets would require implementing more of this functionality separately.

### node-cron

The overdue check is a simple scheduled database update, so adding Redis and BullMQ would be unnecessary for the current application.

---

## 12. Known limitations

The current implementation is designed around a single backend instance.

* Presence is stored in an in-memory `Map`, so it is not shared between multiple instances.
* node-cron runs independently on every backend instance.
* Socket.io would need a shared adapter for multiple backend instances.
* A distributed job system such as BullMQ could be used if scheduled jobs need to run across multiple instances.
* There are currently no file uploads or task comments.

For a horizontally scaled deployment, Redis could be introduced for the Socket.io adapter and shared job infrastructure. PostgreSQL advisory locks could also be used to ensure the overdue job runs only once across instances.

---

## 13. Explanation

The most challenging part of the project was handling the real-time activity feed while keeping role-based access intact. Sending an event to a Socket.io room is straightforward, but the server still needs to make sure that a user cannot subscribe to a project they should not have access to.

I handled this by applying the same authorization rules to both REST requests and Socket.io room joins. Project access is checked before a socket is allowed into a project room, and user-specific events are also sent through user rooms where needed.

The database remains the source of truth for activity and notifications. Socket.io is mainly responsible for delivering changes immediately. When a client reconnects, it fetches recent activity from the API instead of depending on events that may have been missed while it was offline.

The other part that required some consideration was the overdue task handling. A minute-based cron job updates overdue tasks and creates the related activity and notification records. This works well for a single instance. If the application were deployed across multiple instances, I would add a distributed locking mechanism or move the job to a queue-based setup.
https://github.com/V-Rytham/RealTime-Client-Project