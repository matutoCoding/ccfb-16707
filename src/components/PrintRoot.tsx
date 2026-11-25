import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Member } from '../types';
import { useStore } from '../lib/store';
import { planTiles, type Tile } from '../caihua/tiles';
import { paintDraft, effectiveLayout } from '../caihua/draftPaint';

interface PrintJob {
  members: Member[];
}
const PrintCtx = createContext<(members: Member[]) => void>(() => {});
export const usePrint = () => useContext(PrintCtx);

function TileCanvas({ member, tile, colorMode }: { member: Member; tile: Tile; colorMode: 'line' | 'color' }) {
  const { settings, library } = useStore();
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpi = settings.paper.dpi;
    const ppm = dpi / 25.4;
    canvas.width = Math.max(2, Math.round(tile.pw * ppm));
    canvas.height = Math.max(2, Math.round(tile.ph * ppm));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ppm, 0, 0, ppm, 0, 0);
    ctx.translate(-tile.sx, -tile.sy);
    paintDraft(ctx, member, {
      settings,
      library,
      pass: colorMode === 'line' ? 'line' : 'beauty',
      colorCodes: colorMode === 'line',
    });
  }, [member, tile, settings, library, colorMode]);

  return (
    <canvas
      ref={ref}
      style={{ width: `${tile.pw}mm`, height: `${tile.ph}mm` }}
    />
  );
}

function MemberSheets({ member, colorMode }: { member: Member; colorMode: 'line' | 'color' }) {
  const { settings } = useStore();
  // 展开面高
  const plan = useMemo(() => {
    const l = effectiveLayout(member, settings);
    return planTiles({
      lengthMm: l.lengthMm,
      heightMm: l.faceHeightMm,
      paper: settings.paper.size,
      orientation: settings.paper.orientation,
      marginMm: settings.paper.marginMm,
      overlapMm: settings.paper.overlapMm,
    });
  }, [member, settings]);

  return (
    <>
      <div className="print-member-title print-no">
        {member.code} · {member.name}（{plan.cols}×{plan.rows}＝{plan.pageCount} 页）
      </div>
      {plan.tiles.map((t) => (
        <div
          key={`${member.id}-${t.row}-${t.col}`}
          className={`print-sheet ${t.orientation}`}
          style={{ width: `${t.paperW}mm`, height: `${t.paperH}mm`, padding: `${settings.paper.marginMm}mm` }}
        >
          <div className="print-canvas-box" style={{ width: `${t.pw}mm`, height: `${t.ph}mm` }}>
            <TileCanvas member={member} tile={t} colorMode={colorMode} />
          </div>
          {/* 裁切线 */}
          <i className="crop tl" /><i className="crop tr" /><i className="crop bl" /><i className="crop br" />
          {/* 拼接标记 */}
          {t.matchLeft && <span className="mark ml">{t.matchLeft}</span>}
          {t.matchRight && <span className="mark mr">{t.matchRight}</span>}
          <span className="mark tl" style={{ fontFamily: 'KaiTi,serif', fontSize: '11pt', color: '#000' }}>
            {member.name} · {member.code}
          </span>
          <span className="mark tr" style={{ color: '#000' }}>
            {t.label} · 1:1（{settings.paper.size}）
          </span>
          <span className="mark bl" style={{ color: '#000' }}>
            {t.matchBottom ?? ''}
          </span>
          <span className="mark br" style={{ color: '#000' }}>
            官式彩画起谱 · 拼接对位十字
          </span>
        </div>
      ))}
    </>
  );
}

export function PrintProvider({ children }: { children: React.ReactNode }) {
  const { settings, updateSettings } = useStore();
  const [job, setJob] = useState<PrintJob | null>(null);
  const [colorMode, setColorMode] = useState<'line' | 'color'>('line');

  const open = useCallback((members: Member[]) => {
    setJob({ members });
  }, []);

  const totalPages = useMemo(() => {
    if (!job) return 0;
    return job.members.reduce((sum, m) => {
      const l = effectiveLayout(m, settings);
      return (
        sum +
        planTiles({
          lengthMm: l.lengthMm,
          heightMm: l.faceHeightMm,
          paper: settings.paper.size,
          orientation: settings.paper.orientation,
          marginMm: settings.paper.marginMm,
          overlapMm: settings.paper.overlapMm,
        }).pageCount
      );
    }, 0);
  }, [job, settings]);

  return (
    <PrintCtx.Provider value={open}>
      {children}
      {job && (
        <div id="print-root" className="print-root">
          <style>{`@page cl { size: ${settings.paper.size} landscape; margin:0 }
                   @page cp { size: ${settings.paper.size} portrait; margin:0 }
                   .print-sheet.landscape { page: cl; break-after: page; }
                   .print-sheet.portrait { page: cp; break-after: page; }`}</style>
          <div className="print-toolbar print-no">
            <b style={{ fontSize: 15 }}>足尺谱子 · 分页与拼接</b>
            <span className="hint" style={{ color: '#cbb98f' }}>
              共 {job.members.length} 根构件，约 {totalPages} 页；打印对话框中选“实际大小/100%”，勿勾适应页面
            </span>
            <span className="spacer" />
            <div className="seg">
              <button className={colorMode === 'line' ? 'active' : ''} onClick={() => setColorMode('line')}>
                墨线谱+色标
              </button>
              <button className={colorMode === 'color' ? 'active' : ''} onClick={() => setColorMode('color')}>
                彩色效果
              </button>
            </div>
            <select
              style={{ width: 90 }}
              value={settings.paper.size}
              onChange={(e) =>
                updateSettings({ ...settings, paper: { ...settings.paper, size: e.target.value as never } })
              }
            >
              {['A4', 'A3', 'A2', 'A1'].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <select
              style={{ width: 110 }}
              value={settings.paper.dpi}
              onChange={(e) =>
                updateSettings({ ...settings, paper: { ...settings.paper, dpi: Number(e.target.value) as 150 | 200 | 300 } })
              }
            >
              <option value={150}>150 dpi</option>
              <option value={200}>200 dpi</option>
              <option value={300}>300 dpi</option>
            </select>
            <button className="btn primary" onClick={() => window.print()}>
              🖨 打印 / 另存 PDF
            </button>
            <button className="btn" onClick={() => setJob(null)}>
              关闭
            </button>
          </div>
          <div className="print-scroll">
            {job.members.map((m) => (
              <MemberSheets key={m.id} member={m} colorMode={colorMode} />
            ))}
          </div>
        </div>
      )}
    </PrintCtx.Provider>
  );
}
