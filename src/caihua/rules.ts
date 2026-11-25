// ============================================================================
// 起谱规则引擎（清式官式彩画构图）
// ----------------------------------------------------------------------------
// 设计原则：
//   1. 全部为纯函数，输出只取决于输入尺寸与 RuleParams；
//      不使用 Date.now / Math.random，因此同一套参数刷新后谱子完全一致。
//   2. “分三停”严格按 fangxinRatio(默认 1/3)：中停为枋心，左右停等长。
//   3. 找头(藻头)旋花以“旋花径 d”为模数，以半径 u=d/2 为一“份”，
//      按找头净长自动选择 勾丝咬 / 喜相逢 / 一整两破 / 加 N 路 ……，
//      长度增长路数单调增加；任何长度都给得出布局，放不下时返回 warning。
//   4. 关键比例均为则例默认值，可在“设置”中按流派/斗口调整。
// ============================================================================

import type { Member, SectionInfo } from '../types';

export interface RuleParams {
  /** 枋心占全长比例，清式“分三停”默认 1/3 */
  fangxinRatio: number;
  /** 左右停各占比例，默认 (1-1/3)/2 = 1/3（派生，不直接改） */
  /** 箍头宽 / 构件面高 */
  gutouHeightRatio: number;
  gutouMinMm: number;
  gutouMaxRatioOfTing: number;
  /** 大边(外框线路)宽 / 面高 */
  borderHeightRatio: number;
  /** 找头净高相对 contentH 的系数 -> 理想旋花径 d0 */
  flowerHeightRatio: number;
  /** 允许的旋花径区间（相对找头净高） */
  flowerMinRatio: number;
  flowerMaxRatio: number;
  /** 自动加盒子的“份数”阈值：无盒时 m 达到该值即考虑加盒子 */
  heziTriggerUnits: number;
  /** 最多“加几路”的命名上限，超过后转为多整花命名 */
  maxNamedLanes: number;
  /** 极短构件的绝对下限余量(mm)，用于报错 */
  absoluteMinMm: number;
}

export const DEFAULT_RULES: RuleParams = {
  fangxinRatio: 1 / 3,
  gutouHeightRatio: 0.52,
  gutouMinMm: 90,
  gutouMaxRatioOfTing: 0.42,
  borderHeightRatio: 0.075,
  flowerHeightRatio: 0.92,
  flowerMinRatio: 0.6,
  flowerMaxRatio: 1.02,
  heziTriggerUnits: 7,
  maxNamedLanes: 12,
  absoluteMinMm: 60,
};

export interface MmRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RuleWarning {
  code:
    | 'zhaotou-too-short'
    | 'member-too-short'
    | 'gutou-clamped'
    | 'hezi-skipped'
    | 'zhaotou-very-long'
    | 'degenerate';
  level: 'error' | 'warn' | 'info';
  message: string;
}

export interface CompositionChoice {
  /** 谱式稳定 key，如 gousiyao / xixiangfeng / yzlp / yzlp+j2 */
  key: string;
  /** 传统名称 */
  name: string;
  /** 找头长折合的“半径份数” m（Z = m·d/2） */
  units: number;
  /** 整旋花数 */
  whole: number;
  /** 破旋花(半花)数 */
  halves: number;
  /** “加几路”的路数（0 表示基本式） */
  lanes: number;
  /** 实际旋花径 mm */
  diameterMm: number;
  feasible: boolean;
  warnings: RuleWarning[];
}

export interface DraftLayout {
  lengthMm: number;
  faceHeightMm: number;
  developed: boolean;
  /** 展开说明 */
  developNote: string;
  borderMm: number;
  content: MmRect;
  thirdWidthMm: number;
  fangxin: MmRect;
  tingL: MmRect;
  tingR: MmRect;
  gutouL: MmRect;
  gutouR: MmRect;
  heziL?: MmRect;
  heziR?: MmRect;
  zhaotouL: MmRect;
  zhaotouR: MmRect;
  compL: CompositionChoice;
  compR: CompositionChoice;
  warnings: RuleWarning[];
  /** 布局数值指纹（cyrb53），用于一致性校验 */
  fingerprint: string;
}

