"use client";

import { useSyncExternalStore } from "react";

import { PageHeader } from "@/components/shell/page-header";

import { firstName } from "./format";

// "Good morning, Sofía" in the advisor's own time of day. The server does not
// know the browser's clock, so the first paint says "Hello" and the greeting
// settles once the page is interactive.
function greetingFor(hour: number | null): string {
  if (hour === null) return "Hello";
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const subscribe = () => () => {};

export function TripsHeader({ userName, summary }: { userName: string; summary: string }) {
  const hour = useSyncExternalStore(
    subscribe,
    () => new Date().getHours(),
    () => null,
  );
  const name = userName.trim() ? firstName(userName) : "";
  const greeting = greetingFor(hour);
  return <PageHeader title={name ? `${greeting}, ${name}` : greeting} subtitle={summary} />;
}
