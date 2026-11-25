// ============================================================================
// 参数化纹样渲染器注册表 + 内置纹样实例
// 每个 PatternInstance 通过 renderer key 找到这里的纯绘制函数；
// 用户自建纹样 = 选一个 renderer + 调参数，因此可结构化存入 IndexedDB。
// ============================================================================

import type { PatternInstance, ParamSpec, UnitKind, PatternCategory, ColorKey } from '../types';
import type { Painter } from './painter';
import type { DraftLayout, MmRect } from './rules';

export interface PatternRC {
  R: Painter;
  zone: MmRect;
  layout: DraftLayout;
  instance: PatternInstance;
  /** 该色区按青绿相间规则得到的地色 */
  base: ColorKey;
  /** 与 base 相对的另一色 */
  alt: ColorKey;
}

export interface RendererMeta {
  label: string;
  units: UnitKind[];
  categories: PatternCategory[];
  schema: ParamSpec[];
  draw: (rc: PatternRC) => void;
}

const num = (ins: PatternInstance, key: string, dft: number): number => {
  const v = ins.params[key];
  return typeof v === 'number' ? v : dft;
};
const bool = (ins: PatternInstance, key: string, dft: boolean): boolean => {
  const v = ins.params[key];
  return typeof v === 'boolean' ? v : dft;
};
const str = (ins: PatternInstance, key: string, dft: string): string => {
  const v = ins.params[key];
  return typeof v === 'string' ? v : dft;
};

// ----------------------------------------------------------------------------
// 旋花 / 团花 基础母题
// ----------------------------------------------------------------------------
export function drawXuanhua(
  R: Painter,
  cx: number,
  cy: number,
  r: number,
  petals: number,
  region = 'xuanhua',
) {
  if (r <= 1) return;
  const rings = [
    { rr: r, n: petals, fill: 'qing' as const, dist: 0.5, len: 0.46, wid: 0.17 },
    { rr: r * 0.72, n: petals, fill: 'lv' as const, dist: 0.46, len: 0.4, wid: 0.16 },
    { rr: r * 0.46, n: Math.max(6, petals - 2), fill: 'qing' as const, dist: 0.4, len: 0.34, wid: 0.15 },
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2 + (ring.rr === r * 0.72 ? Math.PI / ring.n : 0);
      const d = ring.rr * ring.dist;
      R.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, ring.rr * ring.len, ring.rr * ring.wid, a, {
        fill: ring.fill,
        stroke: 'mo',
        lw: Math.max(0.25, r * 0.02),
        goldStroke: region,
        lifen: true,
      });
    }
  }
  // 旋眼（花心）
  R.circle(cx, cy, r * 0.2, { fill: 'xiang', stroke: 'mo', lw: r * 0.02 });
  R.circle(cx, cy, r * 0.13, { fill: null, stroke: 'mo', lw: r * 0.018, goldStroke: region, lifen: true });
  R.circle(cx, cy, r * 0.05, { fill: 'mo' });
}

/** 小栀花/金道冠（找头空档点缀） */
function drawZhi(R: Painter, cx: number, cy: number, s: number, region = 'xuanhua') {
  R.poly(
    [
      [cx, cy - s],
      [cx + s * 0.55, cy],
      [cx, cy + s],
      [cx - s * 0.55, cy],
    ],
    true,
    { fill: 'xiang', stroke: 'mo', lw: Math.max(0.2, s * 0.12), goldStroke: region, lifen: true },
  );
  R.circle(cx, cy, s * 0.22, { fill: 'qing', stroke: 'mo', lw: s * 0.08 });
}

interface FlowerPlace {
  cx: number;
  r: number;
  edge?: 'L' | 'R';
}

