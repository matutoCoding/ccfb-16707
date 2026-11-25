import { StoreProvider, useStore } from './lib/store';
import { ToastProvider, useHashRoute } from './components/ui';
import { PrintProvider } from './components/PrintRoot';
import ProjectList from './pages/ProjectList';
import Members from './pages/Members';
import Library from './pages/Library';
import Draft from './pages/Draft';
import Preview3D from './pages/Preview3D';
import Settings from './pages/Settings';
import type { Route } from './components/ui';

const NAV: { key: Route; label: string; ico: string }[] = [
  { key: 'projects', label: '项目列表', ico: '🗂' },
  { key: 'members', label: '构件录入', ico: '📏' },
  { key: 'library', label: '纹样库', ico: '❁' },
  { key: 'draft', label: '起谱', ico: '✎' },
  { key: 'preview3d', label: '三维预览', ico: '🏯' },
  { key: 'settings', label: '设置', ico: '⚙' },
];

function Shell() {
  const [route, go] = useHashRoute();
  const { ready, current, projects, currentId, setCurrentId, saveState, savedAt } = useStore();

  if (!ready) {
    return <div className="empty"><div className="big">🏮</div><p>正在打开样式房…</p></div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-seal">彩</div>
          <div>
            <div className="brand-title">彩画起谱坊</div>
            <div className="brand-sub">CAIHUA STUDIO</div>
          </div>
        </div>
        {NAV.map((n) => (
          <button key={n.key} className={`nav-item ${route === n.key ? 'active' : ''}`} onClick={() => go(n.key)}>
            <span className="ico">{n.ico}</span>
            {n.label}
          </button>
        ))}
        <div className="side-foot">
          分三停 · 定路数<br />
          青绿相间 · 沥粉贴金<br />
          数据仅存本机 IndexedDB
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          {route !== 'projects' && projects.length > 0 && (
            <select
              style={{ width: 280 }}
              value={currentId ?? ''}
              onChange={(e) => setCurrentId(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {route === 'projects' && <span className="proj-name">官式建筑彩画复原系统</span>}
          <span className="spacer" style={{ flex: 1 }} />
          <span className="save-state">
            <span className={`dot ${saveState === 'saving' ? 'saving' : saveState === 'error' ? 'error' : ''}`} />
            {saveState === 'saving'
              ? '自动保存中…'
              : saveState === 'error'
                ? '保存失败'
                : savedAt
                  ? `已自动保存 ${new Date(savedAt).toLocaleTimeString('zh-CN', { hour12: false })}`
                  : '已就绪'}
          </span>
        </header>

        <section className="content">
          {route === 'projects' && <ProjectList go={go} />}
          {route === 'members' && <Members go={go} />}
          {route === 'library' && <Library />}
          {route === 'draft' && <Draft go={go} />}
          {route === 'preview3d' && <Preview3D go={go} />}
          {route === 'settings' && <Settings />}
        </section>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <PrintProvider>
          <Shell />
        </PrintProvider>
      </ToastProvider>
    </StoreProvider>
  );
}
