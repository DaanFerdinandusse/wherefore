// The tag names that say how a place feels: what a friend would call someone's
// taste. Pure; the chat's first message and the traveler's letter both read it.

const FEEL = /^(cozy|intimate|lively|chic|rustic|moody|romantic|trendy|hip|vintage|authentic|bustling|stylish|elegant|charming|classic)$/i;

export function isFeelWord(name: string): boolean {
  return FEEL.test(name.trim());
}
