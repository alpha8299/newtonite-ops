# Newtonite Ops

A focused operational work-management app built with React + TypeScript, Express + TypeScript, Prisma, and PostgreSQL.

## Requirements
- Node.js 20+
- Docker Desktop / Docker Engine with Compose

## Quick start
```bash
cp .env.example .env
docker compose up -d db
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```
Open http://localhost:5173. The frontend uses the API at http://localhost:4000.

Demo identities are selected in the top bar:
- Alex Morgan — Operations Admin (`user-admin`)
- Sam Lee — Operations Member (`user-member`)
- Taylor Reed — Read-only Auditor (`user-auditor`)

This is a local assessment demo. The `x-user-id` identity header is intentionally a development-only substitute for real authentication. Do not deploy it as-is.

## Commands
- `npm run dev` — start frontend and API concurrently
- `npm run build` — build frontend and backend
- `npm test` — run unit and API tests
- `npm run db:generate` — generate Prisma client
- `npm run db:migrate` — apply migrations in development
- `npm run db:seed` — seed demo users, teams, and sample work

## Important implementation notes
- Work-item updates use optimistic concurrency (`version`) and return `409` for stale writes.
- Status transitions are validated on the server.
- Work-item changes and audit entries commit in one transaction.
- Create requests support `Idempotency-Key`; the key and response are persisted in the same transaction as the work item.
- Authorization is enforced by API middleware and resource/team checks.
- Lists are filtered and paginated in PostgreSQL; the browser never loads the entire history.
- The local seeded identities are not production authentication. Replace the header with verified session/JWT identity before deployment.

## Known limitations
- Demo identity selection is not real authentication.
- Approval requirements are represented by a simple `requiresApproval` flag; only a team admin can resolve those items in this assessment build. Production would need separate approval records and separation-of-duties rules.
- No background notification worker, SSO, rate limiting, or production observability is included.
- Search uses PostgreSQL `contains` filtering; use full-text search if search volume warrants it.
- Run security, migration, backup/restore, and load tests before production use.
