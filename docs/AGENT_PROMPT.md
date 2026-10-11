# Agent prompt: verify and fix `docs/REVIEW.md`

Paste everything below the line into your AI coding agent, run from the repo root.

---

You are a senior engineer fixing a code review on this monorepo (Fastify + Prisma API, React web, shared Zod package). Read `docs/REVIEW.md` first. It lists findings 1-19 plus test gaps, with file:line references.

## Rules
1. **Verify before fixing.** Line numbers may have drifted. For each finding, open the code and confirm it is real. If it is wrong or already fixed, say so and skip it. Do not invent fixes for things you can't reproduce.
2. **Test first for bugs.** For findings 1, 2, 3, 8, 9, 10, 11, write a failing test that demonstrates the problem, then fix it, then confirm it passes.
3. **Work in this order, one commit per finding group:** (a) 1, (b) 2 + 11, (c) 3 + 12, (d) 4 + 5 + 6 + 7, (e) 8 + 9 + 10, (f) 13-19, (g) remaining test gaps.
4. **Gates after every group:** `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`. Do not move on while any fail. Tests need Postgres (`npm run db:up`, `npm run db:migrate`).
5. **Keep changes minimal and match existing style.** No new dependencies unless needed. If you add one (e.g. `@fastify/rate-limit`, `@fastify/helmet`), say why. Schema changes need a new Prisma migration; never edit the existing init migration.
6. **Do not** touch `.env`, commit secrets, force-push, or rewrite history. Never weaken or delete an existing test to make it pass.

## Design decisions
- **Finding 1:** Replace the "no assignments => any school" bootstrap with an explicit rule (for example, admin-created schools plus invite or membership). Import must not update a student who is enrolled in a class the caller cannot access. Roll-number conflicts become per-row errors. Document your choice in the README.
- **Finding 2:** Add a single-flight refresh-on-401 with one retry in `apiFetch`. If the refresh fails, clear the token and send the user to login.
- **Finding 3:** Implement refresh-token rotation with server-side revocation (a hashed token or `jti` table via migration). Logout must invalidate it. Honour `JWT_REFRESH_TTL` for the cookie.
- **Finding 11:** Show a visible error or toast on a failed update, then refetch.

## Output
When finished, update `docs/REVIEW.md` by marking each finding as **Fixed** (with the commit hash), **Not reproducible**, or **Deferred** (with the reason). Finish with a summary table and the final output of the four gates.
