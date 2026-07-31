import { computeNewWac } from './wac';

describe('computeNewWac', () => {
  it('adopts receipt cost when old WAC is null', () => {
    expect(computeNewWac(0, null, [{ quantity: 10, unitCost: 100 }])).toBe(100);
  });

  it('adopts receipt cost when old qty is zero (had cost, no stock)', () => {
    expect(computeNewWac(0, 80, [{ quantity: 5, unitCost: 120 }])).toBe(120);
  });

  it('blends old and new when both known', () => {
    // 10 @ 100 (=1000) + 10 @ 150 (=1500) = 2500 / 20 = 125
    expect(
      computeNewWac(10, 100, [{ quantity: 10, unitCost: 150 }]),
    ).toBe(125);
  });

  it('aggregates multiple receive lines for the same product', () => {
    // 20 @ 100 (=2000) + 5 @ 200 (=1000) + 5 @ 300 (=1500) = 4500 / 30 = 150
    expect(
      computeNewWac(20, 100, [
        { quantity: 5, unitCost: 200 },
        { quantity: 5, unitCost: 300 },
      ]),
    ).toBe(150);
  });

  it('rounds to nearest whole unit', () => {
    // 3 @ 100 (=300) + 2 @ 133 (=266) = 566 / 5 = 113.2 → 113
    expect(computeNewWac(3, 100, [{ quantity: 2, unitCost: 133 }])).toBe(113);
    // 3 @ 100 (=300) + 2 @ 134 (=268) = 568 / 5 = 113.6 → 114
    expect(computeNewWac(3, 100, [{ quantity: 2, unitCost: 134 }])).toBe(114);
  });

  it('treats negative old qty as unknown baseline', () => {
    expect(computeNewWac(-5, 100, [{ quantity: 10, unitCost: 200 }])).toBe(200);
  });
});