/** 依据谱式份数规划整花/破花位置（确定性） */
export function planFlowers(zone: MmRect, layout: DraftLayout): { flowers: FlowerPlace[]; fillers: [number, number][] } {
  const comp = layout.zhaotouL === zone ? layout.compL : layout.compR;
  const Z = zone.w;
  const d = comp.diameterMm > 0 ? comp.diameterMm : zone.h * 0.8;
  const r = d / 2;
  const flowers: FlowerPlace[] = [
    { cx: zone.x, r, edge: 'L' },
    { cx: zone.x + Z, r, edge: 'R' },
  ];
  const w = Math.max(1, comp.whole || 1);
  for (let i = 0; i < w; i++) {
    flowers.push({ cx: zone.x + (Z * (i + 1)) / (w + 1), r });
  }
  // 计算各花边界，在足够大的空档里放栀花
  const spans = flowers
    .map((f) => ({ c: f.cx, l: f.cx - f.r, rr: f.cx + f.r }))
    .sort((a, b) => a.c - b.c);
  const fillers: [number, number][] = [];
  const cy = zone.y + zone.h / 2;
  for (let i = 1; i < spans.length; i++) {
    const gapL = spans[i - 1].rr;
    const gapR = spans[i].l;
    const gap = gapR - gapL;
    if (gap > r * 0.5) {
      const n = Math.min(3, Math.max(1, Math.round(gap / (r * 0.7))));
      for (let k = 0; k < n; k++) fillers.push([gapL + (gap * (k + 1)) / (n + 1), cy]);
    }
  }
  return { flowers, fillers };
}

