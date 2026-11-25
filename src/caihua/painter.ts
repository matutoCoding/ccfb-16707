// ============================================================================
// Painter：一套纹样绘制，五种输出通道
//   beauty 彩色效果 | line 墨线谱子 | metal 金属度 | rough 粗糙度 | bump 沥粉凹凸
// 调用方负责设置 ctx 变换，使所有坐标/线宽/字号单位都是 mm。
// ============================================================================

import type { ColorKey, FoilDef } from '../types';
import type { Pass } from './passes';
export type { Pass } from './passes';

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DrawStyle {
  fill?: ColorKey | null;
  stroke?: ColorKey | null;
  lw?: number;
  /** 若提供且该贴金部位开启，则填充为金 */
  goldFill?: string | null;
  /** 若提供且该贴金部位开启，则描边为金 */
  goldStroke?: string | null;
  /** 该描边是沥粉线（在 bump 通道产生凸起） */
  lifen?: boolean;
  dash?: number[];
  alpha?: number;
}

export interface PainterOpts {
  pass: Pass;
  palette: Record<ColorKey, string>;
  foil: FoilDef;
  /** 按贴金部位解析具体金箔（不同部位可用不同金箔） */
  foilOf?: (region: string | null | undefined) => FoilDef;
  goldRegions: Record<string, boolean>;
  lifenOn: boolean;
}

export function shade(hex: string, amt: number): string {
  // amt -1..1
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}

export class Painter {
  ctx: CanvasRenderingContext2D;
  o: PainterOpts;
  pass: Pass;

  constructor(ctx: CanvasRenderingContext2D, opts: PainterOpts) {
    this.ctx = ctx;
    this.o = opts;
    this.pass = opts.pass;
  }

  goldOn(region?: string | null): boolean {
    return !!region && !!this.o.goldRegions[region];
  }

  /** 取某一样式所启用金部位对应的金箔 */
  foilFor(st: DrawStyle): FoilDef {
    const region = (this.goldOn(st.goldFill) ? st.goldFill : null) ??
      (this.goldOn(st.goldStroke) ? st.goldStroke : null);
    return (region && this.o.foilOf?.(region)) || this.o.foil;
  }

  /** 整幅底色（按通道） */
  background(wMm: number, hMm: number, beautyBase?: string) {
    const c = this.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (this.pass === 'beauty') c.fillStyle = beautyBase ?? this.o.palette.bai;
    else if (this.pass === 'line') c.fillStyle = '#fbfaf4';
    else if (this.pass === 'metal') c.fillStyle = '#000';
    else if (this.pass === 'rough') c.fillStyle = 'rgb(224,224,224)';
    else c.fillStyle = 'rgb(128,128,128)';
    c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    c.restore();
    // beauty 模式下额外铺一层极淡的纸/地仗色由调用方决定
    if (this.pass === 'beauty' && beautyBase) {
      c.fillStyle = beautyBase;
      c.fillRect(0, 0, wMm, hMm);
    }
  }

  private goldGradient(foil: FoilDef, bb?: BBox): CanvasGradient | string {
    const f = foil.color;
    if (!bb || bb.w <= 0 || bb.h <= 0) return f;
    const g = this.ctx.createLinearGradient(bb.x, bb.y, bb.x, bb.y + bb.h);
    g.addColorStop(0, shade(f, 0.28));
    g.addColorStop(0.45, f);
    g.addColorStop(0.55, shade(f, -0.12));
    g.addColorStop(1, shade(f, 0.16));
    return g;
  }

  /** 计算某一样式在当前通道下的实际填充色；null 表示不填充 */
  private resolveFill(st: DrawStyle, bb?: BBox): string | CanvasGradient | null {
    const gold = this.goldOn(st.goldFill);
    const foil = this.foilFor(st);
    switch (this.pass) {
      case 'beauty':
        if (gold) return this.goldGradient(foil, bb);
        return st.fill ? this.o.palette[st.fill] : null;
      case 'line':
        return null;
      case 'metal':
        return gold ? '#fff' : '#000';
      case 'rough': {
        const rv = gold ? foil.roughness : 224 / 255;
        const v = Math.round(rv * 255);
        return `rgb(${v},${v},${v})`;
      }
      case 'bump':
        return 'rgb(128,128,128)';
    }
  }

  private resolveStroke(st: DrawStyle): string | null {
    const gold = this.goldOn(st.goldStroke);
    const foil = this.foilFor(st);
    switch (this.pass) {
      case 'beauty':
        if (gold) return shade(foil.color, 0.22);
        return st.stroke ? this.o.palette[st.stroke] : null;
      case 'line':
        return '#23201a';
      case 'metal':
        return gold ? '#fff' : '#000';
      case 'rough': {
        const rv = gold ? foil.roughness : 224 / 255;
        const v = Math.round(rv * 255);
        return `rgb(${v},${v},${v})`;
      }
      case 'bump':
        if (st.lifen && this.o.lifenOn) return '#fff';
        return 'rgb(128,128,128)';
    }
  }

