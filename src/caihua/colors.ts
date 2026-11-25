// ============================================================================
// 青绿相间配色规则与相邻错色检查
// ============================================================================

import type { Member, ColorKey, Project } from '../types';
import { computeLayout, DEFAULT_RULES, type DraftLayout, type MmRect } from './rules';

export const QING: ColorKey = 'qing';
export const LV: ColorKey = 'lv';

/** 稳定字符串哈希 -> 0/1，用于没有网格信息的构件 */
export function parityFromString(s: string): 0 | 1 {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (Math.abs(h) % 2) as 0 | 1;
}

/**
 * 构件的错色奇偶。优先用网格：
 * 同 run 内 bay 相邻要错开；同 bay 内 course 相邻要错开。
 * parity = (bay + course) mod 2，必要时再异或一个 run 稳定位，
 * 以保证前后檐/不同缝同位置也能错开。
 */
export function memberParity(m: Member): 0 | 1 {
  if (m.draft.parity === 0 || m.draft.parity === 1) return m.draft.parity;
  const g = m.grid;
  if (g && (g.bay != null || g.course != null)) {
    // 横向梁架：同一组缝按缝号(bay 复用为缝序)交替
    if (g.orientation === 'z') {
      if (g.bay != null) return (g.bay & 1) as 0 | 1;
      return parityFromString(m.code || m.id);
    }
    const bay = g.bay ?? 0;
    const course = g.course ?? 0;
    // 纵向：只用轴线/缝的稳定奇偶，上下皮 run 名称不同但 line 相同，
    // course±1 必然引起奇偶翻转；同 run 相邻开间由 bay 翻转。
    const lineBit = g.line ? parityFromString(g.line) : g.run ? parityFromString(g.run) : 0;
    return ((bay + course + lineBit) & 1) as 0 | 1;
  }
  return parityFromString(m.code || m.id);
}

/** 一根构件上各大色区域的稳定 zoneId 与几何 */
export interface ColorZone {
  zoneId: string;
  label: string;
  rect: MmRect;
  /** 相对中芯的环数：枋心 0，找头 1，盒子 2，箍头 3（用于镜像对称配色） */
  ring: number;
  /** 自动色 */
  auto: ColorKey;
  /** 实际色（考虑手改） */
  color: ColorKey;
}

/**
 * 生成一根构件的配色分区。
 * 规律：以枋心为 ring0 取 parity 对应色，向外逐环青绿交替；
 * 左右镜像同色，故相邻大色地全部错开且首尾对称。
 */
export function colorZones(m: Member, layout: DraftLayout): ColorZone[] {
  const parity = memberParity(m);
  const ringColor = (ring: number): ColorKey => {
    // ring 偶数与枋心同色
    const base: ColorKey = parity === 0 ? QING : LV;
    const other: ColorKey = base === QING ? LV : QING;
    return ring % 2 === 0 ? base : other;
  };
  const ov = m.draft.colorOverrides ?? {};
  const mk = (zoneId: string, label: string, rect: MmRect, ring: number): ColorZone => {
    const auto = ringColor(ring);
    return { zoneId, label, rect, ring, auto, color: ov[zoneId] ?? auto };
  };

  // 环数必须按“实际相邻顺序”：枋心0、找头1；有盒子时盒子2、箍头3，
  // 无盒子时箍头直接邻接找头，故箍头为2（与枋心同色、与找头异色）。
  const gutouRing = layout.heziL ? 3 : 2;
  const zones: ColorZone[] = [
    mk('gutouL', '左箍头', layout.gutouL, gutouRing),
  ];
  if (layout.heziL) zones.push(mk('heziL', '左盒子', layout.heziL, 2));
  zones.push(mk('zhaotouL', '左找头', layout.zhaotouL, 1));
  zones.push(mk('fangxin', '枋心', layout.fangxin, 0));
  zones.push(mk('zhaotouR', '右找头', layout.zhaotouR, 1));
  if (layout.heziR) zones.push(mk('heziR', '右盒子', layout.heziR, 2));
  zones.push(mk('gutouR', '右箍头', layout.gutouR, gutouRing));
  return zones;
}

export interface ColorViolation {
  kind: 'adjacent-member' | 'adjacent-zone';
  severity: 'error' | 'warn';
  message: string;
  memberId?: string;
  otherMemberId?: string;
  zoneId?: string;
}

