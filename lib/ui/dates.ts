// Pure date helpers for the Calendar primitive. Dates travel as ISO day
// strings ("2027-05-14") so they compare with < and never shift time zones.

export type IsoDay = string;
export type DateRange = { start?: IsoDay; end?: IsoDay };
/** A calendar month: month is 0 based, like Date. */
export type YearMonth = { year: number; month: number };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function toUtc(iso: IsoDay): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): IsoDay {
  return date.toISOString().slice(0, 10);
}

export function isoDay(year: number, month: number, day: number): IsoDay {
  return fromUtc(new Date(Date.UTC(year, month, day)));
}

export function addDays(iso: IsoDay, days: number): IsoDay {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

export function addMonths({ year, month }: YearMonth, count: number): YearMonth {
  const date = new Date(Date.UTC(year, month + count, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

export function yearMonthOf(iso: IsoDay): YearMonth {
  const date = toUtc(iso);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

export function monthLabel({ year, month }: YearMonth): string {
  return `${MONTHS[month]} ${year}`;
}

/** Day of the month as a number, for the grid cells. */
export function dayOfMonth(iso: IsoDay): number {
  return toUtc(iso).getUTCDate();
}

/** "Friday 14 May 2027", the accessible name of a day cell. */
export function longDayLabel(iso: IsoDay): string {
  const date = toUtc(iso);
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(date);
  return `${weekday} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * Weeks of a month, Monday first. Cells outside the month are null so the
 * grid keeps its columns.
 */
export function monthWeeks({ year, month }: YearMonth): (IsoDay | null)[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7; // Monday = 0
  const cells: (IsoDay | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(isoDay(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (IsoDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * The range after a click: the first click sets the start, a later day sets
 * the end, a day on or before the start restarts the range.
 */
export function nextRange(range: DateRange, clicked: IsoDay): DateRange {
  if (!range.start || range.end) return { start: clicked };
  if (clicked <= range.start) return { start: clicked };
  return { start: range.start, end: clicked };
}

export function nightsBetween(start: IsoDay, end: IsoDay): number {
  return Math.round((toUtc(end).getTime() - toUtc(start).getTime()) / 86_400_000);
}

function shortDay(iso: IsoDay): { weekday: string; day: number; month: string; year: number } {
  const date = toUtc(iso);
  return {
    weekday: WEEKDAYS[date.getUTCDay()],
    day: date.getUTCDate(),
    month: MONTHS_SHORT[date.getUTCMonth()],
    year: date.getUTCFullYear(),
  };
}

/**
 * The calendar footer: "Fri 14 to Tue 18 May · 4 nights". Adds the month to
 * the start when the range crosses months, and years when it crosses years.
 */
export function rangeLabel(range: DateRange): string {
  if (!range.start) return "Pick the first day";
  const a = shortDay(range.start);
  if (!range.end) return `${a.weekday} ${a.day} ${a.month} · pick the last day`;
  const b = shortDay(range.end);
  const nights = nightsBetween(range.start, range.end);
  const nightsText = `${nights} ${nights === 1 ? "night" : "nights"}`;
  if (a.year !== b.year) {
    return `${a.weekday} ${a.day} ${a.month} ${a.year} to ${b.weekday} ${b.day} ${b.month} ${b.year} · ${nightsText}`;
  }
  const startText = a.month === b.month ? `${a.weekday} ${a.day}` : `${a.weekday} ${a.day} ${a.month}`;
  return `${startText} to ${b.weekday} ${b.day} ${b.month} · ${nightsText}`;
}
