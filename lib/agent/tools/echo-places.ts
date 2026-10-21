import { FatalError } from "workflow";

import type { FindPlacesOutput, TripPlaceCard } from "@/lib/contracts";

import { pause, runToolGenerator } from "./run-tool";

// Spike tool: fake places in the FindPlacesOutput shape, streamed in three
// preliminary phases one second apart, so the dock and the board can be built
// and the durability tests can interrupt a tool mid-run. Not for production
// prompts. `fail: true` throws a non-retryable error (reliability test 7).

export type EchoPlacesInput = { query: string; fail?: boolean };

const FAKE: Omit<TripPlaceCard, "askIds">[] = [
  { name: "Test Kitchen One", category: "eat", neighborhood: "Old Town" },
  { name: "Test Wine Bar", category: "drink", neighborhood: "Harbor" },
  { name: "Test Coffee Room", category: "coffee", neighborhood: "Old Town" },
  { name: "Test Gallery", category: "see", neighborhood: "Museum Quarter" },
  { name: "Test Garden Hotel", category: "stay", neighborhood: "Hillside" },
  { name: "Test Night Market", category: "eat", neighborhood: "Harbor" },
].map((p, i) => ({
  ...p,
  category: p.category as TripPlaceCard["category"],
  tripPlaceId: `echo-tp-${i + 1}`,
  placeId: `echo-place-${i + 1}`,
  entityId: `echo-entity-${i + 1}`,
  score: 92 - i * 7,
  because: [{ entityId: "echo-fav", name: "a client favorite", share: 100 }],
  sharedTags: [],
  status: "suggested",
  source: "ask",
}));

export async function* echoPlaces(
  { query }: EchoPlacesInput,
  toolCallId: string,
  abortSignal?: AbortSignal,
): AsyncGenerator<FindPlacesOutput, FindPlacesOutput> {
  const started = Date.now();
  const label = query.slice(0, 40) || "Test places";
  const cards = FAKE.map((card) => ({ ...card, askIds: [`echo-ask-${toolCallId}`] }));
  const phases: FindPlacesOutput["phase"][] = ["searching", "scoring", "explaining"];
  for (let i = 0; i < phases.length; i++) {
    const shown = cards.slice(0, (i + 1) * 2);
    yield {
      phase: phases[i] ?? "searching",
      askId: `echo-ask-${toolCallId}`,
      label,
      count: shown.length,
      total: cards.length,
      done: i + 1,
      elapsedMs: Date.now() - started,
      loosened: [],
      places: shown,
    };
    await pause(1_000, abortSignal);
  }
  return {
    phase: "done",
    askId: `echo-ask-${toolCallId}`,
    label,
    count: cards.length,
    total: cards.length,
    done: phases.length,
    elapsedMs: Date.now() - started,
    loosened: [],
    places: cards,
  };
}

export async function echoPlacesStep(
  input: EchoPlacesInput,
  toolCallId: string,
  abortSignal?: AbortSignal,
): Promise<FindPlacesOutput> {
  "use step";
  if (input.fail) {
    // FatalError: no step retry; the agent gets the error and the card shows Retry.
    throw new FatalError("The place search service answered 500. Try the search again.");
  }
  return runToolGenerator(toolCallId, echoPlaces(input, toolCallId, abortSignal), abortSignal);
}
