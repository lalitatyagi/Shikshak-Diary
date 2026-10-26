export type ParsedCsvRow = {
  /** 1-based data row number (header is row 1). */
  row: number;
  rollNumber: number;
  name: string;
  parentContact: string | null;
};

export type CsvRowIssue = {
  row: number;
  message: string;
};

export type CsvParseResult = {
  rows: ParsedCsvRow[];
  errors: CsvRowIssue[];
};

/** A class is about 40 students. This cap keeps one import inside a single transaction. */
export const MAX_STUDENT_CSV_ROWS = 200;

const ROLL_ALIASES = new Set([
  "rollnumber",
  "roll",
  "rollno",
  "rollnum",
  "roll#",
]);
const NAME_ALIASES = new Set(["name", "student", "studentname"]);
const CONTACT_ALIASES = new Set([
  "parentcontact",
  "phone",
  "mobile",
  "contact",
  "parentphone",
]);

function findHeaderIndex(header: string[], aliases: Set<string>): number {
  return header.findIndex((cell) => aliases.has(cell));
}

/** First row is data when col0 looks like a roll number (teachers often paste without headers). */
function looksLikeHeaderlessData(firstRow: string[]): boolean {
  const first = (firstRow[0] ?? "").trim();
  return /^[1-9]\d*$/.test(first);
}

/**
 * Minimal CSV parser for student import.
 * Handles UTF-8 BOM (Excel), quoted fields with commas, CRLF/LF, trailing blanks.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    // Ignore blank / trailing empty lines (common in Excel exports)
    if (row.every((cell) => cell.trim() === "")) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  // Strip UTF-8 BOM that Excel adds at the start of .csv files
  const input = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!;
    const next = input[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        // Keep \r/\n inside quotes (unusual but valid)
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\r") {
      // Windows CRLF (\r\n) or lone \r — treat as end of row
      if (next === "\n") {
        i += 1;
      }
      pushField();
      pushRow();
    } else if (ch === "\n") {
      pushField();
      pushRow();
    } else {
      field += ch;
    }
  }

  pushField();
  if (row.length > 0 && !row.every((cell) => cell.trim() === "")) {
    pushRow();
  }

  return rows;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "");
}

/**
 * Validates CSV text into student rows + per-row errors.
 * Does not touch the database (duplicate-in-school checks happen later).
 *
 * Accepts either a header row (`rollNumber,name,parentContact` — aliases ok)
 * or headerless paste (`1,Anushka,958647826` → roll, name, optional phone).
 */
export function parseStudentCsv(csvText: string): CsvParseResult {
  const table = parseCsv(csvText);
  if (table.length === 0) {
    return {
      rows: [],
      errors: [{ row: 1, message: "CSV is empty" }],
    };
  }

  const headerless = looksLikeHeaderlessData(table[0]!);
  let rollIdx: number;
  let nameIdx: number;
  let contactIdx: number;
  let dataStart: number;

  if (headerless) {
    // Positional: roll, name, optional parentContact
    rollIdx = 0;
    nameIdx = 1;
    contactIdx = 2;
    dataStart = 0;
  } else {
    const header = table[0]!.map(normalizeHeader);
    rollIdx = findHeaderIndex(header, ROLL_ALIASES);
    nameIdx = findHeaderIndex(header, NAME_ALIASES);
    contactIdx = findHeaderIndex(header, CONTACT_ALIASES);

    if (rollIdx < 0) {
      return {
        rows: [],
        errors: [
          {
            row: 1,
            message:
              'Missing required column "rollNumber" (or paste rows as roll,name,phone with no header)',
          },
        ],
      };
    }
    if (nameIdx < 0) {
      return {
        rows: [],
        errors: [
          {
            row: 1,
            message: 'Missing required column "name"',
          },
        ],
      };
    }
    dataStart = 1;
  }

  let dataRows = 0;
  for (let i = dataStart; i < table.length; i += 1) {
    const line = table[i]!;
    if (!line.every((cell) => cell.trim() === "")) {
      dataRows += 1;
    }
  }
  if (dataRows > MAX_STUDENT_CSV_ROWS) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message: `CSV is limited to ${MAX_STUDENT_CSV_ROWS} student rows`,
        },
      ],
    };
  }

  const rows: ParsedCsvRow[] = [];
  const errors: CsvRowIssue[] = [];
  const seenRolls = new Map<number, number>();

  for (let i = dataStart; i < table.length; i += 1) {
    const line = table[i]!;
    // 1-based file line (header counts as line 1 when present)
    const rowNumber = i + 1;

    // Skip blank lines
    if (line.every((cell) => cell.trim() === "")) {
      continue;
    }

    const rollRaw = (line[rollIdx] ?? "").trim();
    const nameRaw = (line[nameIdx] ?? "").trim();
    const contactRaw = contactIdx >= 0 ? (line[contactIdx] ?? "").trim() : "";

    const rowErrors: string[] = [];

    let rollNumber = Number.NaN;
    if (!/^[1-9]\d*$/.test(rollRaw)) {
      rowErrors.push("rollNumber must be a positive integer");
    } else {
      rollNumber = Number(rollRaw);
    }

    if (!nameRaw) {
      rowErrors.push("name is required");
    } else if (nameRaw.length > 100) {
      rowErrors.push("name must be at most 100 characters");
    }

    if (contactRaw.length > 30) {
      rowErrors.push("parentContact must be at most 30 characters");
    }

    if (rowErrors.length === 0 && seenRolls.has(rollNumber)) {
      rowErrors.push(
        `Duplicate rollNumber ${rollNumber} (also on row ${seenRolls.get(rollNumber)})`,
      );
    }

    if (rowErrors.length > 0) {
      for (const message of rowErrors) {
        errors.push({ row: rowNumber, message });
      }
      continue;
    }

    seenRolls.set(rollNumber, rowNumber);
    rows.push({
      row: rowNumber,
      rollNumber,
      name: nameRaw,
      parentContact: contactRaw.length > 0 ? contactRaw : null,
    });
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push({
      row: 1,
      message: headerless
        ? "CSV has no student rows"
        : "CSV has a header but no data rows",
    });
  }

  return { rows, errors };
}
