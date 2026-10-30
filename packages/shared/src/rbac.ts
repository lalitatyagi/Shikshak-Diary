import type { Role } from "./enums.js";

/** Roles that may use the teacher web app APIs at all. */
export const teacherRoles = ["TEACHER", "CLASS_TEACHER", "ADMIN"] as const;

/** Class roster + parent-share ownership (not every subject teacher). */
export const classManagerRoles = ["CLASS_TEACHER", "ADMIN"] as const;

export function isTeacherRole(role: Role): boolean {
  return (teacherRoles as readonly string[]).includes(role);
}

export function canManageSchool(role: Role): boolean {
  return role === "ADMIN";
}

/** Create a class. Only a school admin, not a teacher. */
export function canCreateClass(role: Role): boolean {
  return role === "ADMIN";
}

/** CSV import / roster edits — class teacher or admin. */
export function canManageRoster(role: Role): boolean {
  return (classManagerRoles as readonly string[]).includes(role);
}

/** Create / revoke parent share links. */
export function canManageParentLinks(role: Role): boolean {
  return canManageRoster(role);
}

/** Tick grid, tasks, reports, defaulters (still gated by class assignment). */
export function canTeachClass(role: Role): boolean {
  return isTeacherRole(role);
}

export type TeacherRole = (typeof teacherRoles)[number];
export type ClassManagerRole = (typeof classManagerRoles)[number];
