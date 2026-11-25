import { describe, it, expect } from 'vitest';
import { planTiles, resolvePaper } from './tiles';

const base = {
  paper: 'A4' as const,
  orientation: 'auto' as const,
  marginMm: 8,
  overlapMm: 12,
};

describe('足尺分页', () => {
  it('短构件只要 1 页', () => {
    const p = planTiles({ ...base, lengthMm: 250, heightMm: 180 });
    expect(p.pageCount).toBe(1);
    expect(p.tiles).toHaveLength(1);
  });

  it('超长梁分成多列且页数=列×行', () => {
    const p = planTiles({ ...base, lengthMm: 12000, heightMm: 180 });
    expect(p.cols).toBeGreaterThan(20);
    expect(p.rows).toBe(1);
    expect(p.pageCount).toBe(p.cols * p.rows);
    expect(p.tiles).toHaveLength(p.pageCount);
  });

  it('每张瓦源矩形落在构件范围内且末页贴齐末端', () => {
    const L = 5400;
    const H = 560;
    const p = planTiles({ ...base, lengthMm: L, heightMm: H });
    for (const t of p.tiles) {
      expect(t.sx).toBeGreaterThanOrEqual(0);
      expect(t.sy).toBeGreaterThanOrEqual(0);
      expect(t.sx + t.sw).toBeLessThanOrEqual(L + 0.001);
      expect(t.sy + t.sh).toBeLessThanOrEqual(H + 0.001);
    }
    const lastCol = p.tiles.filter((t) => t.col === p.cols - 1);
    expect(lastCol[0].sx + lastCol[0].sw).toBeCloseTo(L, 3);
  });

  it('相邻列存在搭接 overlap', () => {
    const p = planTiles({ ...base, lengthMm: 6000, heightMm: 400 });
    if (p.cols >= 2) {
      const a = p.tiles.find((t) => t.row === 0 && t.col === 0)!;
      const b = p.tiles.find((t) => t.row === 0 && t.col === 1)!;
      expect(a.sx + a.sw).toBeGreaterThan(b.sx);
    }
  });

  it('auto 方向：长梁横向、高件纵向', () => {
    expect(resolvePaper({ ...base, lengthMm: 6000, heightMm: 500 }).orientation).toBe('landscape');
    expect(resolvePaper({ ...base, lengthMm: 300, heightMm: 900 }).orientation).toBe('portrait');
  });
});
