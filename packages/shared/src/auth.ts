import { z } from "zod";
import { roleSchema } from "./enums.js";

export const registerBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
});

export const loginBodySchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128),
});

export const authUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  role: roleSchema,
});

export const authTokensSchema = z.object({
  accessToken: z.string().min(1),
  user: authUserSchema,
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthTokens = z.infer<typeof authTokensSchema>;
