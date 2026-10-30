import { isoDay, type IsoDay } from "@/lib/ui/dates";

/** Today in the advisor's time zone, as YYYY-MM-DD. */
export function localToday(): IsoDay {
  const now = new Date();
  return isoDay(now.getFullYear(), now.getMonth(), now.getDate());
}
