import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { STYLE_LABEL, UNIT_LABEL } from '../lib/settings';
import { allRendererMetas, getRenderer, rendererEntries } from '../caihua/patterns';
import { computeLayout, DEFAULT_RULES } from '../caihua/rules';
import { effectiveLayout } from '../caihua/draftPaint';
import { Painter } from '../caihua/painter';
import { uid } from '../lib/uid';
import { useToast, Switch } from '../components/ui';
import type { PatternInstance, PatternCategory, UnitKind, ParamSpec } from '../types';
import { createMember } from '../lib/factory';

function PatternThumb({ pattern, height = 150 }: { pattern: PatternInstance; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { settings } = useStore();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const Wmm = 220;
    const Hmm = 104;
    const ppm = 3;
    canvas.width = Wmm * ppm;
    canvas.height = Hmm * ppm;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(ppm, 0, 0, ppm, 0, 0);

    const fake = createMember('fang', { lengthMm: 2200, heightMm: 320 });
    fake.draft.heziMode = 'on';
    const layout = effectiveLayout(fake, settings);
    const zone =
      pattern.unit === 'gutou'
        ? layout.gutouL
        : pattern.unit === 'hezi'
          ? (layout.heziL ?? { x: 60, y: 24, w: 272, h: 272 })
          : pattern.unit === 'zhaotou'
            ? layout.zhaotouL
            : layout.fangxin;

    const foil = settings.foils[0];
    const R = new Painter(ctx, {
      pass: 'beauty',
      palette: settings.palette,
      foil,
      goldRegions: { xuanhua: true, hezi: true, gutou: true, fangxinkuang: true, fangxinwen: true, zhuxian: true },
      lifenOn: true,
    });
    R.background(Wmm, Hmm);
    R.rect(1.5, 1.5, Wmm - 3, Hmm - 3, { fill: null, stroke: 'mo', lw: 1.2 });

    // 把真实布局中的单元区等比放进缩略图画框
    const pad = 12;
    const s = Math.min((Wmm - pad * 2) / zone.w, (Hmm - pad * 2) / zone.h);
    ctx.save();
    ctx.translate(Wmm / 2, Hmm / 2);
    ctx.scale(s, s);
    ctx.translate(-(zone.x + zone.w / 2), -(zone.y + zone.h / 2));

    R.rect(zone.x, zone.y, zone.w, zone.h, { fill: 'qing' });
    const meta = getRenderer(pattern.renderer);
    if (meta) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(zone.x, zone.y, zone.w, zone.h);
      ctx.clip();
      meta.draw({ R, zone, layout, instance: pattern, base: 'qing', alt: 'lv' });
      ctx.restore();
    }
    R.rect(zone.x, zone.y, zone.w, zone.h, { fill: null, stroke: 'mo', lw: 1.6 / s });
    ctx.restore();
  }, [pattern, settings]);
  return <canvas ref={ref} style={{ width: '100%', height }} className="pat-thumb" />;
}