// ----------------------------------------------------------------------------
// 各 renderer
// ----------------------------------------------------------------------------
const renderers: Record<string, RendererMeta> = {
  // —— 箍头：竖向色带 + 连珠 ——
  'gutou-bands': {
    label: '箍头·整破色带',
    units: ['gutou'],
    categories: ['hexi', 'xuanzi', 'sushi'],
    schema: [
      { key: 'bands', label: '色带数', type: 'range', min: 2, max: 6, step: 1, default: 3 },
      { key: 'beads', label: '连珠', type: 'boolean', default: true },
    ],
    draw: ({ R, zone, instance }) => {
      const bands = Math.round(num(instance, 'bands', 3));
      const beads = bool(instance, 'beads', true);
      const w = zone.w;
      const bw = w / bands;
      for (let i = 0; i < bands; i++) {
        R.rect(zone.x + i * bw, zone.y, bw + 0.3, zone.h, {
          fill: i % 2 === 0 ? 'qing' : 'lv',
          stroke: 'mo',
          lw: 0.6,
        });
      }
      // 外箍头金线
      R.rect(zone.x, zone.y, w, zone.h, {
        fill: null,
        stroke: 'mo',
        lw: 1.4,
        goldStroke: 'gutou',
        lifen: true,
      });
      R.line(zone.x + w * 0.18, zone.y, zone.x + w * 0.18, zone.y + zone.h, {
        stroke: 'mo',
        lw: 0.8,
        goldStroke: 'gutou',
        lifen: true,
      });
      if (beads) {
        const n = Math.max(3, Math.floor(zone.h / Math.max(8, w * 0.16)));
        const br = Math.min(w * 0.07, zone.h / (n * 2.6));
        for (let i = 0; i < n; i++) {
          const y = zone.y + ((i + 0.5) / n) * zone.h;
          R.circle(zone.x + w * 0.86, y, br, {
            fill: 'jin',
            stroke: 'mo',
            lw: 0.4,
            goldFill: 'gutou',
            goldStroke: 'gutou',
          });
        }
      }
    },
  },

  // —— 苏式卡子 ——
  'gutou-kazi': {
    label: '箍头·苏式卡子',
    units: ['gutou'],
    categories: ['sushi'],
    schema: [{ key: 'petals', label: '卷瓣数', type: 'range', min: 2, max: 6, step: 1, default: 3 }],
    draw: ({ R, zone, instance, base }) => {
      const petals = Math.round(num(instance, 'petals', 3));
      R.rect(zone.x, zone.y, zone.w, zone.h, { fill: base, stroke: 'mo', lw: 0.8 });
      const cx = zone.x + zone.w / 2;
      const cy = zone.y + zone.h / 2;
      const s = Math.min(zone.w, zone.h) * 0.36;
      // 卡子轮廓（对称云头）
      R.draw(
        (c) => {
          c.moveTo(cx, cy - s * 1.3);
          c.quadraticCurveTo(cx + s * petals * 0.5, cy - s, cx + s * 0.7, cy);
          c.quadraticCurveTo(cx + s * 1.1, cy + s * 0.8, cx, cy + s * 1.25);
          c.quadraticCurveTo(cx - s * 1.1, cy + s * 0.8, cx - s * 0.7, cy);
          c.quadraticCurveTo(cx - s * petals * 0.5, cy - s, cx, cy - s * 1.3);
        },
        { fill: 'xiang', stroke: 'mo', lw: 1, goldStroke: 'gutou', lifen: true },
      );
      drawZhi(R, cx, cy, s * 0.4, 'gutou');
    },
  },

  // —— 盒子团花 ——
  'hezi-tuanhua': {
    label: '盒子·旋转团花',
    units: ['hezi'],
    categories: ['hexi', 'xuanzi', 'sushi'],
    schema: [{ key: 'petals', label: '花瓣数', type: 'range', min: 4, max: 16, step: 1, default: 8 }],
    draw: ({ R, zone, instance, base }) => {
      const petals = Math.round(num(instance, 'petals', 8));
      const s = Math.min(zone.w, zone.h);
      R.rect(zone.x, zone.y, zone.w, zone.h, { fill: base, stroke: 'mo', lw: 1 });
      R.rect(zone.x + s * 0.06, zone.y + s * 0.06, zone.w - s * 0.12, zone.h - s * 0.12, {
        fill: null,
        stroke: 'mo',
        lw: 1.2,
        goldStroke: 'hezi',
        lifen: true,
      });
      drawXuanhua(R, zone.x + zone.w / 2, zone.y + zone.h / 2, s * 0.36, petals, 'hezi');
    },
  },

  // —— 找头：旋花排布（规则引擎驱动） ——
  'zhaotou-xuanhua': {
    label: '找头·旋花（按路数自动排布）',
    units: ['zhaotou'],
    categories: ['xuanzi'],
    schema: [{ key: 'petals', label: '头路瓣数', type: 'range', min: 6, max: 12, step: 1, default: 8 }],
    draw: (rc) => {
      const { R, zone, layout, instance } = rc;
      const petals = Math.round(num(instance, 'petals', 8));
      const { flowers, fillers } = planFlowers(zone, layout);
      for (const f of flowers) {
        R.ctx.save();
        if (f.edge) {
          R.ctx.beginPath();
          R.ctx.rect(zone.x - 1, zone.y - 1, zone.w + 2, zone.h + 2);
          R.ctx.clip();
        }
        drawXuanhua(R, f.cx, zone.y + zone.h / 2, f.r * 0.96, petals, 'xuanhua');
        R.ctx.restore();
      }
      for (const [x, y] of fillers) {
        const s = Math.min(zone.h * 0.09, 14);
        drawZhi(R, x, y, s, 'xuanhua');
      }
    },
  },

  // —— 找头：和玺龙草（程式化卷草/夔龙） ——
  'zhaotou-longcao': {
    label: '找头·龙草/灵芝',
    units: ['zhaotou'],
    categories: ['hexi'],
    schema: [],
    draw: ({ R, zone }) => {
      const cy = zone.y + zone.h / 2;
      const h = zone.h;
      const n = Math.max(1, Math.round(zone.w / (h * 0.9)));
      for (let i = 0; i < n; i++) {
        const cx = zone.x + ((i + 0.5) / n) * zone.w;
        const s = Math.min(zone.w / n, h) * 0.42;
        R.draw(
          (c) => {
            c.moveTo(cx - s, cy + s * 0.4);
            c.bezierCurveTo(cx - s, cy - s, cx + s * 0.4, cy - s, cx + s * 0.5, cy - s * 0.2);
            c.bezierCurveTo(cx + s * 0.6, cy + s * 0.7, cx - s * 0.5, cy + s * 0.7, cx - s * 0.2, cy);
          },
          { fill: null, stroke: 'lv', lw: h * 0.16 },
        );
        R.draw(
          (c) => {
            c.moveTo(cx - s, cy + s * 0.4);
            c.bezierCurveTo(cx - s, cy - s, cx + s * 0.4, cy - s, cx + s * 0.5, cy - s * 0.2);
            c.bezierCurveTo(cx + s * 0.6, cy + s * 0.7, cx - s * 0.5, cy + s * 0.7, cx - s * 0.2, cy);
          },
          { fill: null, stroke: 'mo', lw: 1, goldStroke: 'xuanhua', lifen: true },
        );
        R.circle(cx + s * 0.52, cy - s * 0.22, s * 0.16, { fill: 'zhu', stroke: 'mo', lw: 0.6, goldFill: 'xuanhua' });
      }
    },
  },

  // —— 找头：苏式锦地折枝 ——
  'zhaotou-jindi': {
    label: '找头·锦地折枝',
    units: ['zhaotou'],
    categories: ['sushi'],
    schema: [],
    draw: ({ R, zone, base }) => {
      R.rect(zone.x, zone.y, zone.w, zone.h, { fill: base });
      R.ctx.save();
      R.ctx.beginPath();
      R.ctx.rect(zone.x, zone.y, zone.w, zone.h);
      R.ctx.clip();
      const step = Math.max(14, zone.h * 0.22);
      R.ctx.strokeStyle = R.pass === 'beauty' ? 'rgba(33,29,24,0.35)' : R.pass === 'line' ? '#8a8170' : '#000';
      R.ctx.lineWidth = 0.5;
      for (let x = zone.x - zone.h; x < zone.x + zone.w + zone.h; x += step) {
        R.ctx.beginPath();
        R.ctx.moveTo(x, zone.y + zone.h);
        R.ctx.lineTo(x + zone.h, zone.y);
        R.ctx.stroke();
        R.ctx.beginPath();
        R.ctx.moveTo(x, zone.y);
        R.ctx.lineTo(x + zone.h, zone.y + zone.h);
        R.ctx.stroke();
      }
      R.ctx.restore();
      const n = Math.max(1, Math.floor(zone.w / (zone.h * 0.8)));
      for (let i = 0; i < n; i++) {
        drawZhi(R, zone.x + ((i + 0.5) / n) * zone.w, zone.y + zone.h / 2, zone.h * 0.16, 'xuanhua');
      }
    },
  },

  // —— 枋心：边框 + 主题（空/一字/锦/草） ——
  'fangxin-frame': {
    label: '枋心·边框与主题',
    units: ['fangxin'],
    categories: ['hexi', 'xuanzi', 'sushi'],
    schema: [
      {
        key: 'motif',
        label: '主题',
        type: 'select',
        default: 'yi',
        options: [
          { value: 'none', label: '空枋心' },
          { value: 'yi', label: '一字枋心' },
          { value: 'jin', label: '锦纹' },
          { value: 'cao', label: '卷草' },
        ],
      },
    ],
    draw: ({ R, zone, instance, base }) => {
      const motif = str(instance, 'motif', 'yi');
      const { x, y, w, h } = zone;
      R.rect(x, y, w, h, { fill: base });
      const inset = h * 0.08;
      R.rect(x + inset, y + inset, w - 2 * inset, h - 2 * inset, {
        fill: null,
        stroke: 'mo',
        lw: 1.6,
        goldStroke: 'fangxinkuang',
        lifen: true,
      });
      R.rect(x + inset * 1.7, y + inset * 1.7, w - inset * 3.4, h - inset * 3.4, {
        fill: null,
        stroke: 'mo',
        lw: 0.7,
        goldStroke: 'fangxinkuang',
      });
      if (motif === 'yi') {
        R.rect(x + w * 0.12, y + h * 0.42, w * 0.76, h * 0.16, {
          fill: 'xiang',
          stroke: 'mo',
          lw: 1,
          goldFill: 'fangxinwen',
          goldStroke: 'fangxinwen',
          lifen: true,
        });
      } else if (motif === 'jin') {
        R.ctx.save();
        R.ctx.beginPath();
        R.ctx.rect(x + inset * 2, y + inset * 2, w - inset * 4, h - inset * 4);
        R.ctx.clip();
        const step = h * 0.28;
        for (let gx = x; gx < x + w; gx += step)
          for (let gy = y; gy < y + h; gy += step)
            R.poly(
              [
                [gx + step / 2, gy + 2],
                [gx + step - 2, gy + step / 2],
                [gx + step / 2, gy + step - 2],
                [gx + 2, gy + step / 2],
              ],
              true,
              { fill: null, stroke: 'xiang', lw: 0.7, goldStroke: 'fangxinwen' },
            );
        R.ctx.restore();
      } else if (motif === 'cao') {
        const cy = y + h / 2;
        R.draw(
          (c) => {
            c.moveTo(x + w * 0.1, cy);
            c.bezierCurveTo(x + w * 0.3, y + h * 0.1, x + w * 0.45, y + h * 0.9, x + w * 0.62, cy);
            c.bezierCurveTo(x + w * 0.75, y + h * 0.45, x + w * 0.85, y + h * 0.5, x + w * 0.92, cy);
          },
          { fill: null, stroke: 'lv', lw: h * 0.14 },
        );
        R.draw(
          (c) => {
            c.moveTo(x + w * 0.1, cy);
            c.bezierCurveTo(x + w * 0.3, y + h * 0.1, x + w * 0.45, y + h * 0.9, x + w * 0.62, cy);
            c.bezierCurveTo(x + w * 0.75, y + h * 0.45, x + w * 0.85, y + h * 0.5, x + w * 0.92, cy);
          },
          { fill: null, stroke: 'mo', lw: 1, goldStroke: 'fangxinwen', lifen: true },
        );
      }
    },
  },

  // —— 枋心：行龙（程式化） ——
  'fangxin-long': {
    label: '枋心·行龙',
    units: ['fangxin'],
    categories: ['hexi'],
    schema: [],
    draw: ({ R, zone, base }) => {
      const { x, y, w, h } = zone;
      R.rect(x, y, w, h, { fill: base });
      const inset = h * 0.07;
      R.rect(x + inset, y + inset, w - 2 * inset, h - 2 * inset, {
        fill: null,
        stroke: 'mo',
        lw: 1.6,
        goldStroke: 'fangxinkuang',
        lifen: true,
      });
      // 龙身：波浪粗金带
      const bodyY = y + h * 0.52;
      R.draw(
        (c) => {
          c.moveTo(x + w * 0.08, bodyY);
          c.bezierCurveTo(x + w * 0.22, y + h * 0.18, x + w * 0.34, y + h * 0.86, x + w * 0.5, bodyY);
          c.bezierCurveTo(x + w * 0.66, y + h * 0.2, x + w * 0.78, y + h * 0.8, x + w * 0.9, bodyY * 0.96 + y * 0.04);
        },
        { fill: null, stroke: 'jin', lw: h * 0.2, goldStroke: 'fangxinwen' },
      );
      R.draw(
        (c) => {
          c.moveTo(x + w * 0.08, bodyY);
          c.bezierCurveTo(x + w * 0.22, y + h * 0.18, x + w * 0.34, y + h * 0.86, x + w * 0.5, bodyY);
          c.bezierCurveTo(x + w * 0.66, y + h * 0.2, x + w * 0.78, y + h * 0.8, x + w * 0.9, bodyY * 0.96 + y * 0.04);
        },
        { fill: null, stroke: 'mo', lw: 1.1, goldStroke: 'fangxinwen', lifen: true },
      );
      // 龙头
      const hx = x + w * 0.9;
      const hy = bodyY * 0.96 + y * 0.04;
      R.circle(hx, hy, h * 0.13, { fill: 'jin', stroke: 'mo', lw: 1, goldFill: 'fangxinwen', goldStroke: 'fangxinwen' });
      R.circle(hx + h * 0.05, hy - h * 0.04, h * 0.025, { fill: 'mo' });
      // 龙爪/背鳍
      for (let i = 1; i <= 4; i++) {
        const px = x + w * (0.18 + i * 0.15);
        R.poly(
          [
            [px, y + h * 0.3],
            [px + h * 0.06, y + h * 0.18],
            [px + h * 0.02, y + h * 0.34],
          ],
          true,
          { fill: 'zhu', stroke: 'mo', lw: 0.5 },
        );
      }
    },
  },

  // —— 苏式包袱 ——
  'fangxin-baofu': {
    label: '苏式·包袱锦',
    units: ['fangxin'],
    categories: ['sushi'],
    schema: [{ key: 'folds', label: '包袱褶', type: 'range', min: 2, max: 6, step: 1, default: 3 }],
    draw: ({ R, zone, instance }) => {
      const folds = Math.round(num(instance, 'folds', 3));
      const { x, y, w, h } = zone;
      R.rect(x, y, w, h, { fill: 'bai' });
      const top = y + h * 0.12;
      const bot = y + h * 0.92;
      const bw = w * 0.62;
      const bx = x + (w - bw) / 2;
      // 包袱外形（上宽下窄的垂锦）
      R.draw(
        (c) => {
          c.moveTo(bx - w * 0.06, top);
          c.lineTo(bx + bw + w * 0.06, top);
          c.lineTo(bx + bw * 0.82, bot);
          c.quadraticCurveTo(bx + bw / 2, bot + h * 0.1, bx + bw * 0.18, bot);
          c.closePath();
        },
        { fill: 'xiang', stroke: 'mo', lw: 1.4, goldStroke: 'fangxinkuang', lifen: true },
      );
      // 锦格
      R.ctx.save();
      R.ctx.beginPath();
      R.ctx.moveTo(bx - w * 0.06, top);
      R.ctx.lineTo(bx + bw + w * 0.06, top);
      R.ctx.lineTo(bx + bw * 0.82, bot);
      R.ctx.quadraticCurveTo(bx + bw / 2, bot + h * 0.1, bx + bw * 0.18, bot);
      R.ctx.closePath();
      R.ctx.clip();
      const step = h * 0.22;
      for (let gx = bx - step; gx < bx + bw + step; gx += step) {
        R.line(gx, top, gx - bw * 0.2, bot, { stroke: 'zhu', lw: 1.2 });
        R.line(gx + step / 2, top, gx + step / 2 - bw * 0.2, bot, { stroke: 'qing', lw: 0.8 });
      }
      R.ctx.restore();
      // 褶线
      for (let i = 1; i <= folds; i++) {
        const t = i / (folds + 1);
        R.line(bx + bw * t, top, bx + bw * (0.18 + 0.64 * t), bot, {
          stroke: 'mo',
          lw: 0.8,
          alpha: 0.6,
        });
      }
    },
  },
};

