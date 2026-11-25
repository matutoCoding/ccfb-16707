import type { Settings, ColorKey, Category, PatternCategory, UnitKind } from '../types';
import { DEFAULT_RULES } from '../caihua/rules';

export const CATEGORY_LABEL: Record<Category, string> = {
  liang: '梁',
  fang: '枋',
  lin: '檩',
  dianban: '垫板',
};

export const STYLE_LABEL: Record<PatternCategory, string> = {
  hexi: '和玺彩画',
  xuanzi: '旋子彩画',
  sushi: '苏式彩画',
};

export const UNIT_LABEL: Record<UnitKind, string> = {
  gutou: '箍头',
  hezi: '盒子',
  zhaotou: '找头',
  fangxin: '枋心',
};

export const COLOR_LABEL: Record<ColorKey, string> = {
  qing: '青',
  lv: '绿',
  xiang: '香色',
  zhu: '朱',
  jin: '金',
  yin: '银',
  mo: '墨',
  bai: '白粉',
};

/** 贴金部位定义；defaultOn 为新建构件时的默认值 */
export const GOLD_REGION_DEFS: { key: string; label: string; defaultOn: boolean }[] = [
  { key: 'zhuxian', label: '大边主线', defaultOn: true },
  { key: 'gutou', label: '箍头线', defaultOn: true },
  { key: 'hezi', label: '盒子纹样', defaultOn: true },
  { key: 'xuanhua', label: '找头旋花', defaultOn: true },
  { key: 'fangxinkuang', label: '枋心边框', defaultOn: true },
  { key: 'fangxinwen', label: '枋心主题（龙/锦/一字）', defaultOn: true },
];

export function defaultGoldRegions(): Record<string, boolean> {
  const o: Record<string, boolean> = {};
  for (const g of GOLD_REGION_DEFS) o[g.key] = g.defaultOn;
  return o;
}

export const DEFAULT_SETTINGS: Settings = {
  doukouMm: 100,
  rule: { ...DEFAULT_RULES },
  palette: {
    qing: '#24508c',
    lv: '#2f8a68',
    xiang: '#bd9a45',
    zhu: '#b8402c',
    jin: '#d9af3f',
    yin: '#cfd6da',
    mo: '#211d18',
    bai: '#f5efdf',
  },
  foils: [
    { id: 'kujin', name: '库金箔（九成金）', color: '#ecc860', metalness: 1, roughness: 0.27, envIntensity: 1.25 },
    { id: 'chijin', name: '赤金箔（七成金）', color: '#e29a44', metalness: 1, roughness: 0.34, envIntensity: 1.1 },
    { id: 'yinbo', name: '银箔', color: '#d7dde2', metalness: 1, roughness: 0.22, envIntensity: 1.35 },
  ],
  paper: { size: 'A4', orientation: 'auto', marginMm: 8, overlapMm: 12, dpi: 200 },
};

export const PAPER_SIZES: Record<string, { w: number; h: number; label: string }> = {
  A4: { w: 210, h: 297, label: 'A4' },
  A3: { w: 297, h: 420, label: 'A3' },
  A2: { w: 420, h: 594, label: 'A2' },
  A1: { w: 594, h: 841, label: 'A1' },
};
