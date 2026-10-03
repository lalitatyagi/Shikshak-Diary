# Classroom Tracker

Mobile-first web app for school teachers to track day-to-day classroom work
(homework, notebook checks, tests) that tools like Google Classroom don't handle
well in physical classrooms.

Built as a portfolio project by a BSc CS student and former teacher.

## Status

**Step 4 complete:** create classes, list schools/classes, import students from CSV
with per-row validation errors.

Live demo: _not deployed yet_  
Demo teacher login (after `npm run db:seed`):

- Email: `teacher@demo.local`
- Password: `Teacher123!`

## Auth API

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/register` | Creates a `TEACHER` (ignores any `role` in body) |
| POST | `/auth/login` | Returns `{ accessToken, user }`, sets refresh cookie |
| POST | `/auth/refresh` | Rotates tokens using httpOnly `refreshToken` cookie |
| POST | `/auth/logout` | Clears refresh cookie |
| GET | `/auth/me` | Requires `Authorization: Bearer <accessToken>` |

## Classes & students API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/schools` | List schools |
| GET | `/classes` | Classes assigned to the teacher |
| POST | `/classes` | Create class + subject link for the teacher |
| GET | `/classes/:classId/students` | Enrolled students (roll order) |
| POST | `/classes/:classId/students/import` | CSV import; returns per-row errors |

CSV columns: `rollNumber`, `name`, and optional `parentContact`.

Example body:

```json
{
  "csv": "rollNumber,name,parentContact\n1,Aarav Sharma,\n2,Ananya Verma,9800000002\n"
}
```

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
| Unified task model | One `Task` + `TaskStatus` for all activity types | Type rules live in application code |
| Short-lived access JWT + httpOnly refresh cookie | Easy clients + refresh off-limits to JS | Logout is cookie-clear only for now |
| Partial CSV import with per-row errors | Teacher can fix bad rows without redoing the whole file | Class may be half-imported until they re-run |

## Prerequisites

- Node.js 20+
- Postgres via Neon (linked) or Docker Desktop for local Compose

## Local setup

```bash
npm install
cp .env.example .env
cp .env apps/api/.env
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:web
```

- Web: http://localhost:5173  
- API health: http://localhost:3001/health  
- Login: `POST http://localhost:3001/auth/login`

## Scripts

| Command | What it does |
| --- | --- |
| `npm run lint` / `typecheck` / `test` | Quality checks |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed demo school/teacher/class/40 students |

## Out of scope

Fees, timetable, transport, library, payroll, chat, staff attendance, AI —
this is a classroom tracker, not a school ERP.
