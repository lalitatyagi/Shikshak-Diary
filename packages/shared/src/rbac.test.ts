import { describe, expect, it } from "vitest";
import {
  canCreateClass,
  canManageParentLinks,
  canManageRoster,
  canManageSchool,
  canTeachClass,
  isTeacherRole,
} from "./rbac.js";

describe("rbac capabilities", () => {
  it("keeps parents out of teacher capabilities", () => {
    expect(isTeacherRole("PARENT")).toBe(false);
    expect(canTeachClass("PARENT")).toBe(false);
    expect(canManageRoster("PARENT")).toBe(false);
    expect(canManageParentLinks("PARENT")).toBe(false);
    expect(canManageSchool("PARENT")).toBe(false);
  });

  it("lets subject teachers teach but not manage roster", () => {
    expect(canTeachClass("TEACHER")).toBe(true);
    expect(canCreateClass("TEACHER")).toBe(false);
    expect(canManageRoster("TEACHER")).toBe(false);
    expect(canManageParentLinks("TEACHER")).toBe(false);
  });

  it("lets class teachers manage roster and parent links", () => {
    expect(canManageRoster("CLASS_TEACHER")).toBe(true);
    expect(canManageParentLinks("CLASS_TEACHER")).toBe(true);
    expect(canCreateClass("CLASS_TEACHER")).toBe(false);
    expect(canManageSchool("CLASS_TEACHER")).toBe(false);
  });

  it("gives admins school + roster control", () => {
    expect(canManageSchool("ADMIN")).toBe(true);
    expect(canCreateClass("ADMIN")).toBe(true);
    expect(canManageRoster("ADMIN")).toBe(true);
    expect(canTeachClass("ADMIN")).toBe(true);
  });
});
