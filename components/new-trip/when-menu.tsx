"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { isoDay, yearMonthOf, type DateRange, type YearMonth } from "@/lib/ui/dates";

// When (F3): the two-month range picker with Exact dates / Not set yet, the
// footer line ("Fri 14 to Tue 18 May · 4 nights"), Clear and "Next:
// travelers". Days before today are disabled.
function localToday(): string {
  const now = new Date();
  return isoDay(now.getFullYear(), now.getMonth(), now.getDate());
}

export function WhenMenu({
  range,
  mode,
  onRangeChange,
  onModeChange,
  onClear,
  onNext,
}: {
  range: DateRange;
  mode: "exact" | "unset";
  onRangeChange: (range: DateRange) => void;
  onModeChange: (mode: "exact" | "unset") => void;
  onClear: () => void;
  onNext: () => void;
}) {
  const [today] = useState(localToday);
  const [month, setMonth] = useState<YearMonth>(() => yearMonthOf(range.start ?? today));

  return (
    <Calendar
      month={month}
      onMonthChange={setMonth}
      value={range}
      onValueChange={onRangeChange}
      mode={mode}
      onModeChange={onModeChange}
      onClear={onClear}
      minDate={today}
      action={
        <Button size="md" onClick={onNext}>
          Next: travelers
        </Button>
      }
    />
  );
}
