import { describe, expect, it } from "vitest";
import {
  csvCell,
  defaultersToCsv,
  studentReportToCsv,
} from "./export-csv.js";

describe("csvCell", () => {
  it("quotes commas and doubles quotes", () => {
    expect(csvCell('say "hi", please')).toBe('"say ""hi"", please"');
  });

  it("leaves plain values alone", () => {
    expect(csvCell("DONE")).toBe("DONE");
    expect(csvCell(17)).toBe("17");
    expect(csvCell(null)).toBe("");
  });
});

describe("studentReportToCsv", () => {
  it("emits a header and one task row", () => {
    const csv = studentReportToCsv({
      classId: "c1",
      days: 30,
      fromDate: "2026-09-11",
      toDate: "2026-10-10",
      student: {
        id: "s1",
        schoolId: "sch1",
        name: "Aarav, Sharma",
        rollNumber: 1,
        parentContact: null,
      },
      summary: {
        totalTasks: 1,
        doneCount: 1,
        notDoneCount: 0,
        incompleteCount: 0,
        absentCount: 0,
        pendingCount: 0,
        weeklyTestCount: 0,
        weeklyTestAvgMarks: null,
      },
      tasks: [
        {
          taskId: "t1",
          title: 'Ch. 1 "Intro"',
          type: "DAILY_HOMEWORK",
          assignedOn: "2026-10-03",
          dueOn: "2026-10-03",
          maxMarks: null,
          totalParts: null,
          status: "DONE",
          marks: null,
          partsDone: null,
          remark: null,
        },
      ],
    });

    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toContain("rollNumber,name,");
    expect(lines[1]).toContain('"Aarav, Sharma"');
    expect(lines[1]).toContain('"Ch. 1 ""Intro"""');
    expect(lines[1]).toContain("DONE");
  });
});

describe("defaultersToCsv", () => {
  it("joins task titles", () => {
    const csv = defaultersToCsv({
      classId: "c1",
      days: 7,
      fromDate: "2026-10-04",
      toDate: "2026-10-10",
      minMisses: 2,
      defaulters: [
        {
          student: {
            id: "s1",
            schoolId: "sch1",
            name: "Riya",
            rollNumber: 5,
            parentContact: null,
          },
          missCount: 2,
          taskTitles: ["HW A", "HW B"],
        },
      ],
    });
    expect(csv).toContain("5,Riya,2,HW A; HW B,");
  });
});
