# Classroom Tracker

Mobile-first web app for school teachers to track day-to-day classroom work
(homework, notebook checks, tests) that tools like Google Classroom don't handle
well in physical classrooms.

Built as a portfolio project by a BSc CS student and former teacher.

## Status

**Step 1 complete:** monorepo scaffold, tooling, CI, Docker Compose (Postgres),
API health endpoint.

Live demo: _not deployed yet_  
Demo teacher login: _coming after auth (Step 3)_

## Architecture (current)

```
apps/web  (React + Vite)  --HTTP-->  apps/api  (Fastify)  -- later -->  Postgres
packages/shared  (Zod schemas / types used by web + api)
```

Local Postgres runs via Docker Compose. Prisma and the full data model arrive in
Step 2.

## Design decisions so far

| Decision | Why | Trade-off |
| --- | --- | --- |
| npm workspaces monorepo | Share Zod types between web and API; one CI pipeline | Slightly heavier than two separate repos |
| Unified task model (planned) | One `Task` + `TaskStatus` for all classroom activities | Type-specific validation must live in code, not separate tables |

## Prerequisites

- Node.js 20+
- Docker Desktop (for Postgres) — install from https://www.docker.com/products/docker-desktop/ if `docker` is not on your PATH

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Env file
cp .env.example .env

# 3. Start Postgres
npm run db:up

# 4. Build shared package (needed before API/web in some workflows)
npm run build -w @classroom-tracker/shared

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

## Out of scope

Fees, timetable, transport, library, payroll, chat, staff attendance, AI —
this is a classroom tracker, not a school ERP.
