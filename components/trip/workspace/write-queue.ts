// Per-slot write queue. Writes to the same slot run one after the other, in
// the order the advisor made them, and each claims a sequence number per slot
// when it is queued. A response is applied only for slots no newer write has
// claimed since, so a late "add" answer cannot bring back a slot that was
// cleared after it. An exclusive write (the reorder's replace, which rewrites
// every row) waits for every write in flight and holds back the ones after it.
// Plain promises, no React; tested in write-queue.test.ts.

export type WriteQueue = {
  /**
   * Queues `task` behind the writes to `keys`. The task gets `isCurrent(key)`:
   * true while no write queued after this one has claimed that key.
   */
  run<T>(keys: readonly string[], task: (isCurrent: (key: string) => boolean) => Promise<T>, options?: { exclusive?: boolean }): Promise<T>;
  /** True while some write is queued or running. */
  busy(): boolean;
};

export function createWriteQueue(): WriteQueue {
  const tails = new Map<string, Promise<unknown>>();
  const latest = new Map<string, number>();
  let barrier: Promise<unknown> = Promise.resolve();
  let seq = 0;
  let running = 0;

  return {
    run(keys, task, options = {}) {
      const mine = ++seq;
      for (const key of keys) latest.set(key, mine);
      const waitFor = options.exclusive ? [barrier, ...tails.values()] : [barrier, ...keys.flatMap((k) => tails.get(k) ?? [])];
      const isCurrent = (key: string) => (latest.get(key) ?? 0) <= mine;
      running += 1;
      const done = Promise.allSettled(waitFor).then(() => task(isCurrent));
      const settled = done.then(
        () => undefined,
        () => undefined,
      );
      void settled.then(() => {
        running -= 1;
        for (const key of keys) if (tails.get(key) === settled) tails.delete(key);
      });
      for (const key of keys) tails.set(key, settled);
      if (options.exclusive) barrier = settled;
      return done;
    },
    busy: () => running > 0,
  };
}
