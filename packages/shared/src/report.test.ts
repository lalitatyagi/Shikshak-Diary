import { describe, expect, it } from "vitest";
import {
  DEFAULT_REPORT_DAYS,
  studentReportQuerySchema,
  studentReportSchema,
} from "./report.js";

describe("studentReportQuerySchema", () => {
  it("defaults days", () => {
    expect(studentReportQuerySchema.parse({})).toEqual({
      days: DEFAULT_REPORT_DAYS,
    });
  });

  it("rejects out-of-range days", () => {
    expect(studentReportQuerySchema.safeParse({ days: 0 }).success).toBe(false);
    expect(studentReportQuerySchema.safeParse({ days: 366 }).success).toBe(
      false,
    );
  });
});

describe("studentReportSchema", () => {
  it("accepts a summary with optional average", () => {
    const parsed = studentReportSchema.parse({
      classId: "c1",
      days: 30,
      fromDate: "2026-09-11",
      toDate: "2026-10-10",
      student: {
        id: "s1",
        schoolId: "sch1",
        name: "Aarav",
        rollNumber: 1,
        parentContact: null,
      },
      summary: {
        totalTasks: 2,
        doneCount: 1,
        notDoneCount: 1,
        incompleteCount: 0,
        absentCount: 0,
        pendingCount: 0,
        weeklyTestCount: 1,
        weeklyTestAvgMarks: 16.5,
      },
      tasks: [
        {
          taskId: "t1",
          title: "Unit test",
          type: "WEEKLY_TEST",
          assignedOn: "2026-10-03",
          dueOn: "2026-10-03",
          maxMarks: 20,
          totalParts: null,
          status: "DONE",
          marks: 16,
          partsDone: null,
          remark: null,
        },
      ],
    });
    expect(parsed.summary.weeklyTestAvgMarks).toBe(16.5);
  });
});
