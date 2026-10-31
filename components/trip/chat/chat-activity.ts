import { getToolName, isToolUIPart } from "ai";
import type { AppUIMessage } from "@/lib/contracts";

import { firstName } from "../workspace/format";

import { readPlacesOutput } from "./chat-places";

export type ChatActivity = {
  key: string;
  kind: "preparing" | "thinking";
  label: string;
};

/** Tools with no card of their own: this line is all the advisor sees of them. */
export const QUIET_TOOLS = new Set(["get_trip_context", "lookup_place"]);

type Part = AppUIMessage["parts"][number];

function runningToolName(part: Part): string | null {
  if (!isToolUIPart(part)) return null;
  const running =
    part.state === "input-streaming" || part.state === "input-available" ||
    part.state === "approval-requested" || part.state === "approval-responded" ||
    (part.state === "output-available" && part.preliminary === true);
  return running ? getToolName(part) : null;
}

/** Use the latest complete summary heading, or its latest paragraph, without inventing copy. */
export function thinkingLabel(summary: string): string {
  const headings = Array.from(summary.matchAll(/(?:\*\*([^*\n]+)\*\*|^#{1,6}\s+([^\n]+))/gm));
  const heading = headings.at(-1);
  const paragraph = summary.trim().split(/\n\s*\n/).at(-1) ?? "";
  const text = (heading?.[1] ?? heading?.[2] ?? paragraph)
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= 110) return text;
  const prefix = text.slice(0, 107);
  const boundary = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, boundary > 70 ? boundary : prefix.length)}...`;
}

/** What the turn is waiting on, from the last tool before the model's next step. */
function waitingLabel(parts: Part[], client: string): string {
  const tool = parts.findLast(isToolUIPart);
  if (!tool) return client ? `Thinking about what ${client} would love` : "Thinking about what would fit";
  const name = getToolName(tool);
  if (name === "get_trip_context") return "Working out where to look";
  if (name === "recommend_place") return "Thinking about what to plan next";
  if (name === "find_places" && tool.state === "output-available") {
    const output = readPlacesOutput(tool.output);
    const pickId = output?.verdicts?.find((verdict) => verdict.stand === "pick")?.tripPlaceId;
    const pick = output?.places.find((place) => place.tripPlaceId === pickId);
    if (pick) return `Pulling up ${pick.name}`;
    if (output?.places.length) return client ? `Choosing the best fit for ${client}` : "Choosing the best fit";
  }
  return "Working out what's next";
}

/**
 * The line under the thread while a turn runs. A card showing its own progress
 * stands in for it; every other moment says what the turn is waiting on, so a
 * running turn never leaves the thread still. The model's own reasoning summary
 * wins when it sends one, which it rarely does at low effort. Pure.
 */
export function chatActivity(messages: AppUIMessage[], streaming: boolean, clientName = ""): ChatActivity | null {
  if (!streaming) return null;
  const last = messages.findLast((message) => !message.metadata?.hidden);
  const client = clientName.trim() ? firstName(clientName) : "";
  const preparing = (parts: Part[]): ChatActivity => ({ key: last?.id ?? "pending", kind: "preparing", label: waitingLabel(parts, client) });
  if (last?.role !== "assistant") return preparing([]);

  // Includes partial arguments, quiet tools and preliminary search results.
  const running = last.parts.map(runningToolName).filter((name) => name !== null);
  if (running.some((name) => !QUIET_TOOLS.has(name))) return null;
  if (running.at(-1) === "get_trip_context") return { ...preparing([]), label: client ? `Reading ${client}'s trip` : "Reading the trip" };
  if (running.at(-1) === "lookup_place") return { ...preparing([]), label: "Checking the details" };

  const index = last.parts.findLastIndex((part) => part.type === "reasoning" || part.type === "text" || isToolUIPart(part));
  if (index < 0) return preparing([]);
  const part = last.parts[index];
  if (part.type === "reasoning") {
    const label = thinkingLabel(part.text);
    return label ? { key: `${last.id}-${index}`, kind: "thinking", label } : preparing(last.parts);
  }
  if (part.type === "text") {
    // A finished text ends the turn unless the model has started another step.
    const anotherStep = last.parts.slice(index + 1).some((later) => later.type === "step-start");
    return anotherStep ? preparing(last.parts) : null;
  }
  return preparing(last.parts);
}
