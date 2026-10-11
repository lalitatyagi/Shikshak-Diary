import { z } from "zod";

/** Default lifetime when a teacher creates a parent share link. */
export const DEFAULT_PARENT_LINK_TTL_DAYS = 90;

export const createParentLinkBodySchema = z.object({
  expiresInDays: z.coerce
    .number()
    .int()
    .min(1)
    .max(365)
    .default(DEFAULT_PARENT_LINK_TTL_DAYS),
});

/** Metadata visible to the teacher (never includes the raw token). */
export const parentLinkMetaSchema = z.object({
  id: z.string().min(1),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  active: z.boolean(),
});

/** Returned once on create/rotate — includes the raw token for sharing. */
export const parentLinkCreatedSchema = parentLinkMetaSchema.extend({
  token: z.string().min(32),
  /** Web path parents open, e.g. `/p/<token>`. */
  path: z.string().min(1),
});

export const parentLinkStatusSchema = z.object({
  link: parentLinkMetaSchema.nullable(),
});

export type CreateParentLinkBody = z.infer<typeof createParentLinkBodySchema>;
export type ParentLinkMeta = z.infer<typeof parentLinkMetaSchema>;
export type ParentLinkCreated = z.infer<typeof parentLinkCreatedSchema>;
export type ParentLinkStatus = z.infer<typeof parentLinkStatusSchema>;
