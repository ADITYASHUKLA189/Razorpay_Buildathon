export function normalize(ref: string): string {
  return ref.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function bigrams(str: string): string[] {
  const result: string[] = [];
  for (let i = 0; i < str.length - 1; i++) {
    result.push(str.slice(i, i + 2));
  }
  return result;
}

export function diceCoefficient(b1: string[], b2: string[]): number {
  if (b1.length === 0 && b2.length === 0) return 1;
  if (b1.length === 0 || b2.length === 0) return 0;

  let intersection = 0;
  const b2Copy = [...b2];
  for (const b of b1) {
    const idx = b2Copy.indexOf(b);
    if (idx !== -1) {
      intersection++;
      b2Copy.splice(idx, 1);
    }
  }
  return (2 * intersection) / (b1.length + b2.length);
}