export default function Library() {
  const { library, savePattern, deletePattern } = useStore();
  const toast = useToast();
  const [cat, setCat] = useState<PatternCategory | 'all'>('all');
  const [unit, setUnit] = useState<UnitKind | 'all'>('all');
  const [editing, setEditing] = useState<PatternInstance | null>(null);

  const filtered = useMemo(
    () =>
      library.filter(
        (p) => (cat === 'all' || p.category === cat) && (unit === 'all' || p.unit === unit),
      ),
    [library, cat, unit],
  );

  const startNew = () => {
    const [rendererKey, meta] = rendererEntries()[0];
    const p: PatternInstance = {
      id: uid('pat-'),
      name: '我的新纹样',
      category: cat === 'all' ? 'xuanzi' : (cat as PatternCategory),
      unit: unit === 'all' ? 'zhaotou' : (unit as UnitKind),
      renderer: rendererKey,
      params: Object.fromEntries((meta.schema ?? []).map((s) => [s.key, s.default])),
      paramSchema: meta.schema,
    };
    setEditing(p);
  };

  return (
    <div>
      <div className="page-head">
        <h2>纹样库</h2>
        <span className="desc">和玺 · 旋子 · 苏式；箍头 / 盒子 / 找头 / 枋心单元全部参数化，可自建纹样</span>
        <span className="spacer" />
        <button className="btn primary" onClick={startNew}>
          ＋ 自建纹样
        </button>
      </div>

      <div className="lib-layout">
        <div>
          <div className="seg" style={{ marginBottom: 10 }}>
            {(['all', 'hexi', 'xuanzi', 'sushi'] as const).map((c) => (
              <button key={c} className={cat === c ? 'active' : ''} onClick={() => setCat(c)}>
                {c === 'all' ? '全部' : STYLE_LABEL[c]}
              </button>
            ))}
          </div>
          <div className="seg" style={{ marginBottom: 14 }}>
            {(['all', 'gutou', 'hezi', 'zhaotou', 'fangxin'] as const).map((u) => (
              <button key={u} className={unit === u ? 'active' : ''} onClick={() => setUnit(u)}>
                {u === 'all' ? '全部单元' : UNIT_LABEL[u]}
              </button>
            ))}
          </div>
          <div className="grid pat-grid">
            {filtered.map((p) => (
              <div key={p.id} className="card pat-card" onClick={() => setEditing(structuredClone(p))} style={{ cursor: 'pointer' }}>
                <PatternThumb pattern={p} />
                <h4>{p.name}</h4>
                <div className="tags">
                  <span className="badge gold">{STYLE_LABEL[p.category].replace('彩画', '')}</span>
                  <span className="badge qing">{UNIT_LABEL[p.unit]}</span>
                  {p.builtin ? <span className="badge gray">内置</span> : <span className="badge ok">自建</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {editing && (
          <PatternEditor
            pattern={editing}
            onChange={setEditing}
            onClose={() => setEditing(null)}
            onSave={async () => {
              // 内置纹样不直接覆盖，保存为自建副本
              const toSave: PatternInstance = editing.builtin
                ? { ...editing, id: uid('pat-'), builtin: false, name: `${editing.name}（自建）` }
                : editing;
              toSave.paramSchema = getRenderer(toSave.renderer)?.schema ?? toSave.paramSchema;
              await savePattern(toSave);
              toast(editing.builtin ? '已另存为自建纹样' : '纹样已保存');
              setEditing(toSave);
            }}
            onDelete={
              editing.builtin
                ? undefined
                : async () => {
                    await deletePattern(editing.id);
                    setEditing(null);
                    toast('纹样已删除');
                  }
            }
          />
        )}
      </div>
    </div>
  );
}

function PatternEditor({
  pattern,
  onChange,
  onSave,
  onClose,
  onDelete,
}: {
  pattern: PatternInstance;
  onChange: (p: PatternInstance) => void;
  onSave: () => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const meta = getRenderer(pattern.renderer);
  const schema: ParamSpec[] = pattern.paramSchema ?? meta?.schema ?? [];
  const setParam = (key: string, v: number | string | boolean) =>
    onChange({ ...pattern, params: { ...pattern.params, [key]: v } });

  return (
    <div className="card" style={{ position: 'sticky', top: 0 }}>
      <h3 style={{ marginBottom: 12 }}>纹样参数</h3>
      <PatternThumb pattern={pattern} height={150} />
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
        <label className="field" style={{ gridColumn: '1/-1' }}>
          名称
          <input value={pattern.name} onChange={(e) => onChange({ ...pattern, name: e.target.value })} />
        </label>
        <label className="field">
          类别
          <select value={pattern.category} onChange={(e) => onChange({ ...pattern, category: e.target.value as PatternCategory })}>
            {Object.entries(STYLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="field">
          单元
          <select value={pattern.unit} onChange={(e) => onChange({ ...pattern, unit: e.target.value as UnitKind })}>
            {Object.entries(UNIT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="field" style={{ gridColumn: '1/-1' }}>
          生成器
          <select
            value={pattern.renderer}
            onChange={(e) => {
              const m = getRenderer(e.target.value);
              onChange({
                ...pattern,
                renderer: e.target.value,
                paramSchema: m?.schema,
                params: Object.fromEntries((m?.schema ?? []).map((s) => [s.key, s.default])),
              });
            }}
          >
            {rendererEntries().map(([key, m]) => (
              <option key={key} value={key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {schema.map((s) => (
          <ParamControl key={s.key} spec={s} value={pattern.params[s.key] ?? s.default} onChange={(v) => setParam(s.key, v)} />
        ))}
        {schema.length === 0 && <div className="hint">该生成器没有可调参数。</div>}
      </div>

      <div className="modal-actions" style={{ marginTop: 18 }}>
        {onDelete && (
          <button className="btn danger" onClick={() => confirm('删除该自建纹样？') && onDelete()}>
            删除
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>
          关闭
        </button>
        <button className="btn primary" onClick={onSave}>
          {pattern.builtin ? '复制为我的纹样' : '保存纹样'}
        </button>
      </div>
    </div>
  );
}

function ParamControl({
  spec,
  value,
  onChange,
}: {
  spec: ParamSpec;
  value: number | string | boolean;
  onChange: (v: number | string | boolean) => void;
}) {
  if (spec.type === 'boolean')
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="hint" style={{ fontWeight: 700 }}>{spec.label}</span>
        <Switch on={!!value} onChange={onChange} />
      </div>
    );
  if (spec.type === 'select')
    return (
      <label className="field">
        {spec.label}
        <select value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {spec.options?.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
    );
  if (spec.type === 'color')
    return (
      <label className="field">
        {spec.label}
        <input type="color" value={String(value)} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  return (
    <label className="field">
      {spec.label}（{typeof value === 'number' ? value : spec.default}
      {spec.unit ?? ''}）
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={Number(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
