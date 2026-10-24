import { describe, expect, it } from "vitest";
import { MAX_STUDENT_CSV_ROWS, parseCsv, parseStudentCsv } from "./csv.js";

describe("parseCsv", () => {
  it("parses simple comma-separated rows", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("supports quoted commas", () => {
    expect(parseCsv('name,note\n"Sharma, A",ok\n')).toEqual([
      ["name", "note"],
      ["Sharma, A", "ok"],
    ]);
  });

  it("handles Excel CSV quirks: BOM, quoted commas, CRLF, trailing blank lines", () => {
    const bom = "\uFEFF";
    const excelCsv =
      bom +
      [
        "rollNumber,name,parentContact",
        '1,"Sharma, Aarav",',
        "2,Ananya Verma,9800000002",
        "",
        "",
      ].join("\r\n") +
      "\r\n";

    const table = parseCsv(excelCsv);
    expect(table[0]?.[0]).toBe("rollNumber");
    expect(table).toEqual([
      ["rollNumber", "name", "parentContact"],
      ["1", "Sharma, Aarav", ""],
      ["2", "Ananya Verma", "9800000002"],
    ]);

    const parsed = parseStudentCsv(excelCsv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      {
        row: 2,
        rollNumber: 1,
        name: "Sharma, Aarav",
        parentContact: null,
      },
      {
        row: 3,
        rollNumber: 2,
        name: "Ananya Verma",
        parentContact: "9800000002",
      },
    ]);
  });
});

describe("parseStudentCsv", () => {
  it("accepts valid rows and optional parentContact", () => {
    const csv = [
      "rollNumber,name,parentContact",
      "1,Aarav Sharma,",
      "2,Ananya Verma,9800000002",
    ].join("\n");

    const result = parseStudentCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      {
        row: 2,
        rollNumber: 1,
        name: "Aarav Sharma",
        parentContact: null,
      },
      {
        row: 3,
        rollNumber: 2,
        name: "Ananya Verma",
        parentContact: "9800000002",
      },
    ]);
  });

  it("reports per-row errors and still returns valid rows", () => {
    const csv = [
      "rollNumber,name,parentContact",
      "1,Valid Student,",
      "x,Bad Roll,",
      ",Missing Name,",
      "1,Duplicate Roll,",
    ].join("\n");

    const result = parseStudentCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.name).toBe("Valid Student");
    expect(result.errors.map((e) => e.row).sort()).toEqual([3, 4, 5]);
  });

  it("rejects a file with more than the row cap", () => {
    const lines = ["rollNumber,name"];
    for (let roll = 1; roll <= MAX_STUDENT_CSV_ROWS + 1; roll += 1) {
      lines.push(`${roll},Student ${roll}`);
    }
    const result = parseStudentCsv(lines.join("\n"));
    expect(result.rows).toEqual([]);
    expect(result.errors[0]?.message).toMatch(/200/);
  });

  it("keeps a newline that sits inside a quoted name", () => {
    const result = parseStudentCsv('rollNumber,name\n1,"Aarav\nSharma"\n');
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      {
        row: 2,
        rollNumber: 1,
        name: "Aarav\nSharma",
        parentContact: null,
      },
    ]);
  });

  it("rejects scientific notation such as 1e2", () => {
    const result = parseStudentCsv("rollNumber,name\n1e2,Aarav\n");
    expect(result.rows).toEqual([]);
    expect(result.errors[0]?.message).toMatch(/positive integer/i);
  });

  it("requires rollNumber and name headers when a header row is present", () => {
    const result = parseStudentCsv("id,fullname\n1,A\n");
    expect(result.rows).toEqual([]);
    expect(result.errors[0]?.message).toMatch(/rollNumber/i);
  });

  it("accepts headerless paste: roll, name, phone", () => {
    const result = parseStudentCsv("1, Anushka, 958647826\n");
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      {
        row: 1,
        rollNumber: 1,
        name: "Anushka",
        parentContact: "958647826",
      },
    ]);
  });

  it("accepts roll / phone header aliases", () => {
    const result = parseStudentCsv("roll,name,phone\n2,Priya,9800000001\n");
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      {
        row: 2,
        rollNumber: 2,
        name: "Priya",
        parentContact: "9800000001",
      },
    ]);
  });
});
