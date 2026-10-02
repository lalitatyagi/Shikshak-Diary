# Classroom Tracker

Mobile-first web app for school teachers to track day-to-day classroom work
(homework, notebook checks, tests) that tools like Google Classroom don't handle
well in physical classrooms.

Built as a portfolio project by a BSc CS student and former teacher.

## Status

**Step 2 complete:** Prisma schema (unified task model), committed migration, and
seed script (1 school, 1 teacher, 1 class, 40 students).

Live demo: _not deployed yet_  
Demo teacher login (after `npm run db:seed`):

- Email: `teacher@demo.local`
- Password: `Teacher123!`

Auth routes arrive in Step 3 — the seeded user is ready for that.

## Architecture (current)

```
apps/web  (React + Vite)
    |
    v
apps/api  (Fastify + Prisma)
    |
    v
PostgreSQL  (Docker Compose)  — School / Class / Student / Task / TaskStatus …
packages/shared  (Zod schemas + enums shared by web + api)
```

## Design decisions so far

| Decision | Why | Trade-off |
| --- | --- | --- |
| npm workspaces monorepo | Share Zod types between web and API; one CI pipeline | Slightly heavier than two separate repos |
| Unified task model | One `Task` + `TaskStatus` for homework, tests, notebook checks | Type-specific validation lives in application code, not separate tables |
| Committed Prisma migrations | Schema history is reviewable in git; deploys use `migrate deploy` | Requires discipline — never edit applied migrations |

## Prerequisites

- Node.js 20+
- Docker Desktop (for Postgres) — install from https://www.docker.com/products/docker-desktop/ if `docker` is not on your PATH

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Env file (root + copy for Prisma CLI in apps/api)
cp .env.example .env
cp .env apps/api/.env

# 3. Start Postgres
npm run db:up

# 4. Apply migrations + seed demo data
npm run db:migrate
npm run db:seed

# 5. Run API and web (separate terminals)
npm run dev:api
npm run dev:web
```

- Web: http://localhost:5173  
- API health: http://localhost:3001/health  
- Postgres: `localhost:5432` (user/password/db from `.env.example`)

## Scripts

| Command | What it does |
| --- | --- |
| `npm run lint` | ESLint across the monorepo |
| `npm run format:check` | Prettier check |
| `npm run typecheck` | TypeScript `--noEmit` in each workspace |
| `npm test` | Vitest in each workspace |
| `npm run db:up` / `db:down` | Start/stop Postgres via Docker Compose |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migrate` | Apply committed migrations (`migrate deploy`) |
| `npm run db:migrate:dev` | Create/apply migrations during development |
| `npm run db:seed` | Seed 1 school, teacher, class, 40 students |
| `npm run db:reset` | Reset DB, re-apply migrations, seed |

## Out of scope

Fees, timetable, transport, library, payroll, chat, staff attendance, AI —
this is a classroom tracker, not a school ERP.
