# Classroom Tracker

Mobile-first web app for school teachers to track day-to-day classroom work
(homework, notebook checks, tests) that tools like Google Classroom don't handle
well in physical classrooms.

Built as a portfolio project by a BSc CS student and former teacher.

## Status

**V2 Step 4 complete:** CSV export for student reports and defaulters, plus
Print / PDF via the browser. See [docs/DEPLOY.md](docs/DEPLOY.md) for optional
deploy later.

Live demo: _set URLs after first deploy_  
- Web: `https://<your-app>.vercel.app`  
- API health: `https://<your-api>.onrender.com/health`

Demo teacher login (after `npm run db:seed` against Neon):

- Email: `teacher@demo.local`
- Password: `Teacher123!` (local/demo seed only — `npm run db:seed` refuses to run when `NODE_ENV` is `production`)

## Auth API

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/register` | Creates a `TEACHER` (ignores any `role` in body) |
| POST | `/auth/login` | Returns `{ accessToken, user }`, sets refresh cookie |
| POST | `/auth/refresh` | Rotates tokens using httpOnly `refreshToken` cookie |
| POST | `/auth/logout` | Revokes the refresh token and clears the cookie |
| GET | `/auth/me` | Requires `Authorization: Bearer <accessToken>` |

## Classes & students API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/schools` | Schools the caller belongs to (ADMIN: all) |
| POST | `/schools` | ADMIN creates a school |
| POST | `/schools/:schoolId/members` | ADMIN invites a registered teacher by email |
| GET | `/classes` | Classes assigned to the teacher |
| POST | `/classes` | Create a class in a school the teacher belongs to |
| GET | `/classes/:classId/students` | Enrolled students (roll order) |
| POST | `/classes/:classId/students/import` | CSV import; returns per-row errors |

CSV columns: `rollNumber`, `name`, and optional `parentContact`.
A roll number that already belongs to a student in a class you cannot access is a per-row error. The import does not rename that student or enroll them. One import accepts at most 200 student rows.

Example body:

```json
{
  "csv": "rollNumber,name,parentContact\n1,Aarav Sharma,\n2,Ananya Verma,9800000002\n"
}
```

## Tasks API (V1)

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/classes/:classId/tasks` | Create task + PENDING statuses (transaction) |
| GET | `/classes/:classId/tasks` | List tasks for a class |
| GET | `/tasks/:taskId` | Task detail with `statusCount` |

Create types: `DAILY_HOMEWORK`, `NOTEBOOK_CHECK`, `WEEKLY_TEST` (requires `maxMarks`),
`HOLIDAY_HOMEWORK` (requires `totalParts`).  
`PUT /task-statuses/:id` accepts optional `marks` / `partsDone` (type-checked).  
`assignedOn` / `dueOn` are **Asia/Kolkata calendar dates** (`YYYY-MM-DD`).  
Late student imports get `PENDING` rows for open (not past-due) tasks.

## Tick grid API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/classes/:classId/grid` | Students × tasks × statuses (+ `defaultSubjectId`) |
| PUT | `/task-statuses/:statusId` | Body `{ status, version }` — queued taps avoid 409 |
| POST | `/tasks/:taskId/mark-all-complete` | Only updates **PENDING** → DONE/CHECKED |

## Defaulters API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/classes/:classId/defaulters?days=7` | Students with **2+** `NOT_DONE` / `NOT_CHECKED` on tasks assigned in the last N Kolkata days (`days` 1–90, default 7) |

Seed marks 3 demo students as defaulters so the list is not empty.

## Student report API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/classes/:classId/students/:studentId/report?days=30` | Summary counts + task rows for one enrolled student (`days` 1–365, default 30). Includes `weeklyTestAvgMarks` when scored tests exist. |

