import { useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { COLOR_LABEL, DEFAULT_SETTINGS } from '../lib/settings';
import { computeLayout, chooseComposition, DEFAULT_RULES } from '../caihua/rules';
import { createMember } from '../lib/factory';
import { useToast } from '../components/ui';
import type { ColorKey, Settings as SettingsType } from '../types';

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

function runSelfCheck(): Check[] {
  const checks: Check[] = [];
  // 1. 三停
  let ok1 = true;
  let bad = '';
  for (let L = 150; L <= 24000; L += 53) {
    const m = createMember('fang', { lengthMm: L, heightMm: 500 });
    m.draft.heziMode = 'off';
    const l = computeLayout(m, DEFAULT_RULES);
    if (Math.abs(l.fangxin.w - L / 3) > 1e-6 || Math.abs(l.thirdWidthMm - L / 3) > 1e-6) {
      ok1 = false;
      bad = `L=${L}`;
      break;
    }
  }
  checks.push({ name: '任意长度三停严格等长（枋心= L/3）', ok: ok1, detail: ok1 ? '150–24000mm 扫描通过' : `失败于 ${bad}` });

  // 2. 路数单调
  let prev = 0;
  let ok2 = true;
  for (let z = 60; z <= 8000; z += 3) {
    const c = chooseComposition(z, 480, DEFAULT_RULES);
    if (c.units < prev) {
      ok2 = false;
      break;
    }
    prev = c.units;
  }
  checks.push({ name: '找头增长时旋花路数单调不减', ok: ok2, detail: '60–8000mm 扫描通过' });

  // 3. 确定性
  const m = createMember('fang', { lengthMm: 5377, heightMm: 520 });
  const a = JSON.stringify(computeLayout(m, DEFAULT_RULES));
  const b = JSON.stringify(computeLayout(structuredClone(m), DEFAULT_RULES));
  checks.push({ name: '同参数两次计算完全一致（刷新不变）', ok: a === b, detail: `指纹 #${computeLayout(m, DEFAULT_RULES).fingerprint}` });

  // 4. 过短提示
  const s = createMember('fang', { lengthMm: 500, heightMm: 520 });
  const ls = computeLayout(s, DEFAULT_RULES);
  checks.push({ name: '过短构件给出 error 提示', ok: ls.warnings.some((w) => w.level === 'error'), detail: `${ls.warnings.length} 条提示` });

  // 5. 左右对称
  const l = computeLayout(createMember('fang', { lengthMm: 6421, heightMm: 560 }), DEFAULT_RULES);
  const ok5 = Math.abs(l.zhaotouL.w - l.zhaotouR.w) < 1e-6 && l.compL.key === l.compR.key;
  checks.push({ name: '左右找头等长、谱式镜像一致', ok: ok5, detail: l.compL.name });

  return checks;
}

export default function Settings() {
  const { settings, updateSettings, projects, resetSeed } = useStore();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);

  const set = (patch: Partial<SettingsType>) => updateSettings({ ...settings, ...patch });
  const setRule = (key: keyof SettingsType['rule'], v: number) =>
    updateSettings({ ...settings, rule: { ...settings.rule, [key]: v } });

  const exportAll = () => {
    const data = { app: 'caihua-studio-all', exportedAt: Date.now(), settings, projects };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '彩画系统-全部数据.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const importAll = async (f: File | undefined) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.projects)) throw new Error('文件格式不对');
      const { idb } = await import('../lib/db');
      for (const p of data.projects) await idb.put('projects', p);
      if (data.settings) await idb.setKV('settings', data.settings);
      toast('已导入全部数据，即将刷新');
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      toast(`导入失败：${(e as Error).message}`, 'err');
    }
  };

  return (
    <div style={{ maxWidth: 980 }}>
      <div className="page-head">
        <h2>设置</h2>
        <span className="desc">则例参数、青绿颜料、金箔 PBR、纸张与本地数据</span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
        <div className="card">
          <h3 style={{ marginBottom: 14 }}>则例与模数</h3>
          <label className="field" style={{ marginBottom: 12 }}>
            斗口 (mm)
            <input type="number" value={settings.doukouMm} onChange={(e) => set({ doukouMm: Number(e.target.value) || 0 })} />
          </label>
          {([
            ['fangxinRatio', '枋心占全长比例（0.3333=三停）', 0.01],
            ['gutouHeightRatio', '箍头宽 / 面高', 0.01],
            ['gutouMinMm', '箍头最小宽 (mm)', 1],
            ['gutouMaxRatioOfTing', '箍头最多占一停比例', 0.01],
            ['borderHeightRatio', '大边宽 / 面高', 0.005],
            ['flowerHeightRatio', '理想旋花径 / 找头净高', 0.01],
            ['flowerMinRatio', '允许最小旋花径系数', 0.01],
            ['flowerMaxRatio', '允许最大旋花径系数', 0.01],
            ['heziTriggerUnits', '自动加盒子的份数阈值', 1],
          ] as [keyof SettingsType['rule'], string, number][]).map(([key, label, step]) => (
            <label className="field" style={{ marginBottom: 10 }} key={key}>
              {label}
              <input
                type="number"
                step={step}
                value={settings.rule[key] as number}
                onChange={(e) => setRule(key, Number(e.target.value))}
              />
            </label>
          ))}
          <button className="btn" onClick={() => set({ rule: { ...DEFAULT_RULES } })}>
            恢复默认则例
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h3 style={{ marginBottom: 12 }}>青绿颜料</h3>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {(Object.keys(COLOR_LABEL) as ColorKey[]).map((k) => (
                <label className="field" key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input
                    type="color"
                    style={{ width: 44, height: 32 }}
                    value={settings.palette[k]}
                    onChange={(e) => set({ palette: { ...settings.palette, [k]: e.target.value } })}
                  />
                  <span>{COLOR_LABEL[k]}</span>
                  <span className="mono muted" style={{ marginLeft: 'auto', fontSize: 11 }}>{settings.palette[k]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 12 }}>金箔种类与反光</h3>
            {settings.foils.map((f, i) => (
              <div key={f.id} style={{ borderTop: i ? '1px dashed var(--line)' : 'none', paddingTop: 10, marginTop: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input
                    type="color"
                    style={{ width: 40, height: 30 }}
                    value={f.color}
                    onChange={(e) => {
                      const foils = settings.foils.map((x) => (x.id === f.id ? { ...x, color: e.target.value } : x));
                      set({ foils });
                    }}
                  />
                  <input
                    value={f.name}
                    onChange={(e) => set({ foils: settings.foils.map((x) => (x.id === f.id ? { ...x, name: e.target.value } : x)) })}
                  />
                </div>
                <label className="field">
                  粗糙度 {f.roughness.toFixed(2)}（越低越亮）
                  <input
                    type="range" min={0.05} max={0.8} step={0.01} value={f.roughness}
                    onChange={(e) => set({ foils: settings.foils.map((x) => (x.id === f.id ? { ...x, roughness: Number(e.target.value) } : x)) })}
                  />
                </label>
                <label className="field" style={{ marginTop: 6 }}>
                  环境反射强度 {f.envIntensity.toFixed(2)}
                  <input
                    type="range" min={0} max={3} step={0.05} value={f.envIntensity}
                    onChange={(e) => set({ foils: settings.foils.map((x) => (x.id === f.id ? { ...x, envIntensity: Number(e.target.value) } : x)) })}
                  />
                </label>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 12 }}>足尺图纸张</h3>
            <div className="field-row">
              <label className="field">
                默认纸型
                <select value={settings.paper.size} onChange={(e) => set({ paper: { ...settings.paper, size: e.target.value as never } })}>
                  {['A4', 'A3', 'A2', 'A1'].map((p) => <option key={p}>{p}</option>)}
                </select>
              </label>
              <label className="field">
                方向
                <select value={settings.paper.orientation} onChange={(e) => set({ paper: { ...settings.paper, orientation: e.target.value as never } })}>
                  <option value="auto">自动</option>
                  <option value="landscape">横向</option>
                  <option value="portrait">纵向</option>
                </select>
              </label>
              <label className="field">
                页边距 (mm)
                <input type="number" value={settings.paper.marginMm} onChange={(e) => set({ paper: { ...settings.paper, marginMm: Number(e.target.value) } })} />
              </label>
              <label className="field">
                搭接 (mm)
                <input type="number" value={settings.paper.overlapMm} onChange={(e) => set({ paper: { ...settings.paper, overlapMm: Number(e.target.value) } })} />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h3>规则自检</h3>
          <button className="btn primary sm" onClick={() => setChecks(runSelfCheck())}>
            运行任意长度规则扫描
          </button>
          {checks && <span className={`badge ${checks.every((c) => c.ok) ? 'ok' : 'err'}`}>{checks.filter((c) => c.ok).length}/{checks.length} 通过</span>}
        </div>
        {checks && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {checks.map((c, i) => (
              <div key={i} className={`warn-item ${c.ok ? 'info' : 'error'}`} style={{ background: c.ok ? '#dff1e8' : undefined, color: c.ok ? '#1d6b4c' : undefined }}>
                {c.ok ? '✅' : '❌'} <b>{c.name}</b>
                <span style={{ opacity: 0.8 }}>— {c.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 12 }}>数据管理（IndexedDB）</h3>
        <div className="hint" style={{ marginBottom: 12 }}>当前 {projects.length} 个项目，全部保存在本机浏览器。换电脑请先“打包导出”。</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" onClick={exportAll}>⬇ 导出全部数据</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>⬆ 导入全部数据</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => importAll(e.target.files?.[0])} />
          <button className="btn" onClick={async () => { await resetSeed(); toast('测试殿已重建'); }}>🏛 重建五开间测试殿</button>
          <button
            className="btn danger"
            onClick={async () => {
              if (confirm('清空本机全部彩画项目与设置？建议先导出。')) {
                indexedDB.deleteDatabase('caihua-studio-db');
                setTimeout(() => location.reload(), 400);
              }
            }}
          >
            清空全部数据
          </button>
        </div>
      </div>
    </div>
  );
}
