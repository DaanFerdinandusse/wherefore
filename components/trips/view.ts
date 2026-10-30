// The Trips page view from the URL: the board by default, the list with ?view=list.

export type TripsView = "board" | "list";

export function parseTripsView(value: string | string[] | undefined): TripsView {
  return (Array.isArray(value) ? value[0] : value) === "list" ? "list" : "board";
}

export function tripsViewHref(view: TripsView): string {
  return view === "list" ? "/trips?view=list" : "/trips";
}
