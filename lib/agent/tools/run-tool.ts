import { getWritable } from "workflow";

import type { ChatStreamPart } from "../stream";

// Tools are authored as async generators: each `yield` is a progress phase,
// the `return` is the final output. WorkflowAgent awaits execute and does not
// iterate generators, so a tool's "use step" execute hands its generator to
// this driver, which writes every yield to the turn's stream as a
// tool-output-preliminary part (the UI shows it on the tool card) and returns
// the final value to the agent. Runs inside a step.

export async function runToolGenerator<TOutput>(
  toolCallId: string,
  generator: AsyncGenerator<TOutput, TOutput>,
  abortSignal?: AbortSignal,
): Promise<TOutput> {
  const writer = getWritable<ChatStreamPart>().getWriter();
  try {
    while (true) {
      if (abortSignal?.aborted) {
        await generator.return(undefined as never);
        throw abortSignal.reason ?? new DOMException("Stopped", "AbortError");
      }
      const next = await generator.next();
      if (next.done) return next.value;
      await writer.write({ type: "tool-output-preliminary", toolCallId, output: next.value });
    }
  } finally {
    writer.releaseLock();
  }
}

/** Waits `ms`, or rejects early when the signal aborts. */
export function pause(ms: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(abortSignal.reason ?? new DOMException("Stopped", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    abortSignal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortSignal.reason ?? new DOMException("Stopped", "AbortError"));
      },
      { once: true },
    );
  });
}
