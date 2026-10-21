// Typed access to server env. Throws early with the variable name so a
// missing key fails at the first use, not deep in a request.
export function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === "" ? undefined : value;
}
