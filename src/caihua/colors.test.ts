import { describe, it, expect } from 'vitest';
import { buildSeedProject } from '../lib/seed';
import { checkColorRules, colorZones } from './colors';
import { computeLayout, DEFAULT_RULES } from './rules';
import type { Project } from '../types';

describe('青绿相间 + 相邻错开', () => {
  it('测试殿自动配色无任何违规', () => {
    const p = buildSeedProject();
    const v = checkColorRules(p);
    expect(v).toEqual([]);
  });

  it('每根构件相邻色区颜色不同', () => {
    const p = buildSeedProject();
    for (const m of p.members) {
      const l = computeLayout(m, DEFAULT_RULES);
      const zones = colorZones(m, l).sort((a, b) => a.rect.x - b.rect.x);
      for (let i = 1; i < zones.length; i++) {
        if (Math.abs(zones[i - 1].rect.x + zones[i - 1].rect.w - zones[i].rect.x) < 1.5) {
          expect(zones[i].color, `${m.name} ${zones[i].zoneId}`).not.toBe(zones[i - 1].color);
        }
      }
    }
  });

  it('手动把枋心改成与找头同色后能检出内部违规', () => {
    const p = buildSeedProject();
    const m = p.members[0];
    const l = computeLayout(m, DEFAULT_RULES);
    const zones = colorZones(m, l);
    const zt = zones.find((z) => z.zoneId === 'zhaotouL')!;
    m.draft.colorOverrides = { fangxin: zt.color };
    const v = checkColorRules(p as Project);
    expect(v.some((x) => x.kind === 'adjacent-zone' && x.memberId === m.id)).toBe(true);
  });

  it('相邻开间构件基调自动错开', () => {
    const p = buildSeedProject();
    const runs = ['前檐-额枋', '后檐-额枋'];
    for (const run of runs) {
      const seg = p.members.filter((m) => m.grid?.run === run).sort((a, b) => (a.grid!.bay! - b.grid!.bay!));
      for (let i = 1; i < seg.length; i++) {
        const ca = colorZones(seg[i - 1], computeLayout(seg[i - 1], DEFAULT_RULES)).find((z) => z.zoneId === 'fangxin')!.color;
        const cb = colorZones(seg[i], computeLayout(seg[i], DEFAULT_RULES)).find((z) => z.zoneId === 'fangxin')!.color;
        expect(ca).not.toBe(cb);
      }
    }
  });
});