  /** 核心：构建路径并按样式填充/描边 */
  draw(build: (c: CanvasRenderingContext2D) => void, st: DrawStyle = {}, bb?: BBox) {
    const c = this.ctx;
    c.save();
    c.globalAlpha = st.alpha ?? 1;
    c.lineWidth = st.lw ?? 1.2;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    if (st.dash) c.setLineDash(st.dash);

    const doFill = () => {
      const fill = this.resolveFill(st, bb);
      if (fill) {
        c.fillStyle = fill;
        c.fill();
      }
    };
    const doStroke = (widthMul = 1, styleOverride?: string) => {
      const s = styleOverride ?? this.resolveStroke(st);
      if (!s) return;
      c.lineWidth = (st.lw ?? 1.2) * widthMul;
      c.strokeStyle = s;
      c.stroke();
    };

    c.beginPath();
    build(c);
    doFill();

    const isLifen = !!st.lifen && this.o.lifenOn && this.goldOn(st.goldStroke);
    if (this.pass === 'beauty' && isLifen) {
      // 沥粉贴金的立体感：暗影 + 金主线 + 高光
      c.save();
      c.translate(0, (st.lw ?? 1.2) * 0.5);
      c.beginPath();
      build(c);
      doStroke(1.5, 'rgba(60,40,8,0.45)');
      c.restore();

      c.beginPath();
      build(c);
      doStroke(1);

      c.save();
      c.translate(0, -(st.lw ?? 1.2) * 0.18);
      c.beginPath();
      build(c);
      doStroke(0.32, shade(this.foilFor(st).color, 0.55));
      c.restore();
    } else if (this.pass === 'bump' && st.lifen && this.o.lifenOn) {
      // 凸起：更粗的白色圆线
      c.beginPath();
      build(c);
      doStroke(2.1, '#fff');
    } else {
      c.beginPath();
      build(c);
      doStroke();
    }
    c.restore();
  }

  rect(x: number, y: number, w: number, h: number, st: DrawStyle = {}) {
    this.draw(
      (c) => c.rect(x, y, w, h),
      st,
      { x, y, w, h },
    );
  }

  roundRect(x: number, y: number, w: number, h: number, r: number, st: DrawStyle = {}) {
    const rr = Math.min(r, w / 2, h / 2);
    this.draw(
      (c) => {
        c.moveTo(x + rr, y);
        c.arcTo(x + w, y, x + w, y + h, rr);
        c.arcTo(x + w, y + h, x, y + h, rr);
        c.arcTo(x, y + h, x, y, rr);
        c.arcTo(x, y, x + w, y, rr);
        c.closePath();
      },
      st,
      { x, y, w, h },
    );
  }

  circle(cx: number, cy: number, r: number, st: DrawStyle = {}) {
    this.draw((c) => c.arc(cx, cy, r, 0, Math.PI * 2), st, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r });
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0, st: DrawStyle = {}) {
    this.draw((c) => c.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2), st, {
      x: cx - rx,
      y: cy - ry,
      w: 2 * rx,
      h: 2 * ry,
    });
  }

  line(x1: number, y1: number, x2: number, y2: number, st: DrawStyle = {}) {
    this.draw(
      (c) => {
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
      },
      { fill: null, ...st },
    );
  }

  poly(points: [number, number][], close = true, st: DrawStyle = {}) {
    if (points.length === 0) return;
    this.draw(
      (c) => {
        c.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]);
        if (close) c.closePath();
      },
      st,
    );
  }

  text(
    str: string,
    x: number,
    y: number,
    sizeMm: number,
    opts: { color?: ColorKey | string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline; bold?: boolean; rotate?: number } = {},
  ) {
    const c = this.ctx;
    c.save();
    c.font = `${opts.bold ? 700 : 500} ${sizeMm}px "KaiTi","STKaiti","SimSun",serif`;
    c.textAlign = opts.align ?? 'center';
    c.textBaseline = opts.baseline ?? 'middle';
    if (opts.rotate) {
      c.translate(x, y);
      c.rotate(opts.rotate);
      x = 0;
      y = 0;
    }
    if (this.pass === 'line') c.fillStyle = typeof opts.color === 'string' && opts.color.startsWith('#') ? opts.color : '#3a342a';
    else if (this.pass !== 'beauty') c.fillStyle = '#000';
    else {
      const col = opts.color;
      c.fillStyle = !col ? this.o.palette.mo : col in this.o.palette ? this.o.palette[col as ColorKey] : (col as string);
    }
    c.fillText(str, x, y);
    c.restore();
  }
}