// ----------------------------------------------------------------------------
// 截面展开：弧面/圆形构件按截面弧长展开成谱面高
// ----------------------------------------------------------------------------
export function developFaceHeight(member: Pick<Member, 'heightMm' | 'section' | 'curved'>): {
  faceHeightMm: number;
  developed: boolean;
  note: string;
} {
  const s: SectionInfo = member.section;
  if (s.shape === 'round') {
    const d = s.diameterMm || member.heightMm || s.heightMm;
    const angle = s.arcAngleDeg ?? 180;
    const arc = (Math.PI * d * angle) / 360; // R·θ = d/2 · θ(rad)
    return {
      faceHeightMm: arc,
      developed: true,
      note: `圆檩径 ${Math.round(d)}，按包角 ${angle}° 展开，弧长 ${arc.toFixed(0)}mm`,
    };
  }
  if (s.shape === 'arc' && s.radiusMm && s.arcAngleDeg) {
    const arc = (2 * Math.PI * s.radiusMm * s.arcAngleDeg) / 360;
    return {
      faceHeightMm: arc,
      developed: true,
      note: `弧面 R${Math.round(s.radiusMm)} × ${s.arcAngleDeg}° 展开，弧长 ${arc.toFixed(0)}mm`,
    };
  }
  const h = member.heightMm || s.heightMm || s.widthMm;
  return { faceHeightMm: h, developed: false, note: '' };
}

// ----------------------------------------------------------------------------
// 谱式命名：份数 m -> 传统构图名称与整/破花结构
// ----------------------------------------------------------------------------
export function nameComposition(m: number, p: RuleParams): Pick<CompositionChoice, 'key' | 'name' | 'whole' | 'halves' | 'lanes'> {
  if (m <= 1) return { key: 'gousiyao', name: '勾丝咬', whole: 0, halves: 2, lanes: 0 };
  if (m === 2) return { key: 'xixiangfeng', name: '喜相逢', whole: 0, halves: 2, lanes: 0 };
  if (m === 3) return { key: 'xixiangfeng-j1', name: '喜相逢加一路', whole: 1, halves: 2, lanes: 1 };
  // m>=4：一整两破为底(m=4)，每多 1 份“加一路”
  const extra = m - 4;
  const lanes = extra;
  // 每多出 2 份可再安置一朵整花（一径=2 份）
  const whole = 1 + Math.floor(extra / 2);
  if (lanes === 0) return { key: 'yzlp', name: '一整两破', whole: 1, halves: 2, lanes: 0 };
  if (lanes <= p.maxNamedLanes) {
    return { key: `yzlp+j${lanes}`, name: `一整两破加${lanes}路`, whole, halves: 2, lanes };
  }
  return {
    key: `${whole}z${lanes}`,
    name: `${whole}整两破加${lanes}路`,
    whole,
    halves: 2,
    lanes,
  };
}

// ----------------------------------------------------------------------------
// 按找头长度 Z、净高 H 选择旋花谱式（确定性，路数随长度单调不减）
// ----------------------------------------------------------------------------
export function chooseComposition(zMm: number, clearHMm: number, p: RuleParams): CompositionChoice {
  const warnings: RuleWarning[] = [];
  if (!(zMm > 0) || !(clearHMm > 0)) {
    const named = nameComposition(1, p);
    return { ...named, units: 1, diameterMm: 0, feasible: false, warnings: [] };
  }
  const d0 = clearHMm * p.flowerHeightRatio;
  const dMin = clearHMm * p.flowerMinRatio;
  const dMax = clearHMm * p.flowerMaxRatio;

  // 需要考察的最大份数：d=2Z/m >= dMin  =>  m <= 2Z/dMin
  const mMax = Math.max(4, Math.ceil((2 * zMm) / Math.max(1, dMin)) + 1);
  let best: { m: number; d: number; score: number; feasible: boolean } | null = null;

  for (let m = 1; m <= mMax; m++) {
    const d = (2 * zMm) / m;
    const feasible = d >= dMin && d <= dMax;
    // 可行者按“最接近理想旋花径”择优；不可行者按越界程度打分（加惩罚）
    let score: number;
    if (feasible) {
      score = Math.abs(d - d0);
    } else if (d > dMax) {
      score = 1e9 + (d - dMax); // 花过大，优先换大 m
    } else {
      score = 2e9 + (dMin - d) * 1000; // 花过小
    }
    if (!best || score < best.score - 1e-9 || (Math.abs(score - best.score) <= 1e-9 && m < best.m)) {
      best = { m, d, score, feasible };
    }
  }

  const chosen = best!;
  const named = nameComposition(chosen.m, p);
  const minZ = dMin / 2; // 勾丝咬(m=1)所需最小找头长
  const feasible = chosen.feasible && zMm >= minZ;

  if (zMm < minZ) {
    warnings.push({
      code: 'zhaotou-too-short',
      level: 'error',
      message: `找头净长仅 ${zMm.toFixed(0)}mm，最小“勾丝咬”也需约 ${minZ.toFixed(0)}mm（净高 ${clearHMm.toFixed(0)}mm），放不下旋花`,
    });
  } else if (!chosen.feasible) {
    warnings.push({
      code: 'zhaotou-too-short',
      level: 'warn',
      message: `找头长 ${zMm.toFixed(0)}mm 与净高 ${clearHMm.toFixed(0)}mm 比例偏殊，旋花径已超出常规则例区间`,
    });
  }
  if (chosen.m >= p.heziTriggerUnits + 4) {
    warnings.push({
      code: 'zhaotou-very-long',
      level: 'info',
      message: `找头过长（合 ${chosen.m} 份 / ${named.name}），宜增设盒子或调整构件分段`,
    });
  }

  return {
    ...named,
    units: chosen.m,
    diameterMm: chosen.d,
    feasible,
    warnings,
  };
}

