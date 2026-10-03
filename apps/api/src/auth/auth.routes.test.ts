import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Role } from "@prisma/client";
import { loadEnv } from "../load-env.js";
import { buildApp } from "../app.js";
import { prisma } from "../db.js";
import { hashPassword } from "./password.js";
import { REFRESH_COOKIE_NAME } from "./tokens.js";

loadEnv();

function uniqueEmail(label: string): string {
  return `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@test.local`;
}

function cookieHeader(setCookie: string | string[] | undefined): string {
  const values = !setCookie
    ? []
    : Array.isArray(setCookie)
      ? setCookie
      : [setCookie];
  return values.map((entry) => entry.split(";")[0]).join("; ");
}

describe("auth routes", () => {
  let app: FastifyInstance;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    if (createdEmails.length > 0) {
      await prisma.user.deleteMany({
        where: { email: { in: createdEmails } },
      });
    }
    await app.close();
    await prisma.$disconnect();
  });

  it("registers a teacher and returns an access token", async () => {
    const email = uniqueEmail("register");
    createdEmails.push(email);

    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        name: "New Teacher",
        email,
        password: "Password123!",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      accessToken: string;
      user: { email: string; role: string; name: string };
    };
    expect(body.user.email).toBe(email.toLowerCase());
    expect(body.user.role).toBe("TEACHER");
    expect(body.accessToken.length).toBeGreaterThan(20);
    expect(response.cookies.some((c) => c.name === REFRESH_COOKIE_NAME)).toBe(
      true,
    );
  });

  it("ignores role in the register body and always creates TEACHER", async () => {
    const email = uniqueEmail("escalate");
    createdEmails.push(email);

    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        name: "Would-Be Admin",
        email,
        password: "Password123!",
        role: "ADMIN",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { user: { role: string; email: string } };
    expect(body.user.role).toBe("TEACHER");

    const stored = await prisma.user.findUniqueOrThrow({
      where: { email: email.toLowerCase() },
    });
    expect(stored.role).toBe(Role.TEACHER);
  });

  it("rejects duplicate email registration", async () => {
    const email = uniqueEmail("dup");
    createdEmails.push(email);

    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        name: "First",
        email,
        password: "Password123!",
      },
    });

    const second = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        name: "Second",
        email,
        password: "Password123!",
      },
    });

    expect(second.statusCode).toBe(409);
  });

  it("logs in with email/password and refreshes via cookie", async () => {
    const email = uniqueEmail("login");
    createdEmails.push(email);
    const password = "Password123!";

    await prisma.user.create({
      data: {
        name: "Login Teacher",
        email,
        passwordHash: await hashPassword(password),
        role: Role.TEACHER,
      },
    });

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });

    expect(login.statusCode).toBe(200);
    const loginBody = login.json() as { accessToken: string };
    expect(loginBody.accessToken).toBeTruthy();

    const refresh = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      headers: {
        cookie: cookieHeader(login.headers["set-cookie"]),
      },
    });

    expect(refresh.statusCode).toBe(200);
    const refreshBody = refresh.json() as { accessToken: string };
    expect(refreshBody.accessToken).toBeTruthy();
  });

  it("returns 401 for wrong password", async () => {
    const email = uniqueEmail("badpass");
    createdEmails.push(email);

    await prisma.user.create({
      data: {
        name: "Bad Pass",
        email,
        passwordHash: await hashPassword("Password123!"),
        role: Role.TEACHER,
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: "wrong-password" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("protects /auth/me and role-checks teacher route", async () => {
    const email = uniqueEmail("me");
    createdEmails.push(email);

    const register = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        name: "Me Teacher",
        email,
        password: "Password123!",
      },
    });
    const { accessToken } = register.json() as { accessToken: string };

    const unauthorized = await app.inject({
      method: "GET",
      url: "/auth/me",
    });
    expect(unauthorized.statusCode).toBe(401);

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      email: email.toLowerCase(),
      role: "TEACHER",
    });

    const teacherCheck = await app.inject({
      method: "GET",
      url: "/auth/teacher-check",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(teacherCheck.statusCode).toBe(200);
  });

  it("clears refresh cookie on logout", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/logout",
    });

    expect(response.statusCode).toBe(204);
    const cleared = response.cookies.find(
      (c) => c.name === REFRESH_COOKIE_NAME,
    );
    expect(cleared).toBeTruthy();
    expect(cleared?.value).toBe("");
  });

  it("returns 403 when role is not allowed", async () => {
    const email = uniqueEmail("parent");
    createdEmails.push(email);

    await prisma.user.create({
      data: {
        name: "Parent User",
        email,
        passwordHash: await hashPassword("Password123!"),
        role: Role.PARENT,
      },
    });

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: "Password123!" },
    });
    const { accessToken } = login.json() as { accessToken: string };

    const response = await app.inject({
      method: "GET",
      url: "/auth/teacher-check",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(403);
  });
});
