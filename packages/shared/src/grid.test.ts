import { describe, expect, it } from "vitest";
import {
  bulkCompleteResultSchema,
  classGridSchema,
  cycleStatusBodySchema,
  taskStatusSchema,
  updateStatusBodySchema,
} from "./grid.js";

describe("grid schemas", () => {
  it("parses a tick-grid payload", () => {
    const grid = classGridSchema.parse({
      class: { id: "c1", name: "8-B", academicYear: "2025-26" },
      defaultSubjectId: "sub1",
      students: [
        {
          id: "s1",
          schoolId: "sch1",
          name: "Aarav Sharma",
          rollNumber: 1,
          parentContact: null,
        },
      ],
      tasks: [
        {
          id: "t1",
          title: "Exercise 1.1",
          type: "DAILY_HOMEWORK",
          assignedOn: "2026-10-03",
          dueOn: "2026-10-03",
          maxMarks: null,
          totalParts: null,
        },
      ],
      statuses: [
        {
          id: "st1",
          taskId: "t1",
          studentId: "s1",
          status: "PENDING",
          version: 1,
        },
      ],
    });
    expect(grid.tasks).toHaveLength(1);
    expect(grid.statuses[0]?.status).toBe("PENDING");
  });

  it("validates cycle and update bodies", () => {
    expect(cycleStatusBodySchema.parse({ version: 2 })).toEqual({ version: 2 });
    expect(
      updateStatusBodySchema.parse({
        status: "DONE",
        version: 1,
        marks: null,
      }),
    ).toMatchObject({ status: "DONE", version: 1 });
    expect(
      taskStatusSchema.parse({
        id: "st1",
        taskId: "t1",
        studentId: "s1",
        status: "CHECKED",
        version: 3,
        remark: "neat",
      }).remark,
    ).toBe("neat");
    expect(
      bulkCompleteResultSchema.parse({
        taskId: "t1",
        status: "DONE",
        updated: 40,
      }).updated,
    ).toBe(40);
  });
});
