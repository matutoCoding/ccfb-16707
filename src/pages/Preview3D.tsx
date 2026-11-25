import { useEffect, useMemo, useRef, useState } from 'react';
import { HallScene } from '../three/HallScene';
import { useStore } from '../lib/store';
import { useSelectedMemberId } from '../lib/selection';
import { Switch } from '../components/ui';
import { CATEGORY_LABEL } from '../lib/settings';
import type { Route } from '../components/ui';

const SHICHEN = [
  [23, 1, '子时'], [1, 3, '丑时'], [3, 5, '寅时'], [5, 7, '卯时'],
  [7, 9, '辰时'], [9, 11, '巳时'], [11, 13, '午时'], [13, 15, '未时'],
  [15, 17, '申时'], [17, 19, '酉时'], [19, 21, '戌时'], [21, 23, '亥时'],
] as const;

function shichenName(h: number): string {
  for (const [a, b, n] of SHICHEN) {
    if (a === 23 && (h >= 23 || h < 1)) return n;
    if (a !== 23 && h >= a && h < b) return n;
  }
  return '子时';
}

export default function Preview3D({ go }: { go: (r: Route) => void }) {
  const { current, settings, library } = useStore();
  const [selectedId, setSelectedId] = useSelectedMemberId();
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HallScene | null>(null);
  const [hour, setHour] = useState(10.4);
  const [autoRotate, setAutoRotate] = useState(false);
  const [roof, setRoof] = useState(false);
  const [ready3d, setReady3d] = useState(false);

  const members = current?.members ?? [];
  const selected = members.find((m) => m.id === selectedId) ?? null;

  // 创建场景（仅一次）
  useEffect(() => {
    if (!hostRef.current) return;
    const scene = new HallScene(hostRef.current, (id) => setSelectedId(id));
    sceneRef.current = scene;
    setReady3d(true);
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 数据变化重建（防抖）
  const dataVersion = useMemo(
    () => JSON.stringify({ n: members.length, updated: current?.updatedAt, s: settings, lib: library.map((p) => p.id + JSON.stringify(p.params)) }),
    [current, settings, library, members.length],
  );
  useEffect(() => {
    if (!sceneRef.current || !current) return;
    const t = setTimeout(() => {
      sceneRef.current?.setProject(current, settings, library);
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion, ready3d]);

  useEffect(() => sceneRef.current?.setTime(hour), [hour, ready3d]);
  useEffect(() => sceneRef.current?.setAutoRotate(autoRotate), [autoRotate, ready3d]);
  useEffect(() => sceneRef.current?.setRoofVisible(roof), [roof, ready3d]);

  if (!current) {
    return (
      <div className="empty">
        <div className="big">🏯</div>
        <p>请先打开项目</p>
        <button className="btn primary" onClick={() => go('projects')}>项目列表</button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <h2>三维预览 · 整座殿梁架</h2>
        <span className="desc">拖拽旋转 / 滚轮缩放 / 右键平移；点击构件可选中。金箔反射随视角与时辰变化</span>
        <span className="spacer" />
        {selected && (
          <button className="btn qing" onClick={() => go('draft')}>
            对着“{selected.name}”起谱 →
          </button>
        )}
      </div>
      <div className="preview3d">
        <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
        <div className="hud">
          <h4>时辰与光照</h4>
          <div className="time-row">
            <span className="shichen">{shichenName(hour)}</span>
            <input
              type="range" min={0} max={23.9} step={0.1} value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
            />
            <span className="mono" style={{ width: 42, textAlign: 'right' }}>{hour.toFixed(1)}时</span>
          </div>
          <div className="hint" style={{ color: '#b09c72', marginBottom: 10 }}>
            光线从明间隔扇门与次间槛窗透入；夜间灯笼亮起。
          </div>
          <div className="kv"><span className="k">自动环览</span>
            <Switch on={autoRotate} onChange={setAutoRotate} />
          </div>
          <div className="kv"><span className="k">显示屋顶</span>
            <Switch on={roof} onChange={setRoof} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn sm" style={{ flex: 1 }} onClick={() => sceneRef.current?.resetView()}>重置视角</button>
            {selected && (
              <button className="btn sm primary" style={{ flex: 1 }} onClick={() => selected && sceneRef.current?.focusMember(selected.id)}>
                聚焦所选
              </button>
            )}
          </div>
        </div>
        <div className="hud-right">
          <span className="badge gold" style={{ padding: '6px 12px' }}>构件 {members.length}</span>
        </div>
        {selected && (
          <div className="focus-chip">
            {CATEGORY_LABEL[selected.category]} · {selected.code} · {selected.name}（{selected.lengthMm}×{selected.heightMm}mm）
          </div>
        )}
      </div>
    </div>
  );
}
