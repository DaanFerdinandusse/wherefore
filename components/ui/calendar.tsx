"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/ui/cn";
import {
  addDays,
  addMonths,
  dayOfMonth,
  longDayLabel,
  monthLabel,
  monthWeeks,
  nextRange,
  rangeLabel,
  yearMonthOf,
  type DateRange,
  type IsoDay,
  type YearMonth,
} from "@/lib/ui/dates";

import { IconButton } from "./icon-button";
import { SegmentedToggle } from "./segmented-toggle";

// The two-month range picker of the trip bar's When step. Fully controlled:
// the visible month, the range and the mode all come from props. The footer
// reads the range back ("Fri 14 to Tue 18 May · 4 nights") next to Clear and
// the caller's primary action. "Not set yet" swaps the months for a note.
// Keyboard: arrows move a day or a week, Page Up and Page Down a month,
// Enter or Space picks the day.
export type DatesMode = "exact" | "unset";

const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function compareMonth(a: YearMonth, b: YearMonth) {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

export function Calendar({
  month,
  onMonthChange,
  value,
  onValueChange,
  mode,
  onModeChange,
  onClear,
  action,
  minDate,
  className,
}: {
  /** The first of the two visible months. */
  month: YearMonth;
  onMonthChange: (month: YearMonth) => void;
  value: DateRange;
  onValueChange: (range: DateRange) => void;
  mode: DatesMode;
  onModeChange: (mode: DatesMode) => void;
  onClear: () => void;
  /** The primary action, for example a "Next: travelers" button. */
  action?: ReactNode;
  /** Days before this are disabled. */
  minDate?: IsoDay;
  className?: string;
}) {
  const months = [month, addMonths(month, 1)];
  const [focusDay, setFocusDay] = useState<IsoDay | null>(null);
  const moveFocus = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // The tab stop: the focused day, else the start, else the 1st of the month.
  const firstOfMonth = monthWeeks(month).flat().find((d): d is IsoDay => d !== null) ?? "";
  const visible = (iso: IsoDay) =>
    compareMonth(yearMonthOf(iso), month) >= 0 && compareMonth(yearMonthOf(iso), months[1]) <= 0;
  const tabStop =
    (focusDay && visible(focusDay) && focusDay) || (value.start && visible(value.start) && value.start) || firstOfMonth;

  useEffect(() => {
    if (!moveFocus.current || !focusDay) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus();
  }, [focusDay, month]);

  function onDayKeyDown(event: KeyboardEvent<HTMLButtonElement>, iso: IsoDay) {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let target: IsoDay | undefined;
    if (event.key in step) target = addDays(iso, step[event.key]);
    if (event.key === "PageUp") target = addDays(iso, -28);
    if (event.key === "PageDown") target = addDays(iso, 28);
    if (!target) return;
    event.preventDefault();
    const targetMonth = yearMonthOf(target);
    if (compareMonth(targetMonth, month) < 0) onMonthChange(targetMonth);
    if (compareMonth(targetMonth, months[1]) > 0) onMonthChange(addMonths(targetMonth, -1));
    moveFocus.current = true;
    setFocusDay(target);
  }

  return (
    <div className={cn("flex w-full flex-col items-center gap-6", className)}>
      <SegmentedToggle
        label="Dates"
        size="sm"
        variant="panel"
        className="bg-surface [&_button]:h-9"
        value={mode}
        onValueChange={onModeChange}
        options={[
          { value: "exact", label: "Exact dates" },
          { value: "unset", label: "Not set yet" },
        ]}
      />

      {mode === "exact" ? (
        <div ref={gridRef} className="relative flex w-full items-start justify-center gap-12">
          <IconButton
            label="Previous month"
            variant="outline"
            size={36}
            icon={<ChevronLeft size={16} strokeWidth={2} aria-hidden />}
            onClick={() => onMonthChange(addMonths(month, -1))}
            disabled={minDate ? compareMonth(month, yearMonthOf(minDate)) <= 0 : false}
            className="absolute top-0 left-0"
          />
          <IconButton
            label="Next month"
            variant="outline"
            size={36}
            icon={<ChevronRight size={16} strokeWidth={2} aria-hidden />}
            onClick={() => onMonthChange(addMonths(month, 1))}
            className="absolute top-0 right-0"
          />
          {months.map((ym) => (
            <MonthGrid
              key={`${ym.year}-${ym.month}`}
              month={ym}
              range={value}
              minDate={minDate}
              tabStop={tabStop}
              onPick={(iso) => {
                setFocusDay(iso);
                onValueChange(nextRange(value, iso));
              }}
              onDayKeyDown={onDayKeyDown}
            />
          ))}
        </div>
      ) : (
        <p className="max-w-[420px] py-10 text-center text-body text-text-2">
          No dates yet. The trip starts with 3 days, and you can add more days later.
        </p>
      )}

      <div className="flex w-full items-center justify-between gap-4 border-t border-rule pt-5">
        <p aria-live="polite" className="text-action font-medium text-ink">
          {mode === "exact" ? rangeLabel(value) : "Dates not set yet"}
        </p>
        <div className="flex items-center gap-2.5">
          {mode === "exact" && value.start ? (
            <button
              type="button"
              onClick={onClear}
              className="rounded-pill px-2 text-ui font-medium text-ink underline decoration-1 underline-offset-[3px] hover:decoration-2"
            >
              Clear
            </button>
          ) : null}
          {action}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({
  month,
  range,
  minDate,
  tabStop,
  onPick,
  onDayKeyDown,
}: {
  month: YearMonth;
  range: DateRange;
  minDate?: IsoDay;
  tabStop: IsoDay;
  onPick: (iso: IsoDay) => void;
  onDayKeyDown: (event: KeyboardEvent<HTMLButtonElement>, iso: IsoDay) => void;
}) {
  const title = monthLabel(month);
  return (
    <table className="-mb-1 w-[308px] shrink-0 border-separate border-spacing-y-1" aria-label={title}>
      <caption className="pb-2 text-body-lg leading-6 font-semibold text-ink">{title}</caption>
      <thead>
        <tr>
          {WEEKDAY_INITIALS.map((initial, i) => (
            <th key={i} scope="col" abbr={WEEKDAY_NAMES[i]} className="h-5 w-11 p-0 text-micro font-semibold tracking-[0.1em] text-text-2">
              {initial}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {monthWeeks(month).map((week, w) => (
          <tr key={w}>
            {week.map((iso, d) =>
              iso ? (
                <DayCell
                  key={iso}
                  iso={iso}
                  range={range}
                  disabled={minDate ? iso < minDate : false}
                  tabbable={iso === tabStop}
                  onPick={onPick}
                  onKeyDown={onDayKeyDown}
                />
              ) : (
                <td key={`empty-${d}`} className="h-11 w-11 p-0" />
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DayCell({
  iso,
  range,
  disabled,
  tabbable,
  onPick,
  onKeyDown,
}: {
  iso: IsoDay;
  range: DateRange;
  disabled: boolean;
  tabbable: boolean;
  onPick: (iso: IsoDay) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, iso: IsoDay) => void;
}) {
  const isStart = iso === range.start;
  const isEnd = iso === range.end;
  const inside = Boolean(range.start && range.end && iso > range.start && iso < range.end);
  const endpoint = isStart || isEnd;
  const hasRange = Boolean(range.start && range.end);

  return (
    <td
      className={cn(
        "h-11 w-11 p-0",
        inside && "bg-avatar",
        hasRange && isStart && "bg-linear-to-r from-transparent from-50% to-avatar to-50%",
        hasRange && isEnd && "bg-linear-to-r from-avatar from-50% to-transparent to-50%",
      )}
    >
      <button
        type="button"
        data-day={iso}
        tabIndex={tabbable ? 0 : -1}
        disabled={disabled}
        aria-pressed={endpoint}
        aria-label={`${longDayLabel(iso)}${isStart ? ", first day" : ""}${isEnd ? ", last day" : ""}`}
        onClick={() => onPick(iso)}
        onKeyDown={(event) => onKeyDown(event, iso)}
        className={cn(
          "mx-auto flex size-11 items-center justify-center rounded-pill text-ui transition-colors disabled:cursor-not-allowed disabled:text-ink/30",
          endpoint ? "bg-ink font-semibold text-surface" : "font-medium text-ink enabled:hover:bg-ink/8",
        )}
      >
        {dayOfMonth(iso)}
      </button>
    </td>
  );
}
