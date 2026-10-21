/** Join class name parts, dropping falsy ones, so no stray or missing spaces. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
