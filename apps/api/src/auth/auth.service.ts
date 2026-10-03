import { Prisma, type User } from "@prisma/client";
import {
  authUserSchema,
  type AuthUser,
  type LoginBody,
  type RegisterBody,
} from "@classroom-tracker/shared";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "./password.js";
import { signAccessToken, signRefreshToken } from "./tokens.js";

export class AuthError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function toAuthUser(user: User): AuthUser {
  return authUserSchema.parse({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
}

export async function registerUser(input: RegisterBody): Promise<{
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}> {
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash,
        role: "TEACHER",
      },
    });

    return issueSession(user);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AuthError("Email is already registered", 409);
    }
    throw error;
  }
}

export async function loginUser(input: LoginBody): Promise<{
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}> {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (!user) {
    throw new AuthError("Invalid email or password", 401);
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new AuthError("Invalid email or password", 401);
  }

  return issueSession(user);
}

export async function refreshSession(userId: string): Promise<{
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AuthError("Session is no longer valid", 401);
  }
  return issueSession(user);
}

export async function getUserById(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AuthError("User not found", 404);
  }
  return toAuthUser(user);
}

async function issueSession(user: User): Promise<{
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}> {
  const authUser = toAuthUser(user);
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    }),
    signRefreshToken(user.id),
  ]);

  return { user: authUser, accessToken, refreshToken };
}
