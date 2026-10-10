# Pre-interview code review

Scope: `apps/api`, `apps/web`, `packages/shared`, CI. Findings below were checked against the code, then fixed where they were real.

**Already good:** `.env` is gitignored and never in history; the only raw SQL (`defaulters.service.ts`) is parameterized via `Prisma.sql`; class-scoped routes use `assertCanAccessClass`; register ignores a client-supplied role.

## High

1. **Fixed** in `78f1996`. Any registered user could see every school when they had no assignment, then overwrite a student by roll number. Schools are now created by an admin and teachers join only by invite (`SchoolMember`). Import refuses to update a student enrolled in a class the caller cannot access, and that roll is a per-row error.
2. **Fixed** in `2241fb9`. `apiFetch` shares one refresh on 401, retries the request once, and on refresh failure clears the access token and sends the user to `/login`.
3. **Fixed** in `9598d97`. Refresh sessions are stored as a hash (`RefreshToken`). Each refresh rotates the token and revokes the presented one. Logout revokes it. Cookie `maxAge` follows `JWT_REFRESH_TTL`.

## Medium

4. **Fixed** in `56cba74`. `@fastify/rate-limit` (login/register budget, plus a global cap) and `@fastify/helmet`. bcrypt is 12 rounds. Unknown emails still run a dummy compare. Duplicate registration returns a generic 400.
5. **Fixed** in `56cba74`. CORS uses the `CORS_ORIGINS` allowlist and does not reflect an arbitrary origin.
6. **Fixed** in `56cba74`. Secrets shorter than 32 characters or starting with `change-me` are rejected. `.env.example` leaves them blank.
7. **Fixed** in `56cba74`. `loadEnv` uses `override: false`, so a real process env wins over `apps/api/.env`.
8. **Fixed** in `aafe100`. Imports cap at 200 rows, lock the school and class, and turn a unique-constraint clash into a per-row error instead of a 500.
9. **Fixed** in `aafe100`. Task creation reads enrollments inside the class lock. Import creates pending rows for open tasks inside the same transaction.
10. **Fixed** in `aafe100`. The grid subject is ordered (`subjectId`, then name and id for an admin with no assignment). An admin is no longer blocked when the class has no teacher assignment.
11. **Fixed** in `2241fb9`. A failed tick or mark-all shows an alert and refetches the grid.

## Low / quality

12. **Fixed** in `9598d97`. Access and refresh tokens are pinned to HS256, issuer, and audience. Role is parsed. A deleted user's access token is rejected on the next request.
13. **Fixed** in `0927af3`. Status updates, mark-all, and student imports write `AuditLog` rows. The model stays.
14. **Fixed** in `0927af3`. One error handler maps `HttpError` and `AuthError`. `teacherRoles` lives in one place. `fastify-type-provider-zod` was not added; the handler covers the failure mode without a new dependency. Route `params` casts remain.
15. **Fixed** in `0927af3`. `/auth/teacher-check` allows the same teacher roles as the other routes, including `ADMIN`.
16. **Fixed** in `0927af3`. `/health` runs `SELECT 1` and returns 503 when the database is down. The process closes the server and disconnects Prisma on SIGINT and SIGTERM.
17. **Fixed** in `0927af3`. Roll numbers must match `^[1-9]\d*$`, so `1e2` is a row error.
18. **Fixed** in `0927af3`. Seed throws when `NODE_ENV` is `production`. The README still shows the local demo password and says that seed refuses production.
19. **Fixed** in `0927af3`. CI runs `npm run build` and `npm audit --audit-level=high`. Two moderate Vitest advisories remain; they do not fail that audit level. `npm audit fix --force` would jump Vitest a major version, so it was not applied.

## Test gaps

- User without assignments cannot reach other teachers' students — **Fixed** in `78f1996`.
- Expired, tampered, wrong-secret, and `alg: none` tokens; refresh after the user is deleted; access token used as refresh and the reverse — **Fixed** in `9598d97` and `cd1ff53`.
- Admin create-school path and parent denied on class, task, and status routes — **Fixed** in `cd1ff53` (admin grid was already covered in `aafe100`).
- Concurrent status update on one version returns one 200 and one 409 — **Fixed** in `cd1ff53`.
- Concurrent import, 200-row cap, quoted newline, and `1e2` — **Fixed** in `aafe100`, `0927af3`, and `cd1ff53`.
- Web refresh-on-401 and grid error/queue — **Fixed** in `2241fb9` and `cd1ff53`.
- Defaulters boundary at `toExclusive` — **Fixed** in Step 7 (`feat(defaulters)` commit). Covered by `apps/api/src/defaulters/defaulters.routes.test.ts`.

## Summary

| Group | Findings | Commit | Status |
| --- | --- | --- | --- |
| a | 1 | `78f1996` | Fixed |
| b | 2, 11 | `2241fb9` | Fixed |
| c | 3, 12 | `9598d97` | Fixed |
| d | 4, 5, 6, 7 | `56cba74` | Fixed |
| e | 8, 9, 10 | `aafe100` | Fixed |
| f | 13–19 | `0927af3` | Fixed |
| g | test gaps | `cd1ff53` + Step 7 | Fixed |

New dependencies, both in `56cba74`: `@fastify/helmet` and `@fastify/rate-limit`. They provide response headers and a login budget without a hand-rolled limiter.
