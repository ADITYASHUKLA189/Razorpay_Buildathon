import { describe, it, expect } from 'vitest';
import { normalize, bigrams, diceCoefficient } from './scoring';

describe('scoring utils', () => {
  it('normalizes correctly', () => {
    expect(normalize('STL-1001')).toBe('STL1001');
    expect(normalize('  a_b-c! 123  ')).toBe('ABC123');
  });

  it('generates bigrams correctly', () => {
    expect(bigrams('TEST')).toEqual(['TE', 'ES', 'ST']);
    expect(bigrams('A')).toEqual([]);
  });

  it('calculates dice coefficient correctly', () => {
    const b1 = bigrams('NIGHT');
    const b2 = bigrams('NACHT');
    expect(diceCoefficient(b1, b2)).toBeCloseTo(0.25); // NI, IG, GH, HT vs NA, AC, CH, HT. Intersection = [HT] -> 2*1/8 = 0.25
    expect(diceCoefficient(bigrams('TEST'), bigrams('TEST'))).toBe(1);
    expect(diceCoefficient(bigrams('AA'), bigrams('BB'))).toBe(0);
  });
});
