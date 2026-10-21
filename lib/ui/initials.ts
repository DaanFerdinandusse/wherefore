/**
 * Up to two initials for an avatar: "Ana Ruiz" -> "AR", "Clara" -> "C",
 * "Tom and Elise Varga" -> "TV" (first and last word, skipping "and").
 */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word && !/^(and|&)$/i.test(word));
  if (words.length === 0) return "";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}
