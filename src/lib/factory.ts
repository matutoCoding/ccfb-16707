import type { Member, Category } from '../types';
import { uid } from './uid';
import { defaultGoldRegions } from './settings';

export function createMember(category: Category = 'fang', partial: Partial<Member> = {}): Member {
  const height = category === 'lin' ? 360 : category === 'dianban' ? 200 : 520;
  const length = category === 'lin' ? 6000 : 4200;
  return {
    id: uid('m-'),
    code: partial.code ?? `M-${Math.floor(100 + Math.random() * 899)}`,
    name: partial.name ?? '新构件',
    category,
    lengthMm: length,
    heightMm: height,
    section:
      category === 'lin'
        ? { shape: 'round', widthMm: height, heightMm: height, diameterMm: height, arcAngleDeg: 200 }
        : { shape: 'rect', widthMm: 300, heightMm: height },
    curved: category === 'lin',
    pose: { x: 0, y: 4500, z: 0, rotY: 0 },
    grid: { line: '', run: '', bay: 0, course: 0, orientation: 'x' },
    draft: {
      style: 'xuanzi',
      grade: '烟琢墨石碾玉',
      heziMode: 'auto',
      patternIds: {},
      foil: 'kujin',
      goldRegions: defaultGoldRegions(),
      lifen: true,
      colorOverrides: {},
    },
    ...partial,
  };
}
