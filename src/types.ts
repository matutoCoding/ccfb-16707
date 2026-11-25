// 官式彩画起谱系统 —— 核心领域类型
// 所有尺寸内部统一使用毫米(mm)，角度使用度(deg)。

export type ID = string;

/** 构件分类：梁、枋、檩、垫板 */
export type Category = 'liang' | 'fang' | 'lin' | 'dianban';

/** 彩画类别：和玺、旋子、苏式 */
export type PatternCategory = 'hexi' | 'xuanzi' | 'sushi';

/** 谱子单元：箍头、盒子、找头(藻头)、枋心 */
export type UnitKind = 'gutou' | 'hezi' | 'zhaotou' | 'fangxin';

/** 青绿主色及辅助色 */
export type ColorKey = 'qing' | 'lv' | 'xiang' | 'zhu' | 'jin' | 'yin' | 'mo' | 'bai';

export type SectionShape = 'rect' | 'round' | 'arc';

/** 截面信息。rect 用 widthMm×heightMm；round 用 diameterMm；arc 用 radiusMm+arcAngleDeg。 */
export interface SectionInfo {
  shape: SectionShape;
  widthMm: number;
  heightMm: number;
  diameterMm?: number;
  radiusMm?: number;
  /** 圆/弧面构件参与起谱的包角（度），按截面展开时使用 */
  arcAngleDeg?: number;
}

/** 三维安装坐标与朝向（米制场景里仍存 mm，渲染时 /1000） */
export interface Pose {
  x: number;
  y: number;
  z: number;
  /** 绕 Y 轴旋转（度）。长轴默认沿 X，rotY=90 时沿 Z（进深梁） */
  rotY?: number;
}

/** 大木网格定位，用于相邻构件判定与测试殿生成 */
export interface GridPos {
  /** 轴线/缝名称，如 "前檐"、"缝2" */
  line?: string;
  /** 第几间（0 起，面阔方向） */
  bay?: number;
  /** 道数/皮数（竖向序列，越大越高） */
  course?: number;
  /** 长向：x=面阔，z=进深 */
  orientation?: 'x' | 'z';
  /** 同一条水平作作线路的标识，如 "前檐-檐枋" */
  run?: string;
}

export type HeziMode = 'auto' | 'on' | 'off';

/** 一根构件各自的起谱参数（随项目持久化） */
export interface DraftConfig {
  style: PatternCategory;
  grade: string; // 等级标签，如 "金琢墨石碾玉"、"烟琢墨"
  heziMode: HeziMode;
  /** 各单元选用的纹样实例 id；缺省按 style 取内置默认 */
  patternIds: Partial<Record<UnitKind, ID>>;
  /** 默认金箔种类 id */
  foil: string;
  /** 不同贴金部位使用的金箔 id（缺省回落到 foil） */
  foilByRegion?: Record<string, string>;
  /** 贴金部位开关，key 为部位标识 */
  goldRegions: Record<string, boolean>;
  /** 是否做沥粉 */
  lifen: boolean;
  /** 手动指定相邻错色奇偶；undefined 时由网格自动推算 */
  parity?: 0 | 1;
  /** 手动改色：zoneId -> 颜色 */
  colorOverrides: Record<string, ColorKey>;
  /** 手动指定旋花谱式（不选则按长度自动） */
  compositionOverride?: string;
}

export interface Member {
  id: ID;
  code: string;
  name: string;
  category: Category;
  /** 顺纹长度 L */
  lengthMm: number;
  /** 面高 H（矩形/梁/垫板）；圆檩时可留 0，取 diameter */
  heightMm: number;
  section: SectionInfo;
  /** 弧面构件：true 时谱面高按截面弧长展开 */
  curved: boolean;
  pose?: Pose;
  grid?: GridPos;
  draft: DraftConfig;
}

/** 五开间测试殿等殿堂的整体描述，供三维生成 */
export interface HallDesc {
  title: string;
  bays: number;
  bayWidthsMm: number[];
  columnHeightMm: number;
  columnDiameterMm: number;
  depthMm: number;
}

export interface Project {
  id: ID;
  name: string;
  client?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
  hall?: HallDesc;
  members: Member[];
}

/** 可调参数规格（纹样库编辑器自动生成表单） */
export interface ParamSpec {
  key: string;
  label: string;
  type: 'number' | 'range' | 'color' | 'select' | 'boolean';
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  default: number | string | boolean;
  unit?: string;
}

/** 可持久化的参数化纹样实例（渲染器用 renderer key 在代码注册表中查找） */
export interface PatternInstance {
  id: ID;
  name: string;
  category: PatternCategory;
  unit: UnitKind;
  renderer: string;
  builtin?: boolean;
  params: Record<string, number | string | boolean>;
  paramSchema?: ParamSpec[];
}

export interface FoilDef {
  id: string;
  name: string;
  color: string;
  metalness: number;
  roughness: number;
  envIntensity: number;
}

export interface PaperSettings {
  size: 'A4' | 'A3' | 'A2' | 'A1';
  orientation: 'auto' | 'portrait' | 'landscape';
  marginMm: number;
  overlapMm: number;
  dpi: 150 | 200 | 300;
}

export interface Settings {
  doukouMm: number;
  rule: import('./caihua/rules').RuleParams;
  palette: Record<ColorKey, string>;
  foils: FoilDef[];
  paper: PaperSettings;
}

/** 导出包格式 */
export interface ProjectPackage {
  app: 'caihua-studio';
  format: 1;
  exportedAt: number;
  project: Project;
  customPatterns: PatternInstance[];
  settings?: Settings;
}
