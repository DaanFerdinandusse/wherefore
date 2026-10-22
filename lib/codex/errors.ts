import { z } from "zod";

// Typed failures of the subscription endpoint. The message is written for the
// advisor (the dock shows it as is), so it names the problem and the recovery
// and never names the model vendor.

export class CodexUsageLimitError extends Error {
  readonly resetsAt: Date | undefined;
  readonly planType: string | undefined;

  constructor({ resetsAt, planType }: { resetsAt?: Date; planType?: string }) {
    super(usageLimitMessage(resetsAt));
    this.name = "CodexUsageLimitError";
    this.resetsAt = resetsAt;
    this.planType = planType;
  }
}

export function usageLimitMessage(resetsAt: Date | undefined, now = Date.now()): string {
  if (!resetsAt) return "Subscription limit reached. Try again later.";
  const minutes = Math.max(1, Math.round((resetsAt.getTime() - now) / 60_000));
  if (minutes < 90) return `Subscription limit reached, resets in ${minutes} min.`;
  const hours = Math.round(minutes / 60);
  return `Subscription limit reached, resets in ${hours} h.`;
}

const usageLimitBodySchema = z.object({
  error: z.object({
    type: z.string().optional(),
    code: z.string().optional(),
    plan_type: z.string().optional(),
    resets_at: z.number().optional(),
    resets_in_seconds: z.number().optional(),
  }),
});

/**
 * Reads a 429 body. Returns the typed error for a usage-limit answer and
 * undefined for any other 429 (a plain rate limit is retryable upstream).
 */
export function parseUsageLimit(status: number, bodyText: string, now = Date.now()): CodexUsageLimitError | undefined {
  if (status !== 429) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch {
    return undefined;
  }
  const parsed = usageLimitBodySchema.safeParse(json);
  if (!parsed.success) return undefined;
  const { type, code, plan_type, resets_at, resets_in_seconds } = parsed.data.error;
  const kind = `${type ?? ""} ${code ?? ""}`;
  if (!/usage_limit_reached|usage_not_included/.test(kind)) return undefined;
  const resetsAt =
    resets_at !== undefined
      ? new Date(resets_at * 1000)
      : resets_in_seconds !== undefined
        ? new Date(now + resets_in_seconds * 1000)
        : undefined;
  return new CodexUsageLimitError({ resetsAt, planType: plan_type });
}
