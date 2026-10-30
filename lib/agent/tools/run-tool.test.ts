import { describe, expect, it } from "vitest";

import { withProgress } from "./run-tool";

async function drain<P, R>(generator: AsyncGenerator<P, R>) {
  const seen: P[] = [];
  let step = await generator.next();
  while (!step.done) {
    seen.push(step.value);
    step = await generator.next();
  }
  return { seen, result: step.value };
}

describe("withProgress", () => {
  it("yields what the work reports, then returns its result", async () => {
    const { seen, result } = await drain(
      withProgress<number, string>(async (report) => {
        report(1);
        await new Promise((resolve) => setTimeout(resolve, 5));
        report(2);
        return "done";
      }),
    );
    expect(seen).toEqual([1, 2]);
    expect(result).toBe("done");
  });

  it("does not lose a report made just before the work ends", async () => {
    const { seen } = await drain(
      withProgress<number, void>(async (report) => {
        report(7);
      }),
    );
    expect(seen).toEqual([7]);
  });

  it("passes the work's failure on", async () => {
    const generator = withProgress<number, void>(async () => {
      throw new Error("no answer");
    });
    await expect(drain(generator)).rejects.toThrow("no answer");
  });
});