## Parent link API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/classes/:classId/students/:studentId/parent-link` | Active-link metadata (no raw token) |
| POST | `/classes/:classId/students/:studentId/parent-link` | Create or rotate; returns raw `token` + `path` once (`expiresInDays` 1–365, default 90) |
| DELETE | `/classes/:classId/students/:studentId/parent-link` | Revoke the current link |
| GET | `/parent/:token/report?days=30` | **Public** read-only report (stricter rate limit; 404 if expired/revoked) |
| GET | `/parent/:token/report.csv?days=30` | **Public** CSV of the same report |

Only the SHA-256 hash of the token is stored. Rotating invalidates the previous URL.
Web parents open `/p/<token>` (no login).

## Export API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/classes/:classId/students/:studentId/report.csv?days=30` | Teacher CSV of the student report (UTF-8 BOM for Excel) |
| GET | `/classes/:classId/defaulters.csv?days=7` | Teacher CSV of the defaulters list |

PDF: use **Print / PDF** in the web UI (browser print dialog → Save as PDF). No server-side PDF library.

## Web UI

```bash
npm run dev:api
npm run dev:web
```

Open http://localhost:5173 → sign in → pick a class → tick grid, students
(report + parent link), or defaulters.

## Architecture (current)

```
apps/web  (React + Vite)  →  Vercel
    |  VITE_API_BASE_URL + credentials
    v
apps/api  (Fastify + Prisma + JWT auth)  →  Render
    |
    v
PostgreSQL  →  Neon  (Docker Compose for local)
packages/shared  (Zod schemas + enums shared by web + api)
```

Deploy runbook: [docs/DEPLOY.md](docs/DEPLOY.md) (`render.yaml`, `vercel.json`).

## Design decisions so far

| Decision | Why | Trade-off |
| --- | --- | --- |
| npm workspaces monorepo | Share Zod types between web and API; one CI pipeline | Slightly heavier than two separate repos |
| Unified task model | One `Task` + `TaskStatus` for all activity types | Type rules live in application code |
| Short-lived access JWT + hashed refresh sessions | The cookie lifetime follows `JWT_REFRESH_TTL`. Each refresh revokes the previous token, and logout revokes it too | A stolen refresh token works only until the next refresh or logout |
| Single-flight refresh on 401 | One expired access token does not log the teacher out mid-class; parallel calls share one refresh and retry once | If refresh fails, the session is cleared and the browser goes to login |
| CORS allowlist, helmet, and login rate limit | The API does not reflect arbitrary origins with cookies, and login/register are capped per IP | Local `.env` must list the web origin in `CORS_ORIGINS` |
| School membership, not open bootstrap | An admin creates the school and invites teachers. A new account with no membership sees no schools and cannot create a class in someone else's. CSV import will not update a student enrolled in a class the caller cannot access; that roll is a per-row error | A teacher cannot self-join a school. Someone with the ADMIN role has to invite them |
| Partial CSV import with per-row errors | Teacher can fix bad rows without redoing the whole file | Class may be half-imported until they re-run |
| Task + statuses created in one transaction | No task without a full PENDING grid for the class | Large classes = bigger write; still fine for ~40 students |
| Optimistic status cycle + version check | Feels instant on a phone; 409 if another update won | Needs refresh/invalidate after conflicts |
| SQL aggregation for defaulters | One query with `HAVING COUNT(*) >= 2`; cheap for ~40 students | Miss criteria are status-based, not “late relative to due date” yet |
| Student report reuses defaulters date window | Same Kolkata `days` lookback; one query per student | Not a class-wide export yet (CSV/PDF is a later V2 step) |
| Parent link = hashed secret URL, not parent accounts | Teacher can share WhatsApp-friendly read-only report without registering parents | Anyone with the URL can view until revoke/expiry; no parent login yet |
| CSV on the API; PDF via browser print | Teachers get Excel-friendly files without a PDF dependency | Layout of “Save as PDF” depends on the browser print engine |
| Split deploy (Vercel + Render + Neon) | Matches each piece’s strengths; free tiers for a portfolio demo | Cross-origin cookies need SameSite=None; Render free tier cold-starts |
| Typed fields on one Task / TaskStatus | Weekly tests and holiday parts reuse the same tables | App validation must stay strict per type |

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
