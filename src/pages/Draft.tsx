import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { useSelectedMemberId } from '../lib/selection';
import { usePrint } from '../components/PrintRoot';
import { useToast, Switch } from '../components/ui';
import {
  CATEGORY_LABEL,
  STYLE_LABEL,
  UNIT_LABEL,
  COLOR_LABEL,
  GOLD_REGION_DEFS,
} from '../lib/settings';
import { effectiveLayout, renderPassCanvas, paintDraft } from '../caihua/draftPaint';
import { colorZones, checkColorRules, resetColors, memberParity, arrangeColors } from '../caihua/colors';
import { nameComposition } from '../caihua/rules';
import { resolvePatternId, getPattern } from '../caihua/patterns';
import type { Member, UnitKind, ColorKey, PatternCategory } from '../types';
import type { Route } from '../components/ui';

type Tab = 'rule' | 'pattern' | 'color' | 'gold';

export default function Draft({ go }: { go: (r: Route) => void }) {
  const { current } = useStore();
  const [selectedId, setSelectedId] = useSelectedMemberId();
  const members = current?.members ?? [];
  const member = members.find((m) => m.id === selectedId) ?? members[0] ?? null;

  if (!current) return <NoProject go={go} />;
  if (!member)
    return (
      <div className="empty">
        <div className="big">📐</div>
        <p>还没有构件，先去录入一根吧</p>
        <button className="btn primary" onClick={() => go('members')}>
          构件录入
        </button>
      </div>
    );

  return <Workspace key={member.id} member={member} onPick={setSelectedId} go={go} />;
}

function NoProject({ go }: { go: (r: Route) => void }) {
  return (
    <div className="empty">
      <div className="big">📁</div>
      <p>请先选择或新建项目</p>
      <button className="btn primary" onClick={() => go('projects')}>
        项目列表
      </button>
    </div>
  );
}

