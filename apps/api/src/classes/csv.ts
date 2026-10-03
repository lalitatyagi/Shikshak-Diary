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

const REQUIRED_HEADERS = ["rollnumber", "name"] as const;

/**
 * Minimal CSV parser for student import.
 * Supports commas, optional double-quoted fields, CRLF/LF.
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
    // Ignore trailing empty line
    if (row.length === 1 && row[0] === "" && rows.length > 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

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
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushField();
      pushRow();
    } else if (ch === "\r") {
      // ignore; handle on \n or end
    } else {
      field += ch;
    }
  }

  pushField();
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
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
 */
export function parseStudentCsv(csvText: string): CsvParseResult {
  const table = parseCsv(csvText);
  if (table.length === 0) {
    return {
      rows: [],
      errors: [{ row: 1, message: "CSV is empty" }],
    };
  }

  const header = table[0]!.map(normalizeHeader);
  const rollIdx = header.indexOf("rollnumber");
  const nameIdx = header.indexOf("name");
  const contactIdx = header.indexOf("parentcontact");

  for (const required of REQUIRED_HEADERS) {
    if (!header.includes(required)) {
      return {
        rows: [],
        errors: [
          {
            row: 1,
            message: `Missing required column "${required === "rollnumber" ? "rollNumber" : required}"`,
          },
        ],
      };
    }
  }

  const rows: ParsedCsvRow[] = [];
  const errors: CsvRowIssue[] = [];
  const seenRolls = new Map<number, number>();

  for (let i = 1; i < table.length; i += 1) {
    const line = table[i]!;
    const rowNumber = i + 1; // 1-based including header

    // Skip blank lines
    if (line.every((cell) => cell.trim() === "")) {
      continue;
    }

    const rollRaw = (line[rollIdx] ?? "").trim();
    const nameRaw = (line[nameIdx] ?? "").trim();
    const contactRaw = contactIdx >= 0 ? (line[contactIdx] ?? "").trim() : "";

    const rowErrors: string[] = [];

    const rollNumber = Number(rollRaw);
    if (!rollRaw || !Number.isInteger(rollNumber) || rollNumber < 1) {
      rowErrors.push("rollNumber must be a positive integer");
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
    errors.push({ row: 1, message: "CSV has a header but no data rows" });
  }

  return { rows, errors };
}
