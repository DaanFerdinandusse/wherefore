"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { yearMonthOf, type DateRange, type YearMonth } from "@/lib/ui/dates";

import { localToday } from "./today";

// When (N3): the two-month range picker with Exact dates / Not set yet, the
// footer line ("Fri 14 to Tue 18 May · 4 nights"), Clear and "Next:
// travelers". Days before today are disabled.
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
        <Button size="md" onClick={onNext} className="h-11 text-action">
          Next: travelers
          <ArrowRight size={16} strokeWidth={2} aria-hidden />
        </Button>
      }
    />
  );
}