// ----------------------------------------------------------------------------
// 稳定字符串哈希（cyrb53 变体），仅用于指纹展示
// ----------------------------------------------------------------------------
export function hash53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const h = (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  return h;
}

const rect = (x: number, y: number, w: number, h: number): MmRect => ({ x, y, w, h });

// ----------------------------------------------------------------------------
// 主入口：计算一根构件的完整分三停布局
// ----------------------------------------------------------------------------
export function computeLayout(
  member: Pick<Member, 'lengthMm' | 'heightMm' | 'section' | 'curved' | 'draft'>,
  p: RuleParams = DEFAULT_RULES,
): DraftLayout {
  const warnings: RuleWarning[] = [];
  const L = Math.max(0, Number(member.lengthMm) || 0);
  const dev = developFaceHeight(member);
  const H = Math.max(1, dev.faceHeightMm);

  if (!(L > 0) || L < p.absoluteMinMm) {
    warnings.push({
      code: 'degenerate',
      level: 'error',
      message: `构件长度 ${L}mm 无效或过短，无法起谱`,
    });
  }

  const border = H * p.borderHeightRatio;
  const content = rect(0, border, L, Math.max(1, H - 2 * border));

  // —— 分三停 ——
  const fangxinW = L * p.fangxinRatio;
  const tingW = (L - fangxinW) / 2;
  const fx = rect(tingW, content.y, fangxinW, content.h);
  const tingL = rect(0, content.y, tingW, content.h);
  const tingR = rect(L - tingW, content.y, tingW, content.h);

  // —— 箍头宽 ——
  let g = H * p.gutouHeightRatio;
  g = Math.max(g, p.gutouMinMm * Math.min(1, H / 300)); // 小构件上箍头最小宽按比例收缩
  const gCap = tingW * p.gutouMaxRatioOfTing;
  if (g > gCap && tingW > 0) {
    warnings.push({
      code: 'gutou-clamped',
      level: 'warn',
      message: `箍头宽 ${g.toFixed(0)}mm 超过一停的 ${(p.gutouMaxRatioOfTing * 100).toFixed(0)}%，已收至 ${gCap.toFixed(0)}mm`,
    });
    g = Math.max(20, gCap);
  }

  const gutouL = rect(0, content.y, g, content.h);
  const gutouR = rect(L - g, content.y, g, content.h);

  // —— 盒子 / 找头 ——
  // 先按“无盒”估算，决定 auto 是否加盒
  const zNoBox = Math.max(0, tingW - g);
  const compNoBox = chooseComposition(zNoBox, content.h, p);

  let heziOn = member.draft?.heziMode === 'on';
  if (member.draft?.heziMode === 'auto' || member.draft?.heziMode == null) {
    heziOn = compNoBox.units >= p.heziTriggerUnits;
  }

  let q = 0;
  let heziL: MmRect | undefined;
  let heziR: MmRect | undefined;
  let z: number;

  if (heziOn) {
    q = content.h; // 盒子为方形，边长取大边内净高
    const zWithBox = tingW - g - q;
    const trial = chooseComposition(Math.max(0, zWithBox), content.h, p);
    const minZ = content.h * p.flowerMinRatio * 0.5;
    if (zWithBox < minZ) {
      warnings.push({
        code: 'hezi-skipped',
        level: 'info',
        message: '预留盒子后找头过短，已自动取消盒子以保证旋花合规',
      });
      heziOn = false;
      q = 0;
      z = zNoBox;
    } else {
      heziL = rect(g, content.y, q, q);
      heziR = rect(L - g - q, content.y, q, q);
      z = zWithBox;
    }
  } else {
    z = zNoBox;
  }

  const zxL = g + q;
  const zhaotouL = rect(zxL, content.y, Math.max(0, z), content.h);
  const zhaotouR = rect(L - g - q - z, content.y, Math.max(0, z), content.h);

  const compL = chooseComposition(z, content.h, p);
  const compR = compL; // 左右对称，保证镜像一致
  warnings.push(...compL.warnings);

  // 整根构件尺度校验：一停之内至少放得下箍头 + 最小勾丝咬
  const minZabs = content.h * p.flowerMinRatio * 0.5;
  if (tingW < g + minZabs) {
    warnings.push({
      code: 'member-too-short',
      level: 'error',
      message: `全长 ${L.toFixed(0)}mm 对面高 ${H.toFixed(0)}mm 过短：每停 ${tingW.toFixed(
        0,
      )}mm 放不下箍头(${g.toFixed(0)})与最小旋花(${minZabs.toFixed(0)})，请核对构件尺寸或等级做法`,
    });
  }

  const layout: DraftLayout = {
    lengthMm: L,
    faceHeightMm: H,
    developed: dev.developed,
    developNote: dev.note,
    borderMm: border,
    content,
    thirdWidthMm: tingW,
    fangxin: fx,
    tingL,
    tingR,
    gutouL,
    gutouR,
    heziL,
    heziR,
    zhaotouL,
    zhaotouR,
    compL,
    compR,
    warnings,
    fingerprint: '',
  };

  layout.fingerprint = fingerprintLayout(layout, p, member.draft?.compositionOverride);
  return layout;
}