/** 判定两根构件在空间上是否相邻 */
export function areAdjacent(a: Member, b: Member): boolean {
  if (a.id === b.id) return false;
  const ga = a.grid;
  const gb = b.grid;
  if (!ga || !gb) return false;

  const za = ga.orientation === 'z';
  const zb = gb.orientation === 'z';

  // 纵向构件（面阔方向）：同一作作线路、相邻开间，端到端相邻
  if (!za && !zb && ga.run && ga.run === gb.run && ga.bay != null && gb.bay != null) {
    if (Math.abs(ga.bay - gb.bay) === 1) return true;
  }

  // 横向梁架：相邻两缝平行梁，按缝号(bay 复用)相邻
  if (za && zb && ga.bay != null && gb.bay != null && Math.abs(ga.bay - gb.bay) === 1) {
    return true;
  }

  // 同一轴线、同一开间，上下皮相邻（枋—垫板—檩）
  const samePlace =
    !za &&
    !zb &&
    ga.bay != null &&
    ga.bay === gb.bay &&
    !!ga.line &&
    ga.line === gb.line;
  if (samePlace && ga.course != null && gb.course != null && Math.abs(ga.course - gb.course) === 1) {
    return true;
  }
  return false;
}

/**
 * 一键按规矩重排：在相邻关系图上做二分染色，把 parity 显式写到每根构件，
 * 并清空手改颜色。写入后渲染读取 draft.parity，所见即所得、刷新不变。
 * 若出现奇环无法二分，则保留 BFS 结果并由违规检查继续提示。
 */
export function arrangeColors(members: Member[]): Member[] {
  const n = members.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (areAdjacent(members[i], members[j])) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }
  const color = new Array<0 | 1 | -1>(n).fill(-1);
  for (let s = 0; s < n; s++) {
    if (color[s] !== -1) continue;
    color[s] = 0;
    const q = [s];
    while (q.length) {
      const i = q.shift()!;
      for (const j of adj[i]) {
        if (color[j] === -1) {
          color[j] = (1 - color[i]) as 0 | 1;
          q.push(j);
        }
        // 奇环冲突时不强行翻转已染色节点
      }
    }
  }
  return members.map((m, i) => ({
    ...m,
    draft: { ...m.draft, parity: color[i] === -1 ? undefined : color[i], colorOverrides: {} },
  }));
}

/** 枋心实际色（无枋心概念时用找头色），作为构件“基调色” */
export function memberBaseColor(m: Member): ColorKey {
  const layout = computeLayout(m, DEFAULT_RULES);
  const zones = colorZones(m, layout);
  return zones.find((z) => z.zoneId === 'fangxin')?.color ?? zones[0]?.color ?? QING;
}

/** 检查整个项目：相邻构件撞色 + 单根构件相邻色区未交替 */
export function checkColorRules(project: Project): ColorViolation[] {
  const out: ColorViolation[] = [];
  const members = project.members;

  // 1) 单根内部：沿长度方向相邻色区不得同色
  for (const m of members) {
    const layout = computeLayout(m, DEFAULT_RULES);
    const zones = colorZones(m, layout);
    // 按 x 排序后检查几何相邻
    const sorted = [...zones].sort((a, b) => a.rect.x - b.rect.x);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const adjacent = Math.abs(prev.rect.x + prev.rect.w - cur.rect.x) < 1.5;
      if (adjacent && prev.color === cur.color && (cur.color === QING || cur.color === LV)) {
        out.push({
          kind: 'adjacent-zone',
          severity: 'error',
          memberId: m.id,
          zoneId: cur.zoneId,
          message: `${m.name}：${prev.label}与${cur.label}同为${cur.color === QING ? '青' : '绿'}，违反青绿相间`,
        });
      }
    }
  }

  // 2) 相邻构件基调色必须错开
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i];
      const b = members[j];
      if (!areAdjacent(a, b)) continue;
      const ca = memberBaseColor(a);
      const cb = memberBaseColor(b);
      if (ca === cb) {
        out.push({
          kind: 'adjacent-member',
          severity: 'error',
          memberId: a.id,
          otherMemberId: b.id,
          message: `相邻构件“${a.name}”与“${b.name}”均为${ca === QING ? '青' : '绿'}调，未错开`,
        });
      }
    }
  }
  return out;
}

/** 一键恢复自动配色：清掉 parity 手改与 colorOverrides */
export function resetColors(m: Member): Member {
  return {
    ...m,
    draft: { ...m.draft, parity: undefined, colorOverrides: {} },
  };
}
