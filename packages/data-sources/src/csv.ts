export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values.map((value) => value.replace(/^"(.*)"$/s, "$1").trim());
};

export const parseCsv = (text: string): ParsedCsv => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const [headerLine, ...rowLines] = lines;
  if (!headerLine) {
    return { headers: [], rows: [] };
  }

  return {
    headers: parseCsvLine(headerLine),
    rows: rowLines.map(parseCsvLine),
  };
};

const normalizeHeader = (header: string): string =>
  header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const rowsToObjects = (
  parsed: ParsedCsv,
): Array<Record<string, string>> => {
  const normalizedHeaders = parsed.headers.map(normalizeHeader);

  return parsed.rows.map((row) => {
    const record: Record<string, string> = {};
    normalizedHeaders.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    return record;
  });
};

export const readCsvTextFromFile = async (path: string): Promise<string> => {
  const { readFile } = await import("node:fs/promises");
  return readFile(path, "utf8");
};