function Workspace({ member, onPick, go }: { member: Member; onPick: (id: string | null) => void; go: (r: Route) => void }) {
  const { current, updateCurrent, settings, library } = useStore();
  const print = usePrint();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('rule');
  const [mode, setMode] = useState<'color' | 'line'>('color');
  const [showCodes, setShowCodes] = useState(true);

  const update = (patch: Partial<Member>) =>
    current &&
    updateCurrent((p) => ({ ...p, members: p.members.map((m) => (m.id === member.id ? { ...m, ...patch } : m)) }));
  const updateDraft = (patch: Partial<Member['draft']>) => update({ draft: { ...member.draft, ...patch } });

  const layout = useMemo(() => effectiveLayout(member, settings), [member, settings]);
  const zones = useMemo(() => colorZones(member, layout), [member, layout]);
  const violations = useMemo(() => (current ? checkColorRules(current) : []), [current]);
  const memberViolations = violations.filter((v) => v.memberId === member.id);

  const downloadPng = (pass: 'beauty' | 'line') => {
    const canvas = renderPassCanvas(member, settings, library, pass, 4096);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${member.code}-${pass === 'beauty' ? '彩图' : '墨线谱'}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
    toast('已导出 PNG');
  };

  return (
    <div>
      <div className="page-head">
        <h2>起谱</h2>
        <select style={{ width: 320 }} value={member.id} onChange={(e) => onPick(e.target.value)}>
          {current?.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} · {m.name}（{CATEGORY_LABEL[m.category]}）
            </option>
          ))}
        </select>
        {layout.warnings.length > 0 && (
          <span className={`badge ${layout.warnings.some((w) => w.level === 'error') ? 'err' : 'warn'}`}>
            ⚠ {layout.warnings.length} 条规制提示
          </span>
        )}
        {memberViolations.some((v) => v.kind === 'adjacent-zone') && <span className="badge err">配色违规</span>}
        <span className="spacer" />
        <button className="btn" onClick={() => downloadPng('line')}>
          导出墨线 PNG
        </button>
        <button className="btn" onClick={() => downloadPng('beauty')}>
          导出彩图 PNG
        </button>
        <button className="btn primary" onClick={() => print([member])}>
          🖨 足尺分页 / 打印
        </button>
      </div>

      <div className="draft-layout">
        <div className="draft-stage">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="seg">
              <button className={mode === 'color' ? 'active' : ''} onClick={() => setMode('color')}>
                彩画效果
              </button>
              <button className={mode === 'line' ? 'active' : ''} onClick={() => setMode('line')}>
                墨线谱
              </button>
            </div>
            {mode === 'line' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={showCodes} onChange={(e) => setShowCodes(e.target.checked)} /> 青/绿/金色标
              </label>
            )}
            <span className="spacer" style={{ flex: 1 }} />
            <span className="hint">
              谱子指纹 <b className="mono">#{layout.fingerprint}</b>（同参数刷新不变）
            </span>
          </div>

          <div className="canvas-wrap">
            <DraftCanvas member={member} mode={mode} showCodes={showCodes} zones={zones} />
          </div>

          <div className="card">
            <div className="ruler-info">
              <span>
                全长 <b>{layout.lengthMm.toFixed(0)}</b> mm
              </span>
              <span>
                谱面高 <b>{layout.faceHeightMm.toFixed(0)}</b> mm{layout.developed ? '（截面展开）' : ''}
              </span>
              <span>
                三停各 <b>{layout.thirdWidthMm.toFixed(0)}</b> mm（枋心 {((settings.rule.fangxinRatio) * 100).toFixed(2)}%）
              </span>
              <span>
                箍头 <b>{layout.gutouL.w.toFixed(0)}</b>
              </span>
              <span>
                找头 <b>{layout.zhaotouL.w.toFixed(0)}</b>
              </span>
              <span>
                谱式 <b>{layout.compL.name}</b>
              </span>
              <span>
                份数 <b>{layout.compL.units}</b> · 加路 <b>{layout.compL.lanes}</b>
              </span>
              <span>
                旋花径 <b>{layout.compL.diameterMm.toFixed(0)}</b>
              </span>
            </div>
            {layout.developed && <div className="hint" style={{ marginTop: 6 }}>{layout.developNote}</div>}
          </div>

          {layout.warnings.length > 0 && (
            <div className="card">
              {layout.warnings.map((w, i) => (
                <div key={i} className={`warn-item ${w.level}`}>
                  <span>{w.level === 'error' ? '⛔' : w.level === 'warn' ? '⚠️' : 'ℹ️'}</span>
                  <span>{w.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="side-panel">
          <div className="tabs">
            <button className={tab === 'rule' ? 'active' : ''} onClick={() => setTab('rule')}>
              规制
            </button>
            <button className={tab === 'pattern' ? 'active' : ''} onClick={() => setTab('pattern')}>
              纹样
            </button>
            <button className={tab === 'color' ? 'active' : ''} onClick={() => setTab('color')}>
              颜色
            </button>
            <button className={tab === 'gold' ? 'active' : ''} onClick={() => setTab('gold')}>
              贴金
            </button>
          </div>

          {tab === 'rule' && <RuleTab member={member} updateDraft={updateDraft} layout={layout} />}
          {tab === 'pattern' && <PatternTab member={member} updateDraft={updateDraft} go={go} />}
          {tab === 'color' && (
            <ColorTab member={member} updateDraft={updateDraft} zones={zones} violations={violations} onPick={onPick} />
          )}
          {tab === 'gold' && <GoldTab member={member} updateDraft={updateDraft} />}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
function DraftCanvas({
  member,
  mode,
  showCodes,
  zones,
}: {
  member: Member;
  mode: 'color' | 'line';
  showCodes: boolean;
  zones: ReturnType<typeof colorZones>;
}) {
  const { settings, library } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(900);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((es) => setWidth(es[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const layout = effectiveLayout(member, settings);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const ppm = (width * dpr) / layout.lengthMm;
    canvas.width = Math.round(layout.lengthMm * ppm);
    canvas.height = Math.round(layout.faceHeightMm * ppm);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ppm, 0, 0, ppm, 0, 0);
    paintDraft(ctx, member, {
      settings,
      library,
      pass: mode === 'color' ? 'beauty' : 'line',
      colorCodes: mode === 'line' && showCodes,
    });
  }, [width, layout.lengthMm, layout.faceHeightMm, member, settings, library, mode, showCodes]);

  const H = layout.faceHeightMm;
  const L = layout.lengthMm;
  const labelFor = (zoneId: string): string => {
    if (zoneId.startsWith('gutou')) return '箍头';
    if (zoneId.startsWith('hezi')) return '盒子';
    if (zoneId.startsWith('zhaotou')) return `找头·${layout.compL.name}`;
    return '枋心';
  };

  return (
    <div ref={ref} className="canvas-inner" style={{ width: '100%' }}>
      <canvas ref={canvasRef} style={{ width: '100%', aspectRatio: `${L} / ${H}` }} />
      <div className="zone-overlay">
        {zones.map((z) => (
          <span
            key={z.zoneId}
            className="zone-label"
            style={{
              left: `${((z.rect.x + z.rect.w / 2) / L) * 100}%`,
              top: `${((z.rect.y + z.rect.h / 2) / H) * 100}%`,
            }}
          >
            {labelFor(z.zoneId)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
function RuleTab({
  member,
  updateDraft,
  layout,
}: {
  member: Member;
  updateDraft: (p: Partial<Member['draft']>) => void;
  layout: ReturnType<typeof effectiveLayout>;
}) {
  const { settings } = useStore();
  const p = settings.rule;
  const overrideOptions = useMemo(() => {
    const units = [1, 2, 3, 4, ...Array.from({ length: 12 }, (_, i) => 4 + i + 1)];
    return [
      { key: 'auto', name: `自动（当前：${layout.compL.name}）` },
      ...units.map((m) => {
        const n = nameComposition(m, p);
        return { key: n.key, name: n.name };
      }),
    ];
  }, [layout.compL.name, p]);

  return (
    <div className="card" style={{ padding: 14 }}>
      <label className="field" style={{ marginBottom: 12 }}>
        彩画类别
        <div className="seg" style={{ width: '100%' }}>
          {(['hexi', 'xuanzi', 'sushi'] as PatternCategory[]).map((s) => (
            <button
              key={s}
              className={member.draft.style === s ? 'active' : ''}
              onClick={() => updateDraft({ style: s, patternIds: {} })}
            >
              {STYLE_LABEL[s].replace('彩画', '')}
            </button>
          ))}
        </div>
      </label>
      <label className="field" style={{ marginBottom: 12 }}>
        等级做法
        <input value={member.draft.grade} onChange={(e) => updateDraft({ grade: e.target.value })} list="grades" />
        <datalist id="grades">
          <option value="金琢墨石碾玉" />
          <option value="烟琢墨石碾玉" />
          <option value="金线大点金" />
          <option value="墨线小点金" />
          <option value="雅伍墨" />
        </datalist>
      </label>
      <label className="field" style={{ marginBottom: 12 }}>
        盒子
        <div className="seg">
          {(['auto', 'on', 'off'] as const).map((m) => (
            <button key={m} className={member.draft.heziMode === m ? 'active' : ''} onClick={() => updateDraft({ heziMode: m })}>
              {m === 'auto' ? '按长度自动' : m === 'on' ? '必设盒子' : '不设盒子'}
            </button>
          ))}
        </div>
      </label>
      <label className="field" style={{ marginBottom: 12 }}>
        找头旋花谱式（可手动指定校验）
        <select
          value={member.draft.compositionOverride ?? 'auto'}
          onChange={(e) => updateDraft({ compositionOverride: e.target.value === 'auto' ? undefined : e.target.value })}
        >
          {overrideOptions.map((o) => (
            <option key={o.key} value={o.key}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <div className="hint">
        模数：斗口 {settings.doukouMm}mm；三停比例 {Math.round(p.fangxinRatio * 1000) / 10}%；旋花径系数{' '}
        {p.flowerHeightRatio}。可在“设置”中调整则例参数。
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
function PatternTab({
  member,
  updateDraft,
  go,
}: {
  member: Member;
  updateDraft: (p: Partial<Member['draft']>) => void;
  go: (r: Route) => void;
}) {
  const { library } = useStore();
  const units: UnitKind[] = ['gutou', 'hezi', 'zhaotou', 'fangxin'];
  return (
    <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {units.map((u) => {
        const id = resolvePatternId(member.draft.style, u, member.draft.patternIds[u], library);
        const current = getPattern(id, library);
        const options = library.filter((p) => p.unit === u);
        return (
          <label className="field" key={u}>
            {UNIT_LABEL[u]}
            <select
              value={id}
              onChange={(e) => updateDraft({ patternIds: { ...member.draft.patternIds, [u]: e.target.value } })}
            >
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  [{STYLE_LABEL[p.category].replace('彩画', '')}] {p.name}
                </option>
              ))}
            </select>
            <span className="hint">当前生成器：{current?.renderer}</span>
          </label>
        );
      })}
      <button className="btn" onClick={() => go('library')}>
        ＋ 去纹样库自建参数化纹样
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------------
function ColorTab({
  member,
  updateDraft,
  zones,
  violations,
  onPick,
}: {
  member: Member;
  updateDraft: (p: Partial<Member['draft']>) => void;
  zones: ReturnType<typeof colorZones>;
  violations: ReturnType<typeof checkColorRules>;
  onPick: (id: string | null) => void;
}) {
  const { current, updateCurrent } = useStore();
  const parity = memberParity(member);
  const setZoneColor = (zoneId: string, value: string) => {
    const ov = { ...member.draft.colorOverrides };
    if (value === 'auto') delete ov[zoneId];
    else ov[zoneId] = value as ColorKey;
    updateDraft({ colorOverrides: ov });
  };
  const projectViolations = violations;
  return (
    <>
      <div className="card" style={{ padding: 14 }}>
        <div className="kv">
          <span className="k">相邻错色奇偶</span>
          <span className="v">
            {member.draft.parity == null ? `自动（${parity === 0 ? '青起' : '绿起'}）` : `手动（${parity === 0 ? '青起' : '绿起'}）`}
          </span>
        </div>
        <div className="seg" style={{ margin: '10px 0 14px' }}>
          <button className={member.draft.parity == null ? 'active' : ''} onClick={() => updateDraft({ parity: undefined })}>
            自动
          </button>
          <button className={member.draft.parity === 0 ? 'active' : ''} onClick={() => updateDraft({ parity: 0 })}>
            青起
          </button>
          <button className={member.draft.parity === 1 ? 'active' : ''} onClick={() => updateDraft({ parity: 1 })}>
            绿起
          </button>
          <button
            onClick={() => {
              const r = resetColors(member).draft;
              updateDraft({ parity: r.parity, colorOverrides: r.colorOverrides });
            }}
          >
            恢复规矩
          </button>
        </div>

        {zones.map((z) => (
          <div className="kv" key={z.zoneId}>
            <span className="k">
              <span className={`swatch`} style={{ background: z.color === 'qing' ? 'var(--qing)' : 'var(--lv)', marginRight: 7 }} />
              {z.label}
              {z.color !== z.auto && <span className="badge warn" style={{ marginLeft: 6 }}>手改</span>}
            </span>
            <select style={{ width: 110 }} value={member.draft.colorOverrides[z.zoneId] ?? 'auto'} onChange={(e) => setZoneColor(z.zoneId, e.target.value)}>
              <option value="auto">自动·{COLOR_LABEL[z.auto]}</option>
              <option value="qing">青</option>
              <option value="lv">绿</option>
            </select>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <b>全项目违规检查</b>
          <span className="spacer" style={{ flex: 1 }} />
          <span className={`badge ${projectViolations.length ? 'err' : 'ok'}`}>
            {projectViolations.length ? `${projectViolations.length} 处违规` : '青绿相间 · 无违规'}
          </span>
        </div>
        {projectViolations.length > 0 && current && (
          <button
            className="btn sm primary"
            style={{ marginBottom: 10 }}
            onClick={() => {
              // 一键自动重排：相邻关系图二分染色，显式写入每根构件并清空手改
              updateCurrent((p) => ({ ...p, members: arrangeColors(p.members) }));
            }}
          >
            一键按规矩重排全部颜色
          </button>
        )}
        {projectViolations.slice(0, 30).map((v, i) => (
          <div
            key={i}
            className="warn-item error"
            style={{ cursor: v.memberId ? 'pointer' : 'default' }}
            onClick={() => v.memberId && onPick(v.memberId)}
          >
            ⛔ {v.message}
          </div>
        ))}
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------
function GoldTab({
  member,
  updateDraft,
}: {
  member: Member;
  updateDraft: (p: Partial<Member['draft']>) => void;
}) {
  const { settings } = useStore();
  const regionFoil = (key: string) => member.draft.foilByRegion?.[key] ?? '';
  const setRegionFoil = (key: string, fid: string) => {
    const map = { ...(member.draft.foilByRegion ?? {}) };
    if (!fid) delete map[key];
    else map[key] = fid;
    updateDraft({ foilByRegion: map });
  };
  return (
    <div className="card" style={{ padding: 14 }}>
      <label className="field" style={{ marginBottom: 12 }}>
        本构件默认金箔
        <select value={member.draft.foil} onChange={(e) => updateDraft({ foil: e.target.value })}>
          {settings.foils.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 12px' }}>
        <b>沥粉凸起</b>
        <Switch on={member.draft.lifen} onChange={(v) => updateDraft({ lifen: v })} />
      </div>
      <div className="hint" style={{ marginBottom: 8 }}>
        勾选贴金部位并可单独指定金箔；三维预览中金属反射随视角与时辰变化，沥粉线路有凹凸立体感。
      </div>
      {GOLD_REGION_DEFS.map((g) => (
        <div className="gold-row" key={g.key}>
          <input
            type="checkbox"
            checked={!!member.draft.goldRegions[g.key]}
            onChange={(e) => updateDraft({ goldRegions: { ...member.draft.goldRegions, [g.key]: e.target.checked } })}
          />
          <span style={{ flex: 1, fontSize: 13 }}>{g.label}</span>
          <select value={regionFoil(g.key)} onChange={(e) => setRegionFoil(g.key, e.target.value)}>
            <option value="">同默认</option>
            {settings.foils.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name.split('（')[0]}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
