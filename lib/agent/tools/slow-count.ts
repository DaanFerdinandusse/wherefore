import { pause, runToolGenerator } from "./run-tool";

// Spike tool: counts to `to` (max 10) one second per number, yielding each
// count as a preliminary output. Makes a turn long enough to interrupt.

export type SlowCountInput = { to?: number };
export type SlowCountOutput = { count: number; total: number; done: boolean };

export async function* slowCount(
  { to = 10 }: SlowCountInput,
  abortSignal?: AbortSignal,
): AsyncGenerator<SlowCountOutput, SlowCountOutput> {
  const total = Math.min(10, Math.max(1, Math.round(to)));
  for (let count = 1; count < total; count++) {
    yield { count, total, done: false };
    await pause(1_000, abortSignal);
  }
  return { count: total, total, done: true };
}

export async function slowCountStep(
  input: SlowCountInput,
  toolCallId: string,
  abortSignal?: AbortSignal,
): Promise<SlowCountOutput> {
  "use step";
  return runToolGenerator(toolCallId, slowCount(input, abortSignal), abortSignal);
}
