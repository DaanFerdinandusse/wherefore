import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAutosaver, mergePatch, type SaveResult, type SaveStatus } from "./autosave";

type Fields = { name: string; notes: string };

function deferred() {
  let resolve!: (value: SaveResult) => void;
  const promise = new Promise<SaveResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("mergePatch", () => {
  it("lets later keys win and keeps earlier ones", () => {
    expect(mergePatch<Fields>({ name: "An", notes: "x" }, { name: "Ana" })).toEqual({ name: "Ana", notes: "x" });
  });

  it("ignores undefined values and starts from null", () => {
    expect(mergePatch<Fields>(null, { name: "Ana", notes: undefined })).toEqual({ name: "Ana" });
  });
});

describe("createAutosaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces edits into one merged save", async () => {
    const save = vi.fn(async () => ({ ok: true }) as const);
    const statuses: SaveStatus["kind"][] = [];
    const saver = createAutosaver<Fields>({ delayMs: 500, save, onStatus: (s) => statuses.push(s.kind) });

    saver.schedule({ name: "A" });
    vi.advanceTimersByTime(300);
    saver.schedule({ name: "Ana" });
    saver.schedule({ notes: "Wine" });
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ name: "Ana", notes: "Wine" });
    expect(statuses.at(-1)).toBe("saved");
    expect(saver.busy()).toBe(false);
  });

  it("saves immediately when asked (the first keystroke of a new client)", async () => {
    const save = vi.fn(async () => ({ ok: true }) as const);
    const saver = createAutosaver<Fields>({ delayMs: 500, save });
    saver.schedule({ name: "L" }, { immediate: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledWith({ name: "L" });
  });

  it("never overlaps saves: edits during a save go next, merged", async () => {
    const first = deferred();
    const save = vi
      .fn<(patch: Partial<Fields>) => Promise<SaveResult>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ ok: true });
    const saver = createAutosaver<Fields>({ delayMs: 100, save });

    saver.schedule({ name: "Le" });
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);

    saver.schedule({ name: "Len" });
    saver.schedule({ name: "Lena" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);

    first.resolve({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ name: "Lena" });
  });

  it("keeps a failed patch and sends it with the next edit", async () => {
    const save = vi
      .fn<(patch: Partial<Fields>) => Promise<SaveResult>>()
      .mockResolvedValueOnce({ ok: false, error: "No client with that id." })
      .mockResolvedValue({ ok: true });
    const statuses: SaveStatus[] = [];
    const saver = createAutosaver<Fields>({ delayMs: 100, save, onStatus: (s) => statuses.push(s) });

    saver.schedule({ name: "Ana" });
    await vi.advanceTimersByTimeAsync(100);
    expect(statuses.at(-1)).toEqual({ kind: "error", message: "No client with that id." });
    expect(saver.busy()).toBe(true);

    saver.schedule({ notes: "Quiet rooms" });
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenLastCalledWith({ name: "Ana", notes: "Quiet rooms" });
    expect(statuses.at(-1)).toEqual({ kind: "saved" });
  });

  it("turns a thrown save into an error status", async () => {
    const save = vi.fn(async (): Promise<SaveResult> => {
      throw new Error("offline");
    });
    const statuses: SaveStatus[] = [];
    const saver = createAutosaver<Fields>({ delayMs: 10, save, onStatus: (s) => statuses.push(s) });
    saver.schedule({ name: "Ana" });
    await vi.advanceTimersByTimeAsync(10);
    expect(statuses.at(-1)?.kind).toBe("error");
  });

  it("flush sends the pending edit now; cancel drops it", async () => {
    const save = vi.fn(async () => ({ ok: true }) as const);
    const saver = createAutosaver<Fields>({ delayMs: 10_000, save });

    saver.schedule({ name: "Ana" });
    await saver.flush();
    expect(save).toHaveBeenCalledWith({ name: "Ana" });

    saver.schedule({ name: "Anna" });
    saver.cancel();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
