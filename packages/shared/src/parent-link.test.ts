import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARENT_LINK_TTL_DAYS,
  createParentLinkBodySchema,
  parentLinkCreatedSchema,
  parentLinkStatusSchema,
} from "./parent-link.js";

describe("createParentLinkBodySchema", () => {
  it("defaults expiresInDays", () => {
    expect(createParentLinkBodySchema.parse({})).toEqual({
      expiresInDays: DEFAULT_PARENT_LINK_TTL_DAYS,
    });
  });

  it("rejects out-of-range TTL", () => {
    expect(
      createParentLinkBodySchema.safeParse({ expiresInDays: 0 }).success,
    ).toBe(false);
    expect(
      createParentLinkBodySchema.safeParse({ expiresInDays: 366 }).success,
    ).toBe(false);
  });
});

describe("parentLinkCreatedSchema", () => {
  it("requires a long token and path", () => {
    const parsed = parentLinkCreatedSchema.parse({
      id: "pl1",
      expiresAt: "2026-12-31T00:00:00.000Z",
      createdAt: "2026-10-10T00:00:00.000Z",
      revokedAt: null,
      active: true,
      token: "a".repeat(32),
      path: "/p/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(parsed.active).toBe(true);
    expect(parsed.path.startsWith("/p/")).toBe(true);
  });
});

describe("parentLinkStatusSchema", () => {
  it("allows null link", () => {
    expect(parentLinkStatusSchema.parse({ link: null })).toEqual({
      link: null,
    });
  });
});
