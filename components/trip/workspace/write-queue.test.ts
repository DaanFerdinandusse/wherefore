import { describe, expect, it } from "vitest";

import { createWriteQueue } from "./write-queue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("per-slot write queue", () => {
  it("runs writes to one slot in order, one at a time", async () => {
    const queue = createWriteQueue();
    const log: string[] = [];
    const first = deferred<void>();
    const a = queue.run(["1|lunch|0"], async () => {
      log.push("add start");
      await first.promise;
      log.push("add end");
    });
    const b = queue.run(["1|lunch|0"], async () => {
      log.push("clear");
    });
    await tick();
    expect(log).toEqual(["add start"]);
    first.resolve();
    await Promise.all([a, b]);
    expect(log).toEqual(["add start", "add end", "clear"]);
  });

  it("a late add answer is superseded by the clear queued after it", async () => {
    const queue = createWriteQueue();
    const answer = deferred<void>();
    let applied = false;
    const add = queue.run(["1|lunch|0"], async (isCurrent) => {
      await answer.promise;
      if (isCurrent("1|lunch|0")) applied = true;
    });
    let clearCurrent = false;
    const clear = queue.run(["1|lunch|0"], async (isCurrent) => {
      clearCurrent = isCurrent("1|lunch|0");
    });
    answer.resolve();
    await Promise.all([add, clear]);
    expect(applied).toBe(false);
    expect(clearCurrent).toBe(true);
  });

  it("writes to other slots run side by side and stay current", async () => {
    const queue = createWriteQueue();
    const slow = deferred<void>();
    const log: string[] = [];
    const a = queue.run(["1|lunch|0"], async () => {
      await slow.promise;
      log.push("lunch");
    });
    const b = queue.run(["1|dinner|0"], async (isCurrent) => {
      log.push(`dinner ${isCurrent("1|dinner|0")}`);
    });
    await b;
    expect(log).toEqual(["dinner true"]);
    slow.resolve();
    await a;
  });

  it("a failed write does not stall the slot", async () => {
    const queue = createWriteQueue();
    const failing = queue.run(["k"], async () => {
      throw new Error("refused");
    });
    await expect(failing).rejects.toThrow("refused");
    await expect(queue.run(["k"], async () => "next")).resolves.toBe("next");
    await tick();
    expect(queue.busy()).toBe(false);
  });

  it("an exclusive write waits for every write in flight and holds back later ones", async () => {
    const queue = createWriteQueue();
    const log: string[] = [];
    const slow = deferred<void>();
    const a = queue.run(["1|lunch|0"], async () => {
      await slow.promise;
      log.push("lunch");
    });
    const swap = queue.run(
      ["1|morning|0", "1|night|0"],
      async () => {
        log.push("swap");
      },
      { exclusive: true },
    );
    const later = queue.run(["2|dinner|0"], async () => {
      log.push("later");
    });
    await tick();
    expect(log).toEqual([]);
    slow.resolve();
    await Promise.all([a, swap, later]);
    expect(log).toEqual(["lunch", "swap", "later"]);
  });

  it("an exclusive write sees which slots a later write claimed", async () => {
    const queue = createWriteQueue();
    const gate = deferred<void>();
    let current: Record<string, boolean> = {};
    const swap = queue.run(
      ["1|morning|0", "1|night|0"],
      async (isCurrent) => {
        await gate.promise;
        current = { morning: isCurrent("1|morning|0"), night: isCurrent("1|night|0"), other: isCurrent("3|stay|0") };
      },
      { exclusive: true },
    );
    const after = queue.run(["1|night|0"], async () => undefined);
    gate.resolve();
    await Promise.all([swap, after]);
    expect(current).toEqual({ morning: true, night: false, other: true });
  });
});
