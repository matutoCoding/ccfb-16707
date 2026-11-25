import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { CATEGORY_LABEL } from '../lib/settings';
import { createMember } from '../lib/factory';
import { developFaceHeight } from '../caihua/rules';
import { useSelectedMemberId } from '../lib/selection';
import { useToast } from '../components/ui';
import type { Category, Member } from '../types';
import type { Route } from '../components/ui';

const CATS: (Category | 'all')[] = ['all', 'liang', 'fang', 'lin', 'dianban'];

export default function Members({ go }: { go: (r: Route) => void }) {
  const { current, updateCurrent } = useStore();
  const toast = useToast();
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useSelectedMemberId();

  const members = current?.members ?? [];
  const filtered = useMemo(
    () =>
      members.filter(
        (m) =>
          (cat === 'all' || m.category === cat) &&
          (!q || m.name.includes(q) || m.code.toLowerCase().includes(q.toLowerCase())),
      ),
    [members, cat, q],
  );
  const selected = members.find((m) => m.id === selectedId) ?? filtered[0] ?? members[0] ?? null;

  const patch = (patchObj: Partial<Member>) => {
    if (!selected || !current) return;
    updateCurrent((p) => ({
      ...p,
      members: p.members.map((m) => (m.id === selected.id ? { ...m, ...patchObj } : m)),
    }));
  };
  const patchSection = (s: Partial<Member['section']>) => {
    if (!selected) return;
    patch({ section: { ...selected.section, ...s } });
  };

  const addMember = () => {
    if (!current) return;
    const m = createMember(cat === 'all' ? 'fang' : cat);
    updateCurrent((p) => ({ ...p, members: [...p.members, m] }));
    setSelectedId(m.id);
    toast('已添加构件，请完善尺寸');
  };

  const remove = (id: string) => {
    if (!current) return;
    updateCurrent((p) => ({ ...p, members: p.members.filter((m) => m.id !== id) }));
    if (selectedId === id) setSelectedId(null);
    toast('构件已删除');
  };

  if (!current) return <EmptyProject go={go} />;

  const dev = selected ? developFaceHeight(selected) : null;

  return (
    <div>
      <div className="page-head">
        <h2>构件录入</h2>
        <span className="desc">按梁 / 枋 / 檩 / 垫板分类，尺寸单位毫米；圆檩与弧面构件按包角展开成谱面高</span>
        <span className="spacer" />
        <button className="btn primary" onClick={addMember}>
          ＋ 录入构件
        </button>
      </div>

      <div className="comp-layout">
        <div className="card" style={{ padding: 14 }}>
          <div className="seg" style={{ marginBottom: 10, width: '100%' }}>
            {CATS.map((c) => (
              <button key={c} className={cat === c ? 'active' : ''} onClick={() => setCat(c)} style={{ flex: 1 }}>
                {c === 'all' ? '全部' : CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <input className="search" placeholder="搜索名称 / 编号" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
          <div className="member-list">
            {filtered.map((m) => (
              <div
                key={m.id}
                className={`member-row ${selected?.id === m.id ? 'active' : ''}`}
                onClick={() => setSelectedId(m.id)}
              >
                <div className={`cat-tag cat-${m.category}`}>{CATEGORY_LABEL[m.category]}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="mr-name">{m.name}</div>
                  <div className="mr-sub mono">
                    {m.code} · {m.lengthMm}×{m.heightMm}
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="empty">该分类下暂无构件</div>}
          </div>
        </div>

        {selected ? (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div className={`cat-tag cat-${selected.category}`} style={{ width: 42, height: 42, fontSize: 17 }}>
                {CATEGORY_LABEL[selected.category]}
              </div>
              <input
                value={selected.name}
                onChange={(e) => patch({ name: e.target.value })}
                style={{ fontSize: 17, fontWeight: 800, flex: 1 }}
              />
              <button className="btn qing" onClick={() => { setSelectedId(selected.id); go('draft'); }}>
                去起谱 →
              </button>
              <button className="btn danger" onClick={() => remove(selected.id)}>
                删除
              </button>
            </div>

            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <label className="field">
                编号
                <input value={selected.code} onChange={(e) => patch({ code: e.target.value })} />
              </label>
              <label className="field">
                分类
                <select value={selected.category} onChange={(e) => patch({ category: e.target.value as Category })}>
                  {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                截面形式
                <select
                  value={selected.section.shape}
                  onChange={(e) => {
                    const shape = e.target.value as Member['section']['shape'];
                    if (shape === 'round')
                      patch({ curved: true, section: { ...selected.section, shape, diameterMm: selected.heightMm, arcAngleDeg: 200 } });
                    else patch({ curved: shape !== 'rect', section: { ...selected.section, shape } });
                  }}
                >
                  <option value="rect">矩形截面</option>
                  <option value="round">圆形截面（檩柱）</option>
                  <option value="arc">弧面截面</option>
                </select>
              </label>

              <label className="field">
                顺纹长度 L (mm)
                <input
                  type="number"
                  value={selected.lengthMm}
                  min={1}
                  onChange={(e) => patch({ lengthMm: Math.max(1, Number(e.target.value) || 0) })}
                />
              </label>

              {selected.section.shape === 'rect' && (
                <>
                  <label className="field">
                    截面高 H (mm)
                    <input
                      type="number"
                      value={selected.heightMm}
                      onChange={(e) => {
                        const h = Number(e.target.value) || 0;
                        patch({ heightMm: h, section: { ...selected.section, heightMm: h } });
                      }}
                    />
                  </label>
                  <label className="field">
                    截面宽 B (mm)
                    <input
                      type="number"
                      value={selected.section.widthMm}
                      onChange={(e) => patchSection({ widthMm: Number(e.target.value) || 0 })}
                    />
                  </label>
                </>
              )}

              {selected.section.shape === 'round' && (
                <>
                  <label className="field">
                    直径 D (mm)
                    <input
                      type="number"
                      value={selected.section.diameterMm ?? selected.heightMm}
                      onChange={(e) => {
                        const d = Number(e.target.value) || 0;
                        patch({ heightMm: d, section: { ...selected.section, diameterMm: d, heightMm: d, widthMm: d } });
                      }}
                    />
                  </label>
                  <label className="field">
                    起谱包角 (°)
                    <input
                      type="number"
                      min={30}
                      max={360}
                      value={selected.section.arcAngleDeg ?? 180}
                      onChange={(e) => patchSection({ arcAngleDeg: Number(e.target.value) || 180 })}
                    />
                  </label>
                </>
              )}

              {selected.section.shape === 'arc' && (
                <>
                  <label className="field">
                    弧半径 R (mm)
                    <input
                      type="number"
                      value={selected.section.radiusMm ?? 300}
                      onChange={(e) => patchSection({ radiusMm: Number(e.target.value) || 0 })}
                    />
                  </label>
                  <label className="field">
                    弧面夹角 (°)
                    <input
                      type="number"
                      value={selected.section.arcAngleDeg ?? 120}
                      onChange={(e) => patchSection({ arcAngleDeg: Number(e.target.value) || 0 })}
                    />
                  </label>
                </>
              )}

              <label className="field" style={{ justifyContent: 'center' }}>
                弧面展开起谱
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36 }}>
                  <input
                    type="checkbox"
                    checked={selected.curved}
                    onChange={(e) => patch({ curved: e.target.checked })}
                  />
                  <span className="hint">{dev?.developed ? '按截面弧长展开' : '平面构件'}</span>
                </span>
              </label>
            </div>

            <div className="card" style={{ background: 'var(--paper-2)', marginTop: 16, boxShadow: 'none' }}>
              <div className="kv">
                <span className="k">起谱面高（展开后）</span>
                <span className="v">{dev?.faceHeightMm.toFixed(0)} mm</span>
              </div>
              {dev?.note && <div className="hint" style={{ marginTop: 6 }}>{dev.note}</div>}
            </div>

            <h4 style={{ margin: '20px 0 10px' }}>三维安装位置与相邻关系（高级）</h4>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
              {(['x', 'y', 'z'] as const).map((axis) => (
                <label className="field" key={axis}>
                  位置 {axis.toUpperCase()} (mm)
                  <input
                    type="number"
                    value={selected.pose?.[axis] ?? 0}
                    onChange={(e) => patch({ pose: { ...(selected.pose ?? { x: 0, y: 0, z: 0 }), [axis]: Number(e.target.value) || 0 } })}
                  />
                </label>
              ))}
              <label className="field">
                绕 Y 转角 (°)
                <input
                  type="number"
                  value={selected.pose?.rotY ?? 0}
                  onChange={(e) =>
                    patch({ pose: { ...(selected.pose ?? { x: 0, y: 0, z: 0 }), rotY: Number(e.target.value) || 0 } })
                  }
                />
              </label>
              <label className="field">
                轴线 / 缝
                <input value={selected.grid?.line ?? ''} onChange={(e) => patch({ grid: { ...selected.grid!, line: e.target.value } })} />
              </label>
              <label className="field">
                作作线路(run)
                <input value={selected.grid?.run ?? ''} onChange={(e) => patch({ grid: { ...selected.grid!, run: e.target.value } })} />
              </label>
              <label className="field">
                第几间 bay
                <input
                  type="number"
                  value={selected.grid?.bay ?? 0}
                  onChange={(e) => patch({ grid: { ...selected.grid!, bay: Number(e.target.value) || 0 } })}
                />
              </label>
              <label className="field">
                皮数 course
                <input
                  type="number"
                  value={selected.grid?.course ?? 0}
                  onChange={(e) => patch({ grid: { ...selected.grid!, course: Number(e.target.value) || 0 } })}
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="card empty">
            <div className="big">📐</div>
            从左侧选择或新建一根构件
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyProject({ go }: { go: (r: Route) => void }) {
  return (
    <div className="empty">
      <div className="big">📁</div>
      <p>还没有打开的项目</p>
      <button className="btn primary" onClick={() => go('projects')}>
        去项目列表
      </button>
    </div>
  );
}
