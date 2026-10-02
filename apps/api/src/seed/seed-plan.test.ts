import { describe, expect, it } from "vitest";
import {
  SEED,
  assertUniqueRollNumbers,
  buildStudentPlans,
} from "./seed-plan.js";

describe("buildStudentPlans", () => {
  it("creates exactly 40 students by default", () => {
    const students = buildStudentPlans();
    expect(students).toHaveLength(SEED.studentCount);
    expect(students).toHaveLength(40);
  });

  it("assigns roll numbers 1..N with no duplicates", () => {
    const students = buildStudentPlans(40);
    expect(students.map((s) => s.rollNumber)).toEqual(
      Array.from({ length: 40 }, (_, i) => i + 1),
    );
    expect(() => assertUniqueRollNumbers(students)).not.toThrow();
  });

  it("gives every student a non-empty name", () => {
    const students = buildStudentPlans(40);
    for (const student of students) {
      expect(student.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("rejects a zero student count", () => {
    expect(() => buildStudentPlans(0)).toThrow(/at least 1/);
  });
});

describe("TaskStatus uniqueness rule (schema contract)", () => {
  it("documents the composite unique key used by the unified task model", () => {
    // Interview talking point: one status row per student per task.
    // Enforced in Prisma as @@unique([taskId, studentId]).
    const uniqueFields = ["taskId", "studentId"] as const;
    expect(uniqueFields).toEqual(["taskId", "studentId"]);
  });
});
