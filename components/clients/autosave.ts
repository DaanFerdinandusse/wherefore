// Saved as you type: a pure scheduler with no React in it, so the rules are
// tested on their own. Edits merge into one pending patch (later keys win), a
// quiet period after the last edit sends it, and saves never overlap: what
// arrives while one is in flight waits and goes next. A failed patch is kept
// and merged under the next edit, so nothing typed is lost.

export type SaveResult = { ok: true } | { ok: false; error: string };

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

/** Later keys win; `undefined` values in `next` do not erase earlier ones. */
export function mergePatch<P extends object>(base: Partial<P> | null, next: Partial<P>): Partial<P> {
  const out: Partial<P> = { ...(base ?? {}) };
  for (const key of Object.keys(next) as (keyof P)[]) {
    if (next[key] !== undefined) out[key] = next[key];
  }
  return out;
}

export type Timers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type Autosaver<P extends object> = {
  /** Queue an edit. `immediate` skips the quiet period (the first keystroke of a new client). */
  schedule: (patch: Partial<P>, options?: { immediate?: boolean }) => void;
  /** Send whatever is pending now; resolves when nothing is pending or in flight. */
  flush: () => Promise<void>;
  /** Drop the pending edit and stop the timer (an Esc that undoes the field). */
  cancel: () => void;
  /** True while an edit waits or a save runs. */
  busy: () => boolean;
};

export function createAutosaver<P extends object>({
  delayMs,
  save,
  onStatus,
  timers = realTimers,
}: {
  delayMs: number;
  save: (patch: Partial<P>) => Promise<SaveResult>;
  onStatus?: (status: SaveStatus) => void;
  timers?: Timers;
}): Autosaver<P> {
  let pending: Partial<P> | null = null;
  let timer: unknown = null;
  let inFlight: Promise<void> | null = null;

  function clearTimer() {
    if (timer !== null) timers.clear(timer);
    timer = null;
  }

  async function run(): Promise<void> {
    clearTimer();
    if (inFlight || !pending) return;
    const patch = pending;
    pending = null;
    onStatus?.({ kind: "saving" });
    inFlight = (async () => {
      let result: SaveResult;
      try {
        result = await save(patch);
      } catch {
        result = { ok: false, error: "Could not save. Check your connection and try again." };
      }
      inFlight = null;
      if (!result.ok) {
        // Keep the failed edit under anything typed since.
        pending = pending ? mergePatch(patch, pending) : patch;
        onStatus?.({ kind: "error", message: result.error });
        return;
      }
      if (pending) {
        await run();
      } else {
        onStatus?.({ kind: "saved" });
      }
    })();
    await inFlight;
  }

  return {
    schedule(patch, options) {
      pending = mergePatch(pending, patch);
      clearTimer();
      if (inFlight) {
        onStatus?.({ kind: "pending" });
        return;
      }
      if (options?.immediate) {
        void run();
        return;
      }
      onStatus?.({ kind: "pending" });
      timer = timers.set(() => void run(), delayMs);
    },
    async flush() {
      clearTimer();
      while (inFlight || pending) {
        if (inFlight) await inFlight;
        else await run();
        // A failed save leaves its patch pending; flush once, do not loop on it.
        if (!inFlight && pending) break;
      }
    },
    cancel() {
      clearTimer();
      pending = null;
      if (!inFlight) onStatus?.({ kind: "idle" });
    },
    busy: () => inFlight !== null || pending !== null,
  };
}
