/** Text comparison helpers shared by rules — deterministic, locale-simple. */

export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,'’-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distance = new Array<number>(cols).fill(0).map((_, index) => index);
  for (let i = 1; i < rows; i++) {
    let previous = distance[0]!;
    distance[0] = i;
    for (let j = 1; j < cols; j++) {
      const current = distance[j]!;
      distance[j] = Math.min(
        distance[j]! + 1,
        distance[j - 1]! + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      previous = current;
    }
  }
  return distance[cols - 1]!;
}

/**
 * 0..1 similarity: exact normalized match, token-subset match ("Cruz, Maria"
 * vs "Maria Cruz"), then Levenshtein ratio. Good enough for handwriting-vs-
 * CRM comparisons; anything smarter belongs to a future AI-assisted matcher.
 */
export function similarity(a: string, b: string): number {
  const left = normalize(a);
  const right = normalize(b);
  if (left.length === 0 || right.length === 0) return 0;
  if (left === right) return 1;

  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const smaller = leftTokens.size <= rightTokens.size ? leftTokens : rightTokens;
  const larger = smaller === leftTokens ? rightTokens : leftTokens;
  if ([...smaller].every((token) => larger.has(token))) return 0.95;

  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}
