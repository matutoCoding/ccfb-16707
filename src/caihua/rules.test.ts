import { describe, it, expect } from 'vitest';
import {
  computeLayout,
  chooseComposition,
  DEFAULT_RULES,
  developFaceHeight,
  type RuleParams,
} from './rules';
import type { Member } from '../types';

function fakeMember(lengthMm: number, heightMm = 500, extra: Partial<Member> = {}): Member {
  return {
    id: 'm1',
    code: 'T-1',
    name: '测试构件',
    category: 'fang',
    lengthMm,
    heightMm,
    section: { shape: 'rect', widthMm: 300, heightMm },
    curved: false,
    draft: {
      style: 'xuanzi',
      grade: '',
      heziMode: 'off',
      patternIds: {},
      foil: 'kujin',
      goldRegions: {},
      lifen: true,
      colorOverrides: {},
    },
    ...extra,
  };
}

describe('分三停', () => {
  it('任意长度三停等长且总和等于全长', () => {
    for (let L = 120; L <= 24000; L += 137) {
      const l = computeLayout(fakeMember(L), DEFAULT_RULES);
      expect(l.thirdWidthMm).toBeCloseTo(L / 3, 6);
      expect(l.fangxin.x).toBeCloseTo(L / 3, 6);
      expect(l.fangxin.w).toBeCloseTo(L / 3, 6);
      expect(l.tingL.w + l.fangxin.w + l.tingR.w).toBeCloseTo(L, 6);
      // 左右停对称
      expect(l.tingR.x).toBeCloseTo(L - L / 3, 6);
    }
  });

  it('所有区域不越界、不重叠（左右镜像）', () => {
    for (let L = 300; L <= 12000; L += 211) {
      const l = computeLayout(fakeMember(L, 480), DEFAULT_RULES);
      const left = [l.gutouL, l.heziL, l.zhaotouL].filter(Boolean) as { x: number; w: number }[];
      let cursor = 0;
      for (const r of left.sort((a, b) => a.x - b.x)) {
        expect(r.x + r.w).toBeLessThanOrEqual(l.fangxin.x + 0.001);
        expect(r.x).toBeGreaterThanOrEqual(cursor - 0.001);
        cursor = r.x + r.w;
      }
      // 右侧区域与左侧镜像
      expect(l.zhaotouR.x).toBeCloseTo(L - l.zhaotouL.x - l.zhaotouL.w, 6);
      expect(l.zhaotouL.w).toBeCloseTo(l.zhaotouR.w, 6);
      expect(l.gutouR.x).toBeCloseTo(L - l.gutouL.w, 6);
      if (l.heziL && l.heziR) expect(l.heziR.x).toBeCloseTo(L - l.heziL.x - l.heziL.w, 6);
      expect(l.compL.key).toBe(l.compR.key);
    }
  });

  it('过短构件给出 error 级提示而不是抛异常', () => {
    const l = computeLayout(fakeMember(180, 600), DEFAULT_RULES);
    expect(l.warnings.some((w) => w.level === 'error')).toBe(true);
  });

  it('0 与非法尺寸不抛异常', () => {
    expect(() => computeLayout(fakeMember(0), DEFAULT_RULES)).not.toThrow();
    expect(() => computeLayout(fakeMember(Number.NaN), DEFAULT_RULES)).not.toThrow();
  });
});

describe('旋花路数', () => {
  const p: RuleParams = { ...DEFAULT_RULES };
  const H = 460;
  it('找头越长，份数/路数单调不减', () => {
    let prevUnits = 0;
    for (let z = 120; z <= 6000; z += 7) {
      const c = chooseComposition(z, H, p);
      expect(c.units).toBeGreaterThanOrEqual(prevUnits);
      prevUnits = c.units;
    }
  });

  it('极短找头判定不可行并由布局产生 too-short 提示', () => {
    const c = chooseComposition(40, H, p);
    expect(c.feasible).toBe(false);
    const l = computeLayout(fakeMember(900, H, {
      draft: { ...fakeMember(900).draft, heziMode: 'off' },
    }), p);
    // 900 长 / 460 高：每停 300，扣箍头后找头很短，应有报错或警告
    expect(l.warnings.length).toBeGreaterThan(0);
  });

  it('典型长度落在一整两破及其加路区间', () => {
    // 找头净长 ~ 2*净高 应接近一整两破(m=4)
    const c = chooseComposition(2 * H * 0.92, H, p);
    expect([4, 5]).toContain(c.units);
    expect(c.name).toContain('一整两破');
  });

  it('超长找头能继续给出更多路数而不封顶报错', () => {
    const c = chooseComposition(20000, H, p);
    expect(c.units).toBeGreaterThan(20);
    expect(c.name).toMatch(/路/);
  });
});

describe('确定性', () => {
  it('同一参数计算两次结果完全一致（含指纹）', () => {
    for (const L of [1234, 3333, 5400, 8888]) {
      const m = fakeMember(L, 520);
      const a = computeLayout(m, DEFAULT_RULES);
      const b = computeLayout(structuredClone(m), DEFAULT_RULES);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.fingerprint).toBe(b.fingerprint);
      expect(a.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it('长度微增不会让指纹反复横跳（相同谱式时几何连续变化）', () => {
    const f1 = computeLayout(fakeMember(5000), DEFAULT_RULES).fingerprint;
    const f2 = computeLayout(fakeMember(5001), DEFAULT_RULES).fingerprint;
    expect(typeof f1).toBe('string');
    expect(f1).not.toBe(f2); // 几何数值变了，指纹应当变
  });
});

describe('截面展开', () => {
  it('圆檩按包角展开成弧长', () => {
    const d = 400;
    const r = developFaceHeight({
      heightMm: d,
      curved: true,
      section: { shape: 'round', widthMm: d, heightMm: d, diameterMm: d, arcAngleDeg: 180 },
    });
    expect(r.faceHeightMm).toBeCloseTo((Math.PI * d) / 2, 3);
    expect(r.developed).toBe(true);
  });
  it('矩形构件不展开，面高即高度', () => {
    const r = developFaceHeight(fakeMember(4000, 620));
    expect(r.faceHeightMm).toBe(620);
    expect(r.developed).toBe(false);
  });
});
