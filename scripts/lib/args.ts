import { parseArgs } from "node:util";

// Command line of scripts/seed-demo.ts. Pure: no env, no database.

export type SeedArgs =
  | { kind: "help" }
  | { kind: "run"; owner: { id: string } | { email: string }; reset: boolean };

export const USAGE = `Fill one advisor's workspace with demo data.

  npx tsx --conditions=react-server scripts/seed-demo.ts --owner <authUserId> [--reset]
  npx tsx --conditions=react-server scripts/seed-demo.ts --owner-email <email> [--reset]

  --owner        Neon Auth user id of the signed-in account
  --owner-email  Look the user up by email instead
  --reset        Delete this owner's clients, trips and saved places first
  --help         Show this help`;

export class ArgsError extends Error {}

export function parseSeedArgs(argv: string[]): SeedArgs {
  let values: { owner?: string; "owner-email"?: string; reset?: boolean; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        owner: { type: "string" },
        "owner-email": { type: "string" },
        reset: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
    }));
  } catch (error) {
    throw new ArgsError(error instanceof Error ? error.message : String(error));
  }
  if (values.help) return { kind: "help" };

  const id = values.owner?.trim();
  const email = values["owner-email"]?.trim();
  if (id && email) throw new ArgsError("Pass --owner or --owner-email, not both.");
  if (!id && !email) throw new ArgsError("Pass --owner <authUserId> or --owner-email <email>.");
  return { kind: "run", owner: id ? { id } : { email: email ?? "" }, reset: values.reset ?? false };
}
