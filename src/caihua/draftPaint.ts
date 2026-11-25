// ============================================================================
// 起谱绘制编排：分三停 -> 铺青绿 -> 画单元纹样 -> 大边/圭线 -> 色标
// 同一个 paintDraft 可输出 beauty/line/metal/rough/bump 五种通道。
// ============================================================================

import type { Member, Settings, PatternInstance, ColorKey } from '../types';
import {
  computeLayout,
  withCompositionOverride,
  type DraftLayout,
  type MmRect,
} from './rules';
import { colorZones } from './colors';
import { Painter, type Pass } from './painter';
import { getRenderer, resolvePatternId, getPattern } from './patterns';

export interface PaintOptions {
  settings: Settings;
  library: PatternInstance[];
  pass?: Pass;
  /** 墨线谱上写青/绿/金 色标 */
  colorCodes?: boolean;
}

interface Placement {
  unit: 'gutou' | 'hezi' | 'zhaotou' | 'fangxin';
  zoneId: string;
  zone: MmRect;
}

export function effectiveLayout(member: Member, settings: Settings): DraftLayout {
  const base = computeLayout(member, settings.rule);
  return withCompositionOverride(base, member.draft.compositionOverride, settings.rule);
}

export function paintDraft(
  ctx: CanvasRenderingContext2D,
  member: Member,
  opts: PaintOptions,
): DraftLayout {
  const { settings, library } = opts;
  const pass: Pass = opts.pass ?? 'beauty';
  const layout = effectiveLayout(member, settings);
  const L = layout.lengthMm;
  const H = layout.faceHeightMm;
  const foil = settings.foils.find((f) => f.id === member.draft.foil) ?? settings.foils[0];

  const R = new Painter(ctx, {
    pass,
    palette: settings.palette,
    foil,
    foilOf: (region) => {
      const fid = (region && member.draft.foilByRegion?.[region]) || member.draft.foil;
      return settings.foils.find((f) => f.id === fid) ?? foil;
    },
    goldRegions: member.draft.goldRegions ?? {},
    lifenOn: member.draft.lifen,
  });
  R.background(L, H);

  // 大边地（深色框），line 通道自动不填充
  R.rect(0, 0, L, H, { fill: 'mo' });

  const cz = colorZones(member, layout);
  const colorById = new Map(cz.map((z) => [z.zoneId, z.color]));

  const placements: Placement[] = [
    { unit: 'gutou', zoneId: 'gutouL', zone: layout.gutouL },
    { unit: 'gutou', zoneId: 'gutouR', zone: layout.gutouR },
  ];
  if (layout.heziL && layout.heziR) {
    placements.push(
      { unit: 'hezi', zoneId: 'heziL', zone: layout.heziL },
      { unit: 'hezi', zoneId: 'heziR', zone: layout.heziR },
    );
  }
  placements.push(
    { unit: 'zhaotou', zoneId: 'zhaotouL', zone: layout.zhaotouL },
    { unit: 'zhaotou', zoneId: 'zhaotouR', zone: layout.zhaotouR },
    { unit: 'fangxin', zoneId: 'fangxin', zone: layout.fangxin },
  );

  // 先统一铺地色（保证青绿调度正确），再让 renderer 画母题
  for (const p of placements) {
    const base = colorById.get(p.zoneId) ?? 'qing';
    R.rect(p.zone.x, p.zone.y, p.zone.w, p.zone.h, { fill: base });
  }

  for (const p of placements) {
    const patternId = resolvePatternId(member.draft.style, p.unit, member.draft.patternIds[p.unit], library);
    const ins = getPattern(patternId, library);
    const meta = ins ? getRenderer(ins.renderer) : undefined;
    if (!ins || !meta) continue;
    const base = colorById.get(p.zoneId) ?? 'qing';
    const alt: ColorKey = base === 'qing' ? 'lv' : 'qing';
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.zone.x, p.zone.y, p.zone.w, p.zone.h);
    ctx.clip();
    meta.draw({ R, zone: p.zone, layout, instance: ins, base, alt });
    ctx.restore();
  }

  // —— 大边内口主线（沥粉贴金） ——
  const c = layout.content;
  R.rect(c.x, c.y, c.w, c.h, {
    fill: null,
    stroke: 'mo',
    lw: Math.max(1.2, H * 0.012),
    goldStroke: 'zhuxian',
    lifen: true,
  });
  R.rect(layout.borderMm * 0.32, layout.borderMm * 0.32, L - layout.borderMm * 0.64, H - layout.borderMm * 0.64, {
    fill: null,
    stroke: 'mo',
    lw: Math.max(0.8, H * 0.008),
    goldStroke: 'zhuxian',
    lifen: true,
  });

  // —— 和玺：枋心两端圭线（Σ 形岔口） ——
  if (member.draft.style === 'hexi') {
    for (const edgeX of [layout.fangxin.x, layout.fangxin.x + layout.fangxin.w]) {
      const dir = edgeX === layout.fangxin.x ? -1 : 1;
      const h = c.h;
      const w = h * 0.16;
      R.draw(
        (cc) => {
          cc.moveTo(edgeX, c.y);
          cc.lineTo(edgeX + dir * w, c.y + h * 0.28);
          cc.lineTo(edgeX + dir * w * 0.4, c.y + h * 0.5);
          cc.lineTo(edgeX + dir * w, c.y + h * 0.72);
          cc.lineTo(edgeX, c.y + h);
        },
        { fill: null, stroke: 'mo', lw: 1.4, goldStroke: 'zhuxian', lifen: true },
      );
    }
  }

  // —— 墨线谱色标 ——
  if (opts.colorCodes && pass === 'line') {
    for (const z of cz) {
      const ch = z.color === 'qing' ? '青' : z.color === 'lv' ? '绿' : '';
      if (!ch) continue;
      const size = Math.min(z.rect.h * 0.34, z.rect.w * 0.5, 26);
      if (size < 5) continue;
      R.text(ch, z.rect.x + z.rect.w / 2, z.rect.y + z.rect.h / 2, size, {
        color: '#b03a28',
        bold: true,
      });
    }
    // 金标
    if (Object.values(member.draft.goldRegions ?? {}).some(Boolean)) {
      R.text('金', L / 2, H - layout.borderMm * 0.42, Math.min(12, layout.borderMm * 0.5), {
        color: '#9a7416',
        bold: true,
      });
    }
  }

  return layout;
}

/** 计算某构件贴图的像素比例（所有通道共用同一比例以保证对齐） */
export function textureScale(layout: DraftLayout, maxWidthPx = 2048, targetHeightPx = 300): number {
  let ppm = targetHeightPx / Math.max(1, layout.faceHeightMm);
  if (layout.lengthMm * ppm > maxWidthPx) ppm = maxWidthPx / layout.lengthMm;
  return ppm;
}

/** 离屏渲染指定通道到 canvas（用于 three 贴图 / 下载 PNG） */
export function renderPassCanvas(
  member: Member,
  settings: Settings,
  library: PatternInstance[],
  pass: Pass,
  maxWidthPx?: number,
): HTMLCanvasElement {
  const layout = effectiveLayout(member, settings);
  const ppm = textureScale(layout, maxWidthPx ?? (pass === 'beauty' ? 2048 : 1024), pass === 'beauty' ? 320 : 256);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(layout.lengthMm * ppm));
  canvas.height = Math.max(2, Math.round(layout.faceHeightMm * ppm));
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(ppm, 0, 0, ppm, 0, 0);
  paintDraft(ctx, member, { settings, library, pass });
  return canvas;
}
