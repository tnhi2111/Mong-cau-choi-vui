/**
 * Birthday "password" matching. This is a playful gate, not authentication.
 *
 * The configured value is DD/MM/YYYY. Accepted inputs:
 *   DDMMYYYY · DD/MM/YYYY · DD-MM-YYYY · DD.MM.YYYY · D/M/YYYY · DDMMYY · DD MM YYYY
 */

interface DateParts {
  d: number;
  m: number;
  y: number;
}

function parse(input: string): DateParts | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const pieces = trimmed.split(/[\s/.\-]+/).filter(Boolean);
  if (pieces.length === 3 && pieces.every((p) => /^\d+$/.test(p))) {
    const [d, m, y] = pieces.map(Number);
    return { d, m, y: pieces[2].length === 2 ? 2000 + y : y };
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 8) {
    return { d: +digits.slice(0, 2), m: +digits.slice(2, 4), y: +digits.slice(4) };
  }
  if (digits.length === 6) {
    return { d: +digits.slice(0, 2), m: +digits.slice(2, 4), y: 2000 + +digits.slice(4) };
  }
  return null;
}

function sameDay(a: DateParts, b: DateParts): boolean {
  // Two-digit years are ambiguous (1998 → "98"), so compare them modulo 100.
  return a.d === b.d && a.m === b.m && (a.y === b.y || a.y % 100 === b.y % 100);
}

export function checkBirthdayPassword(input: string, expected: string): boolean {
  const want = parse(expected);
  const got = parse(input);
  if (!want || !got) return false;
  return sameDay(got, want);
}
