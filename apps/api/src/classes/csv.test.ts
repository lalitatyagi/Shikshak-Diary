import { describe, expect, it } from "vitest";
import { parseCsv, parseStudentCsv } from "./csv.js";

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

  it("requires rollNumber and name headers", () => {
    const result = parseStudentCsv("id,fullname\n1,A\n");
    expect(result.rows).toEqual([]);
    expect(result.errors[0]?.message).toMatch(/rollNumber/i);
  });
});
