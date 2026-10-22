import { RunExpiredError, WorkflowRunNotFoundError } from "workflow/errors";

// Pure decisions the chat routes make about a turn and its run. No database,
// no network: the routes read the state, these say what it means. Tested in
// turn-state.test.ts.

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

/**
 * What a run status read means for the turn lock:
 *   - terminal: the run is confirmed over; reconcile and release.
 *   - missing: the run does not exist (expired or never created); release.
 *   - live: still pending or running; leave the lock.
 *   - unknown: the status could not be read (a Workflow outage); leave the
 *     lock and try again on the next read. Never treated as failed.
 */
export type RunState =
  | { kind: "terminal"; status: "completed" | "failed" | "cancelled" }
  | { kind: "missing" }
  | { kind: "live"; status: string }
  | { kind: "unknown"; error: unknown };

export function runStateFromStatus(status: string): RunState {
  if (TERMINAL.has(status)) return { kind: "terminal", status: status as "completed" | "failed" | "cancelled" };
  return { kind: "live", status };
}

export function runStateFromError(error: unknown): RunState {
  if (WorkflowRunNotFoundError.is(error)) return { kind: "missing" };
  if (RunExpiredError.is(error)) {
    const status = error.runStatus;
    return status && TERMINAL.has(status) ? runStateFromStatus(status) : { kind: "missing" };
  }
  return { kind: "unknown", error };
}

/** Reads a run's state through `read` (getRun(runId).status in the routes). */
export async function readRunState(read: () => Promise<string>): Promise<RunState> {
  try {
    return runStateFromStatus(await read());
  } catch (error) {
    return runStateFromError(error);
  }
}

/**
 * Which stream a reconnect gets. A client that names the run (or turn) it
 * was reading only resumes that run at its cursor; if the chat has moved on
 * to another run, its cursor means nothing there, so it is told to reset
 * (re-read the transcript and attach from chunk 0).
 */
export type StreamBinding =
  | { kind: "idle" }
  | { kind: "reset"; activeRunId: string }
  | { kind: "stream"; runId: string; turnId: string; uiStartIndex: number };

export function resolveStreamBinding({
  activeRunId,
  activeTurnId,
  requestedRunId,
  requestedTurnId,
  startIndex,
}: {
  activeRunId: string | null | undefined;
  activeTurnId: string | null | undefined;
  requestedRunId?: string;
  requestedTurnId?: string;
  startIndex: number;
}): StreamBinding {
  if (!activeRunId || !activeTurnId) return { kind: "idle" };
  const bound = requestedRunId !== undefined || requestedTurnId !== undefined;
  const matches =
    (requestedRunId === undefined || requestedRunId === activeRunId) &&
    (requestedTurnId === undefined || requestedTurnId === activeTurnId);
  if (bound && !matches) return { kind: "reset", activeRunId };
  return { kind: "stream", runId: activeRunId, turnId: activeTurnId, uiStartIndex: startIndex };
}

/**
 * What a prompt with an already recorded turnId gets:
 *   - stream: the turn still holds the lock; stream its run (a double submit);
 *   - wait: it holds the lock but start() has not stored the run id yet;
 *   - outcome: the turn is over; return what it produced, start nothing;
 *   - foreign: the turnId belongs to another chat.
 */
export type DuplicateTurn =
  | { kind: "stream"; runId: string }
  | { kind: "wait" }
  | { kind: "outcome" }
  | { kind: "foreign" };

export function resolveDuplicateTurn({
  chatId,
  turnId,
  turn,
  chat,
}: {
  chatId: string;
  turnId: string;
  turn: { chatId: string; runId: string | null };
  chat: { activeTurnId: string | null; activeRunId: string | null };
}): DuplicateTurn {
  if (turn.chatId !== chatId) return { kind: "foreign" };
  if (chat.activeTurnId !== turnId) return { kind: "outcome" };
  const runId = chat.activeRunId ?? turn.runId;
  return runId ? { kind: "stream", runId } : { kind: "wait" };
}
