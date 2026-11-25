// ============================================================================
// 测试项目：五开间正殿。面阔五间，进深四柱，梁枋 27 根，另配垫板、檩条。
// 坐标(mm)：X 面阔，Z 进深(前檐 +Z)，Y 向上。网格与 3D 定位同源。
// ============================================================================

import type { Member, Project, DraftConfig, Category, PatternCategory } from '../types';
import { defaultGoldRegions } from './settings';

export const SEED_PROJECT_ID = 'seed-wukaijian';

const BAY_WIDTHS = [3600, 4200, 5400, 4200, 3600];
const X_AXES = (() => {
  const xs: number[] = [];
  let acc = -BAY_WIDTHS.reduce((a, b) => a + b, 0) / 2;
  xs.push(acc);
  for (const w of BAY_WIDTHS) {
    acc += w;
    xs.push(acc);
  }
  return xs; // 6 根柱位
})();

interface MakeOpts {
  code: string;
  name: string;
  category: Category;
  length: number;
  height: number;
  width?: number;
  shape?: 'rect' | 'round';
  diameter?: number;
  curved?: boolean;
  arcAngle?: number;
  x: number;
  y: number;
  z: number;
  rotY?: number;
  line: string;
  run: string;
  bay?: number;
  course: number;
  orientation?: 'x' | 'z';
  style?: PatternCategory;
  hezi?: 'auto' | 'on' | 'off';
  grade?: string;
}

let seq = 0;
function makeMember(o: MakeOpts): Member {
  seq += 1;
  const draft: DraftConfig = {
    style: o.style ?? 'xuanzi',
    grade: o.grade ?? (o.style === 'hexi' ? '金琢墨石碾玉' : '烟琢墨石碾玉'),
    heziMode: o.hezi ?? 'auto',
    patternIds: {},
    foil: 'kujin',
    goldRegions: defaultGoldRegions(),
    lifen: true,
    colorOverrides: {},
  };
  const isRound = o.shape === 'round';
  return {
    id: `seed-m-${String(seq).padStart(2, '0')}`,
    code: o.code,
    name: o.name,
    category: o.category,
    lengthMm: o.length,
    heightMm: isRound ? o.diameter ?? o.height : o.height,
    section: isRound
      ? {
          shape: 'round',
          widthMm: o.diameter ?? o.height,
          heightMm: o.diameter ?? o.height,
          diameterMm: o.diameter ?? o.height,
          arcAngleDeg: o.arcAngle ?? 180,
        }
      : { shape: 'rect', widthMm: o.width ?? 300, heightMm: o.height },
    curved: o.curved ?? isRound,
    pose: { x: o.x, y: o.y, z: o.z, rotY: o.rotY ?? 0 },
    grid: {
      line: o.line,
      run: o.run,
      bay: o.bay,
      course: o.course,
      orientation: o.orientation ?? 'x',
    },
    draft,
  };
}

