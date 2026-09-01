const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function isoDate(yyyymmdd: string): string | undefined {
  if (!/^\d{8}$/.test(yyyymmdd)) return undefined;
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6));
  const day = Number(yyyymmdd.slice(6, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function formatLabel(capturedAt: string, edition?: string): string {
  const [year, month, day] = capturedAt.split("-").map(Number);
  const dateLabel =
    year && month && day
      ? `${day} ${MONTHS[month - 1]} ${year}`
      : capturedAt;
  return edition ? `${dateLabel} (edition ${edition})` : dateLabel;
}

/**
 * Parse archive filename stems:
 * - 20211020000000-2021-11  → 2021-10-20, edition 2021-11
 * - 20231124084934_2023-07  → 2023-11-24, edition 2023-07
 * - 20250826_1756190350     → 2025-08-26
 */
export function parseFilename(stem: string): {
  capturedAt: string;
  edition?: string;
  label: string;
} {
  let capturedAt: string | undefined;
  let edition: string | undefined;

  const yyyymmddUnix = stem.match(/^(\d{8})_\d+$/);
  const compactWithEdition = stem.match(/^(\d{8})\d*[-_](\d{4}-\d{1,2})$/);
  const leadingDate = stem.match(/^(\d{8})/);

  if (yyyymmddUnix) {
    capturedAt = isoDate(yyyymmddUnix[1]);
  } else if (compactWithEdition) {
    capturedAt = isoDate(compactWithEdition[1]);
    edition = compactWithEdition[2];
  } else if (leadingDate) {
    capturedAt = isoDate(leadingDate[1]);
  }

  if (!capturedAt) {
    capturedAt = "1970-01-01";
  }

  return { capturedAt, edition, label: formatLabel(capturedAt, edition) };
}
