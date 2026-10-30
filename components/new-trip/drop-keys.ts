import type { KeyboardEvent } from "react";

// Arrow keys in the New trip dropdowns: rows marked `data-row` form one list.

/** The rows under `root`, in document order. */
export function rowsIn(root: Element | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>("[data-row]")) : [];
}

/** ArrowUp and ArrowDown (and Left, Right in a grid) move between the rows; Home and End jump. */
export function moveBetweenRows(event: KeyboardEvent<HTMLElement>) {
  const rows = rowsIn(event.currentTarget);
  const index = rows.indexOf(document.activeElement as HTMLElement);
  if (index < 0 || rows.length === 0) return;
  let next: number | undefined;
  if (event.key === "ArrowDown" || event.key === "ArrowRight") next = Math.min(rows.length - 1, index + 1);
  if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = Math.max(0, index - 1);
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = rows.length - 1;
  if (next === undefined) return;
  event.preventDefault();
  rows[next].focus();
}

/** From a search field: ArrowDown goes to the first row, ArrowUp to the last. */
export function enterRows(event: KeyboardEvent<HTMLElement>, root: Element | null) {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  const rows = rowsIn(root);
  if (rows.length === 0) return;
  event.preventDefault();
  (event.key === "ArrowDown" ? rows[0] : rows[rows.length - 1]).focus();
}