export function getRenderer(key: string): RendererMeta | undefined {
  return renderers[key];
}

export function allRendererMetas(): RendererMeta[] {
  return Object.values(renderers);
}

export function rendererEntries(): [string, RendererMeta][] {
  return Object.entries(renderers);
}

// ----------------------------------------------------------------------------
// 内置纹样实例（稳定 id，测试殿与默认选择依赖它们）
// ----------------------------------------------------------------------------
function bp(
  id: string,
  name: string,
  category: PatternCategory,
  unit: UnitKind,
  renderer: string,
  params: Record<string, number | string | boolean>,
): PatternInstance {
  const meta = renderers[renderer];
  return {
    id,
    name,
    category,
    unit,
    renderer,
    builtin: true,
    params: { ...params },
    paramSchema: meta?.schema,
  };
}

export const BUILTIN_PATTERNS: PatternInstance[] = [
  bp('bp-gutou-bands', '整破色带箍头', 'xuanzi', 'gutou', 'gutou-bands', { bands: 3, beads: true }),
  bp('bp-gutou-hexi', '和玺箍头', 'hexi', 'gutou', 'gutou-bands', { bands: 4, beads: false }),
  bp('bp-gutou-kazi', '苏式卡子箍头', 'sushi', 'gutou', 'gutou-kazi', { petals: 3 }),
  bp('bp-hezi-tuanhua', '八瓣团花盒子', 'xuanzi', 'hezi', 'hezi-tuanhua', { petals: 8 }),
  bp('bp-hezi-hexi', '和玺团花盒子', 'hexi', 'hezi', 'hezi-tuanhua', { petals: 12 }),
  bp('bp-hezi-sushi', '苏式团花盒子', 'sushi', 'hezi', 'hezi-tuanhua', { petals: 6 }),
  bp('bp-zhaotou-xuanhua', '旋花找头（自动路数）', 'xuanzi', 'zhaotou', 'zhaotou-xuanhua', { petals: 8 }),
  bp('bp-zhaotou-longcao', '和玺龙草找头', 'hexi', 'zhaotou', 'zhaotou-longcao', {}),
  bp('bp-zhaotou-jindi', '苏式锦地找头', 'sushi', 'zhaotou', 'zhaotou-jindi', {}),
  bp('bp-fangxin-yi', '一字枋心', 'xuanzi', 'fangxin', 'fangxin-frame', { motif: 'yi' }),
  bp('bp-fangxin-jin', '锦纹枋心', 'sushi', 'fangxin', 'fangxin-frame', { motif: 'jin' }),
  bp('bp-fangxin-none', '空枋心', 'xuanzi', 'fangxin', 'fangxin-frame', { motif: 'none' }),
  bp('bp-fangxin-long', '和玺行龙枋心', 'hexi', 'fangxin', 'fangxin-long', {}),
  bp('bp-fangxin-baofu', '苏式包袱', 'sushi', 'fangxin', 'fangxin-baofu', { folds: 3 }),
];

