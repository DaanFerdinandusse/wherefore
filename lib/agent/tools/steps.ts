import { FatalError } from "workflow";

import type {
  FindPlacesOutput,
  LookupPlaceOutput,
  RemovePlaceOutput,
  ScorePlacesOutput,
  SetItineraryOutput,
  TripContextOutput,
} from "@/lib/contracts";

import { getChat } from "../chat-store";
import { loadTripContext } from "../trip-context";
import { assertTurn, type TurnRef } from "../writes";

import { findPlacesTool, type FindPlacesInput } from "./find-places";
import { lookupPlaceTool, removePlaceTool, setItineraryTool, type SetItineraryInput } from "./place-tools";
import { runToolGenerator } from "./run-tool";
import { scorePlacesTool, type ScorePlacesInput } from "./score-places";
import { seedTripTool } from "./seed-trip";

// The "use step" functions behind every tool. Workflow persists a step's
// result and retries it on failure, so each one is safe to run twice (keyed
// writes, see lib/agent/writes.ts). This module holds only step functions:
// the workflow bundle strips their bodies and the imports they use, so no
// server-only code reaches the workflow sandbox (lib/agent/README.md).

export type TurnMode = {
  /** The turn answers the synthetic seed message: seed_trip is forced on step 0. */
  seed: boolean;
  /** The spike tools (echo_places, slow_count), for the chat-lab e2e specs only. */
  devTools: boolean;
};

/** Read in a step: the workflow sandbox has no env and no database. */
export async function loadTurnModeStep(chatId: string): Promise<TurnMode> {
  "use step";
  const chat = await getChat(chatId);
  const lastUser = chat?.messages.findLast((m) => m.role === "user");
  return {
    seed: lastUser?.metadata?.kind === "seed",
    devTools: process.env.AGENT_DEV_TOOLS === "1" && process.env.NODE_ENV !== "production",
  };
}

export async function getTripContextStep(tripId: string): Promise<TripContextOutput> {
  "use step";
  const context = await loadTripContext(tripId);
  if (!context) throw new FatalError("This chat's trip no longer exists.");
  return context;
}

export async function seedTripStep(turn: TurnRef, toolCallId: string, abortSignal?: AbortSignal): Promise<FindPlacesOutput> {
  "use step";
  await assertTurn(turn);
  return runToolGenerator(toolCallId, seedTripTool(turn, toolCallId, abortSignal), abortSignal);
}

export async function findPlacesStep(
  input: FindPlacesInput,
  turn: TurnRef,
  toolCallId: string,
  abortSignal?: AbortSignal,
): Promise<FindPlacesOutput> {
  "use step";
  await assertTurn(turn);
  return runToolGenerator(toolCallId, findPlacesTool(input, turn, toolCallId, abortSignal), abortSignal);
}

export async function scorePlacesStep(input: ScorePlacesInput, turn: TurnRef, toolCallId: string): Promise<ScorePlacesOutput> {
  "use step";
  await assertTurn(turn);
  return scorePlacesTool(input, turn, toolCallId);
}

export async function lookupPlaceStep(input: { place_id: string }, turn: TurnRef): Promise<LookupPlaceOutput> {
  "use step";
  return lookupPlaceTool(input, turn);
}

export async function setItineraryStep(
  input: SetItineraryInput,
  turn: TurnRef,
  toolCallId: string,
): Promise<SetItineraryOutput> {
  "use step";
  await assertTurn(turn);
  return setItineraryTool(input, turn, toolCallId);
}

export async function removePlaceStep(
  input: { place_id: string; replace: boolean },
  turn: TurnRef,
  toolCallId: string,
): Promise<RemovePlaceOutput> {
  "use step";
  await assertTurn(turn);
  return removePlaceTool(input, turn, toolCallId);
}
