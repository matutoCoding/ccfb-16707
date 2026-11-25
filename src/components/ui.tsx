import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

// ---------------- Toast ----------------
interface ToastMsg {
  id: number;
  text: string;
  kind?: 'info' | 'err';
}
const ToastCtx = createContext<(text: string, kind?: 'info' | 'err') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msgs, setMsgs] = useState<ToastMsg[]>([]);
  const push = useCallback((text: string, kind: 'info' | 'err' = 'info') => {
    const id = Date.now() + Math.random();
    setMsgs((m) => [...m, { id, text, kind }]);
    setTimeout(() => setMsgs((m) => m.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {msgs.map((m) => (
          <div key={m.id} className={`toast ${m.kind === 'err' ? 'err' : ''}`}>
            {m.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------- Modal ----------------
export function Modal({
  title,
  onClose,
  children,
  width,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { width: `min(${width}px,94vw)` } : undefined}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
          <h3 style={{ flex: 1 }}>{title}</h3>
          <button className="btn ghost sm" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------- hash 路由 ----------------
export type Route = 'projects' | 'members' | 'library' | 'draft' | 'preview3d' | 'settings';
const KNOWN: Route[] = ['projects', 'members', 'library', 'draft', 'preview3d', 'settings'];

export function useHashRoute(): [Route, (r: Route) => void] {
  const parse = (): Route => {
    const h = location.hash.replace('#/', '').replace('#', '') as Route;
    return KNOWN.includes(h) ? h : 'projects';
  };
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((r: Route) => {
    location.hash = `/${r}`;
  }, []);
  return [route, go];
}

// ---------------- 小控件 ----------------
export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`switch ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
      aria-pressed={on}
    />
  );
}

export function useNumberInput(value: number, onCommit: (v: number) => void) {
  // 受控数字输入，允许临时空串
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return {
    value: text,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setText(e.target.value);
      const v = Number(e.target.value);
      if (e.target.value !== '' && Number.isFinite(v)) onCommit(v);
    },
    onBlur: () => setText(String(value)),
  };
}
