import { describe, expect, it } from "vitest";
import {
  csvCell,
  defaultersToCsv,
  friendlyTaskResult,
  studentReportCsvFilename,
  studentReportToCsv,
} from "./export-csv.js";

describe("csvCell", () => {
  it("quotes commas and doubles quotes", () => {
    expect(csvCell('say "hi", please')).toBe('"say ""hi"", please"');
  });

  it("leaves plain values alone", () => {
    expect(csvCell("Done")).toBe("Done");
    expect(csvCell(17)).toBe("17");
    expect(csvCell(null)).toBe("");
  });
});

describe("friendlyTaskResult", () => {
  it("formats weekly test marks in plain English", () => {
    expect(
      friendlyTaskResult({
        taskId: "t1",
        title: "Chapter 7",
        type: "WEEKLY_TEST",
        assignedOn: "2026-10-03",
        dueOn: "2026-10-03",
        maxMarks: 50,
        totalParts: null,
        status: "DONE",
        marks: 40,
        partsDone: null,
        remark: null,
      }),
    ).toBe("Scored 40 out of 50");
  });
});

describe("studentReportToCsv", () => {
  it("uses parent-friendly headers and labels", () => {
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
        totalTasks: 2,
        doneCount: 2,
        notDoneCount: 0,
        incompleteCount: 0,
        absentCount: 0,
        pendingCount: 0,
        weeklyTestCount: 1,
        weeklyTestAvgMarks: 40,
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
        {
          taskId: "t2",
          title: "Chapter 7",
          type: "WEEKLY_TEST",
          assignedOn: "2026-10-03",
          dueOn: "2026-10-03",
          maxMarks: 50,
          totalParts: null,
          status: "DONE",
          marks: 40,
          partsDone: null,
          remark: "Good work",
        },
      ],
    });

    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe(
      "Roll no.,Student name,Work,Type,Given on,Due on,Result,Teacher note",
    );
    expect(lines[1]).toContain('"Aarav, Sharma"');
    expect(lines[1]).toContain("Homework");
    expect(lines[1]).toContain("Done");
    expect(lines[2]).toContain("Weekly test");
    expect(lines[2]).toContain("Scored 40 out of 50");
    expect(lines[2]).toContain("Good work");
  });

  it("builds a readable filename from the student name", () => {
    expect(
      studentReportCsvFilename({
        classId: "c1",
        days: 7,
        fromDate: "2026-10-01",
        toDate: "2026-10-10",
        student: {
          id: "s1",
          schoolId: "sch1",
          name: "Diya Singh",
          rollNumber: 4,
          parentContact: null,
        },
        summary: {
          totalTasks: 0,
          doneCount: 0,
          notDoneCount: 0,
          incompleteCount: 0,
          absentCount: 0,
          pendingCount: 0,
          weeklyTestCount: 0,
          weeklyTestAvgMarks: null,
        },
        tasks: [],
      }),
    ).toBe("Diya-Singh-report-2026-10-01_to_2026-10-10.csv");
  });
});

describe("defaultersToCsv", () => {
  it("uses plain headers and joins task titles", () => {
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
    expect(csv).toContain("Roll no.,Student name,Misses,Missed work");
    expect(csv).toContain("5,Riya,2,HW A; HW B,");
  });
});
