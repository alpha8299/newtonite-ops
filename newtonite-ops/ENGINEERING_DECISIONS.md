# Engineering Decisions

## 1. PostgreSQL and relational modelling
Teams, memberships, work items, comments, idempotency records, and audit events have explicit relationships. PostgreSQL constraints and transactions protect data integrity. Indexes target team/status, assignee/status, and updated-time access patterns.

## 2. Optimistic concurrency
Every work item has a monotonically increasing `version`. The client submits the version it read. The server performs a conditional update (`id` + `version`) and returns HTTP 409 when no row matches. This avoids silently overwriting another user's changes without holding long-lived database locks.

## 3. Server-side authorization
The API resolves the current user from a development identity header and checks team membership and role on protected operations. The UI's disabled or hidden controls are only a usability aid. The identity header is explicitly a local demo mechanism and must be replaced by verified authentication before deployment.

## 4. Atomic audit logging
Every mutation writes its audit event in the same Prisma transaction as the data change. If the audit insert fails, the work-item mutation rolls back. The application exposes audit reads but no edit/delete endpoint for audit events.

## 5. Idempotent creation and deliberate scope
Create requests accept an `Idempotency-Key`. A unique `(userId, key)` record and the created item/response are persisted atomically; a retry returns the original response. The app prioritizes concurrency, access checks, workflow validation, and traceability over notifications and advanced analytics.

## Trade-offs and next steps
The first version uses a single Express service and PostgreSQL to keep operations understandable. For the assessment, team admins are the only role allowed to resolve an item marked as requiring approval; clients cannot self-assert that approval happened. A production version should model a separate approval record and separation-of-duties policy. Next steps would be real SSO, approval policy modelling, transactional outbox + worker for notifications, rate limits, observability, database-backed integration tests in CI, and load/security testing.