const DEFAULT_BY_STYLE: Record<PatternCategory, Record<UnitKind, string>> = {
  xuanzi: {
    gutou: 'bp-gutou-bands',
    hezi: 'bp-hezi-tuanhua',
    zhaotou: 'bp-zhaotou-xuanhua',
    fangxin: 'bp-fangxin-yi',
  },
  hexi: {
    gutou: 'bp-gutou-hexi',
    hezi: 'bp-hezi-hexi',
    zhaotou: 'bp-zhaotou-longcao',
    fangxin: 'bp-fangxin-long',
  },
  sushi: {
    gutou: 'bp-gutou-kazi',
    hezi: 'bp-hezi-sushi',
    zhaotou: 'bp-zhaotou-jindi',
    fangxin: 'bp-fangxin-baofu',
  },
};

export function resolvePatternId(
  style: PatternCategory,
  unit: UnitKind,
  chosen: string | undefined,
  library: PatternInstance[],
): string {
  if (chosen && library.some((p) => p.id === chosen)) return chosen;
  return DEFAULT_BY_STYLE[style][unit];
}

export function getPattern(id: string, library: PatternInstance[]): PatternInstance | undefined {
  return library.find((p) => p.id === id) ?? BUILTIN_PATTERNS.find((p) => p.id === id);
}