export function buildSeedProject(): Project {
  seq = 0;
  const members: Member[] = [];

  // —— 四排纵向枋：前/后檐额枋 + 前/后金枋，每排五间 = 20 根 ——
  const runs = [
    { z: 3600, y: 4700, h: 560, w: 380, line: '前檐', run: '前檐-额枋', code: 'QY-E', name: '前檐额枋', course: 0 },
    { z: -3600, y: 4700, h: 560, w: 380, line: '后檐', run: '后檐-额枋', code: 'HY-E', name: '后檐额枋', course: 0 },
    { z: 1800, y: 5450, h: 480, w: 320, line: '前金柱', run: '前金-金枋', code: 'QJ-F', name: '前金金枋', course: 0 },
    { z: -1800, y: 5450, h: 480, w: 320, line: '后金柱', run: '后金-金枋', code: 'HJ-F', name: '后金金枋', course: 0 },
  ];
  for (const r of runs) {
    BAY_WIDTHS.forEach((bw, bay) => {
      const cx = (X_AXES[bay] + X_AXES[bay + 1]) / 2;
      const central = bay === 2;
      members.push(
        makeMember({
          code: `${r.code}-${bay + 1}`,
          name: `${['梢间', '次间', '明间', '次间', '梢间'][bay]}${r.name}`,
          category: 'fang',
          length: bw,
          height: r.h,
          width: r.w,
          x: cx,
          y: r.y,
          z: r.z,
          line: r.line,
          run: r.run,
          bay,
          course: r.course,
          style: central ? 'hexi' : 'xuanzi',
          hezi: central ? 'on' : 'auto',
        }),
      );
    });
  }

  // —— 横向梁架：六缝，每缝一根七架梁 = 6 根 ——
  X_AXES.forEach((x, i) => {
    members.push(
      makeMember({
        code: `L-${i + 1}`,
        name: `第${i + 1}缝七架梁`,
        category: 'liang',
        length: 7600,
        height: 720,
        width: 520,
        x,
        y: 5750,
        z: 0,
        rotY: 90,
        line: `梁缝${i + 1}`,
        run: '七架梁',
        bay: i,
        course: 0,
        orientation: 'z',
        style: i === 2 || i === 3 ? 'hexi' : 'xuanzi',
        hezi: 'on',
      }),
    );
  });

  // —— 一根过短的穿插枋：用于演示“放不下要提示” ——
  members.push(
    makeMember({
      code: 'CC-0',
      name: '短穿插枋（尺度预警示例）',
      category: 'fang',
      length: 470,
      height: 560,
      width: 280,
      x: X_AXES[0] + 500,
      y: 4300,
      z: 2700,
      line: '前檐',
      run: '穿插枋',
      bay: 0,
      course: -1,
      style: 'xuanzi',
      hezi: 'off',
    }),
  );

  // —— 檐垫板：前/后檐每间一块 = 10 块 ——
  for (const z of [3600, -3600]) {
    const front = z > 0;
    BAY_WIDTHS.forEach((bw, bay) => {
      const cx = (X_AXES[bay] + X_AXES[bay + 1]) / 2;
      members.push(
        makeMember({
          code: `${front ? 'Q' : 'H'}DB-${bay + 1}`,
          name: `${front ? '前檐' : '后檐'}${['梢', '次', '明', '次', '梢'][bay]}间垫板`,
          category: 'dianban',
          length: bw - 200,
          height: 210,
          width: 160,
          x: cx,
          y: 5085,
          z,
          line: front ? '前檐' : '后檐',
          run: front ? '前檐-垫板' : '后檐-垫板',
          bay,
          course: 1,
          style: 'xuanzi',
          hezi: 'off',
        }),
      );
    });
  }

  // —— 檩：檐檩×2、金檩×2、脊檩×1（圆截面按包角展开），通长五间 ——
  const totalW = BAY_WIDTHS.reduce((a, b) => a + b, 0);
  const lins = [
    { name: '前檐檩', z: 3600, y: 5380, d: 380, line: '前檐' },
    { name: '后檐檩', z: -3600, y: 5380, d: 380, line: '后檐' },
    { name: '前金檩', z: 1800, y: 6130, d: 360, line: '前金柱' },
    { name: '后金檩', z: -1800, y: 6130, d: 360, line: '后金柱' },
    { name: '脊檩', z: 0, y: 6900, d: 340, line: '脊步' },
  ];
  lins.forEach((ln, i) => {
    members.push(
      makeMember({
        code: `LIN-${i + 1}`,
        name: ln.name,
        category: 'lin',
        length: totalW + 600,
        height: ln.d,
        shape: 'round',
        diameter: ln.d,
        arcAngle: 200,
        x: 0,
        y: ln.y,
        z: ln.z,
        line: ln.line,
        run: ln.name,
        course: 2,
        style: 'xuanzi',
        hezi: 'off',
      }),
    );
  });

  const now = 1764000000000;
  return {
    id: SEED_PROJECT_ID,
    name: '五开间正殿（测试项目）',
    client: '样式房',
    note: '面阔五间，梁枋二十七根；含一根过短构件用于校验提示。',
    createdAt: now,
    updatedAt: now,
    hall: {
      title: '五开间正殿',
      bays: 5,
      bayWidthsMm: BAY_WIDTHS,
      columnHeightMm: 4800,
      columnDiameterMm: 420,
      depthMm: 7200,
    },
    members,
  };
}

export { X_AXES, BAY_WIDTHS };
