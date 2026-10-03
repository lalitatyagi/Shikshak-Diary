# Classroom Tracker

Mobile-first web app for school teachers to track day-to-day classroom work
(homework, notebook checks, tests) that tools like Google Classroom don't handle
well in physical classrooms.

Built as a portfolio project by a BSc CS student and former teacher.

## Status

**Step 3 complete:** email/password auth with JWT access tokens, httpOnly refresh
cookies, protected routes, and role checks.

Live demo: _not deployed yet_  
Demo teacher login (after `npm run db:seed`):

- Email: `teacher@demo.local`
- Password: `Teacher123!`

## Auth API

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/register` | Creates a `TEACHER` (open self-serve register for V1) |
| POST | `/auth/login` | Returns `{ accessToken, user }`, sets refresh cookie |
| POST | `/auth/refresh` | Rotates tokens using httpOnly `refreshToken` cookie |
| POST | `/auth/logout` | Clears refresh cookie |
| GET | `/auth/me` | Requires `Authorization: Bearer <accessToken>` |

## Architecture (current)

```
apps/web  (React + Vite)
    |
    v
apps/api  (Fastify + Prisma + JWT auth)
    |
    v
PostgreSQL  (Neon or Docker Compose)
packages/shared  (Zod schemas + enums shared by web + api)
```

## Design decisions so far

| Decision | Why | Trade-off |
| --- | --- | --- |
| npm workspaces monorepo | Share Zod types between web and API; one CI pipeline | Slightly heavier than two separate repos |
| Unified task model | One `Task` + `TaskStatus` for homework, tests, notebook checks | Type-specific validation lives in application code |
| Committed Prisma migrations | Schema history is reviewable in git | Never edit applied migrations |
| Short-lived access JWT + httpOnly refresh cookie | Access token is easy for mobile clients; refresh stays off JS | Logout is cookie-clear only (no server-side token denylist yet) |

## Prerequisites

- Node.js 20+
- Postgres via Neon (linked) or Docker Desktop for local Compose

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Env file (apps/api/.env is what migrate + seed + API use)
cp .env.example .env
cp .env apps/api/.env
# Or use Neon: neon link … (writes DATABASE_URL)

# 3. Apply migrations + seed demo data
npm run db:migrate
npm run db:seed

# 4. Run API and web (separate terminals)
npm run dev:api
npm run dev:web
```

- Web: http://localhost:5173  
- API health: http://localhost:3001/health  
- Login: `POST http://localhost:3001/auth/login` with demo credentials

## Scripts

| Command | What it does |
| --- | --- |
| `npm run lint` | ESLint across the monorepo |
| `npm run format:check` | Prettier check |
| `npm run typecheck` | TypeScript `--noEmit` in each workspace |
| `npm test` | Vitest in each workspace |
| `npm run db:up` / `db:down` | Start/stop Postgres via Docker Compose |
| `npm run db:migrate` | Apply committed migrations |
| `npm run db:seed` | Seed 1 school, teacher, class, 40 students |

## Out of scope

Fees, timetable, transport, library, payroll, chat, staff attendance, AI —
this is a classroom tracker, not a school ERP.