/** 仅对几何/谱式关键数值生成稳定指纹（不含颜色手改，颜色另算） */
export function fingerprintLayout(l: DraftLayout, p: RuleParams, compOverride?: string): string {
  const canonical = JSON.stringify({
    L: Math.round(l.lengthMm * 100) / 100,
    H: Math.round(l.faceHeightMm * 100) / 100,
    r: p.fangxinRatio,
    g: Math.round(l.gutouL.w * 100) / 100,
    q: l.heziL ? Math.round(l.heziL.w * 100) / 100 : 0,
    z: Math.round(l.zhaotouL.w * 100) / 100,
    m: l.compL.units,
    d: Math.round(l.compL.diameterMm * 100) / 100,
    c: l.compL.key,
    co: compOverride ?? null,
  });
  return hash53(canonical);
}

/**
 * 若用户手动指定谱式，按指定份数反算旋花径并覆盖自动选择。
 * 仍返回 feasible 提示，不破坏布局几何。
 */
export function withCompositionOverride(layout: DraftLayout, overrideKey: string | undefined, p: RuleParams): DraftLayout {
  if (!overrideKey || overrideKey === 'auto') return layout;
  const m = keyToUnits(overrideKey);
  if (m == null) return layout;
  const z = layout.zhaotouL.w;
  const d = m > 0 ? (2 * z) / m : layout.compL.diameterMm;
  const named = nameComposition(m, p);
  const dMin = layout.content.h * p.flowerMinRatio;
  const dMax = layout.content.h * p.flowerMaxRatio;
  const comp: CompositionChoice = {
    ...named,
    units: m,
    diameterMm: d,
    feasible: d >= dMin && d <= dMax,
    warnings: [],
  };
  return { ...layout, compL: comp, compR: comp };
}

export function keyToUnits(key: string): number | null {
  if (key === 'gousiyao') return 1;
  if (key === 'xixiangfeng') return 2;
  const j1 = key.match(/^xixiangfeng-j(\d+)$/);
  if (j1) return 2 + Number(j1[1]);
  if (key === 'yzlp') return 4;
  const j = key.match(/^yzlp\+j(\d+)$/);
  if (j) return 4 + Number(j[1]);
  const multi = key.match(/^\d+z(\d+)$/);
  if (multi) return 4 + Number(multi[1]);
  return null;
}
