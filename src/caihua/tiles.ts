// ============================================================================
// 足尺谱子分页（1:1，单位 mm）：把一根 L×H 的构件谱面切成纸张瓦片，
// 相邻页保留 overlapMm 搭接，供拼接。纯函数，确定性。
// ============================================================================

import { PAPER_SIZES } from '../lib/settings';

export interface PaperMm {
  w: number;
  h: number;
}

export interface TileQuery {
  lengthMm: number;
  heightMm: number;
  paper: keyof typeof PAPER_SIZES;
  orientation: 'auto' | 'portrait' | 'landscape';
  marginMm: number;
  overlapMm: number;
}

export interface Tile {
  col: number; // 0-based
  row: number;
  cols: number;
  rows: number;
  /** 该瓦片在构件坐标系中的源矩形 mm */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** 可绘区尺寸 mm（= 纸张减页边距） */
  pw: number;
  ph: number;
  /** 纸张方向后的整纸尺寸 mm */
  paperW: number;
  paperH: number;
  orientation: 'portrait' | 'landscape';
  label: string; // 如 "3/12"
  matchLeft?: string;
  matchRight?: string;
  matchTop?: string;
  matchBottom?: string;
}

export interface TilePlan {
  paperW: number;
  paperH: number;
  orientation: 'portrait' | 'landscape';
  pw: number;
  ph: number;
  cols: number;
  rows: number;
  pageCount: number;
  tiles: Tile[];
}

export function resolvePaper(q: TileQuery): { paperW: number; paperH: number; orientation: 'portrait' | 'landscape' } {
  const base = PAPER_SIZES[q.paper];
  let orientation: 'portrait' | 'landscape';
  if (q.orientation === 'auto') orientation = q.lengthMm >= q.heightMm ? 'landscape' : 'portrait';
  else orientation = q.orientation;
  // 库中 w<h 为纵向；横向交换
  const paperW = orientation === 'landscape' ? Math.max(base.w, base.h) : Math.min(base.w, base.h);
  const paperH = orientation === 'landscape' ? Math.min(base.w, base.h) : Math.max(base.w, base.h);
  return { paperW, paperH, orientation };
}

export function planTiles(q: TileQuery): TilePlan {
  const { paperW, paperH, orientation } = resolvePaper(q);
  const pw = Math.max(20, paperW - 2 * q.marginMm);
  const ph = Math.max(20, paperH - 2 * q.marginMm);
  const ov = Math.max(0, Math.min(q.overlapMm, pw / 4, ph / 4));

  const L = Math.max(1, q.lengthMm);
  const H = Math.max(1, q.heightMm);

  const strideX = Math.max(1, pw - ov);
  const strideY = Math.max(1, ph - ov);
  const cols = Math.max(1, Math.ceil((L - ov) / strideX));
  const rows = Math.max(1, Math.ceil((H - ov) / strideY));

  const tiles: Tile[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // 末页贴齐构件末端，避免打出大片空白
      let sx = col * strideX;
      if (col === cols - 1) sx = Math.max(0, L - pw);
      let sy = row * strideY;
      if (row === rows - 1) sy = Math.max(0, H - ph);
      sx = Math.min(sx, Math.max(0, L - 1));
      sy = Math.min(sy, Math.max(0, H - 1));
      const idx = row * cols + col + 1;
      const total = cols * rows;
      tiles.push({
        col,
        row,
        cols,
        rows,
        sx,
        sy,
        sw: Math.min(pw, L - sx),
        sh: Math.min(ph, H - sy),
        pw,
        ph,
        paperW,
        paperH,
        orientation,
        label: `${idx}/${total}`,
        matchLeft: col > 0 ? `◀ 接 ${row * cols + col}` : undefined,
        matchRight: col < cols - 1 ? `接 ${row * cols + col + 2} ▶` : undefined,
        matchTop: row > 0 ? `▲ 接上排 ${col + 1}` : undefined,
        matchBottom: row < rows - 1 ? `接下排 ${col + 1} ▼` : undefined,
      });
    }
  }
  return { paperW, paperH, orientation, pw, ph, cols, rows, pageCount: cols * rows, tiles };
}
