import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Project, Settings, PatternInstance, ProjectPackage } from '../types';
import { idb } from './db';
import { uid } from './uid';
import { DEFAULT_SETTINGS } from './settings';
import { BUILTIN_PATTERNS } from '../caihua/patterns';
import { buildSeedProject, SEED_PROJECT_ID } from './seed';

type SaveState = 'loading' | 'saving' | 'saved' | 'error';

interface StoreValue {
  ready: boolean;
  projects: Project[];
  currentId: string | null;
  current: Project | null;
  settings: Settings;
  library: PatternInstance[];
  saveState: SaveState;
  savedAt: number | null;
  setCurrentId: (id: string) => void;
  createProject: (name: string, withSeed?: boolean) => string;
  duplicateProject: (id: string) => Promise<string>;
  deleteProject: (id: string) => Promise<void>;
  updateProject: (id: string, updater: (p: Project) => Project) => void;
  updateCurrent: (updater: (p: Project) => Project) => void;
  replaceCurrent: (p: Project) => void;
  updateSettings: (s: Settings) => void;
  savePattern: (p: PatternInstance) => Promise<void>;
  deletePattern: (id: string) => Promise<void>;
  exportPackage: (id: string) => void;
  importPackage: (file: File) => Promise<string>;
  resetSeed: () => Promise<void>;
}

const Ctx = createContext<StoreValue | null>(null);

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentId, setCurrentIdState] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [customPatterns, setCustomPatterns] = useState<PatternInstance[]>([]);
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const saveTimer = useRef<number | null>(null);

  // 初次载入
  useEffect(() => {
    (async () => {
      let ps = await idb.getAll<Project>('projects');
      if (ps.length === 0) {
        const seed = buildSeedProject();
        await idb.put('projects', seed);
        ps = [seed];
      }
      ps.sort((a, b) => b.updatedAt - a.updatedAt);
      const s = (await idb.getKV<Settings>('settings')) ?? DEFAULT_SETTINGS;
      // 合并默认值，避免旧版本缺字段
      const mergedSettings: Settings = {
        ...DEFAULT_SETTINGS,
        ...s,
        rule: { ...DEFAULT_SETTINGS.rule, ...(s.rule ?? {}) },
        palette: { ...DEFAULT_SETTINGS.palette, ...(s.palette ?? {}) },
        paper: { ...DEFAULT_SETTINGS.paper, ...(s.paper ?? {}) },
        foils: s.foils?.length ? s.foils : DEFAULT_SETTINGS.foils,
      };
      const pats = await idb.getAll<PatternInstance>('patterns');
      setSettings(mergedSettings);
      setCustomPatterns(pats);
      setProjects(ps);
      setCurrentIdState(ps[0]?.id ?? null);
      setReady(true);
      setSaveState('saved');
    })();
  }, []);

  const current = useMemo(
    () => projects.find((p) => p.id === currentId) ?? null,
    [projects, currentId],
  );

  // 当前项目防抖自动保存
  useEffect(() => {
    if (!ready || !current) return;
    setSaveState('saving');
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const p = current;
    saveTimer.current = window.setTimeout(async () => {
      try {
        await idb.put('projects', { ...p, updatedAt: Date.now() });
        setSavedAt(Date.now());
        setSaveState('saved');
      } catch (e) {
        console.error(e);
        setSaveState('error');
      }
    }, 500);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [current, ready]);

  const setCurrentId = useCallback((id: string) => setCurrentIdState(id), []);

  const updateProject = useCallback((id: string, updater: (p: Project) => Project) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? updater(p) : p)));
  }, []);

  const updateCurrent = useCallback(
    (updater: (p: Project) => Project) => {
      if (!currentId) return;
      updateProject(currentId, updater);
    },
    [currentId, updateProject],
  );

  const replaceCurrent = useCallback(
    (p: Project) => {
      setProjects((prev) => {
        const idx = prev.findIndex((x) => x.id === p.id);
        if (idx >= 0) return prev.map((x) => (x.id === p.id ? p : x));
        return [p, ...prev];
      });
      setCurrentIdState(p.id);
    },
    [],
  );

  const createProject = useCallback((name: string, withSeed = false): string => {
    const id = uid('p-');
    const base = withSeed ? buildSeedProject() : null;
    const now = Date.now();
    const p: Project = base
      ? { ...base, id, name, members: base.members.map((m) => ({ ...m, id: uid('m-') })) }
      : { id, name, createdAt: now, updatedAt: now, members: [] };
    setProjects((prev) => [p, ...prev]);
    setCurrentIdState(id);
    void idb.put('projects', p);
    return id;
  }, []);

  const duplicateProject = useCallback(
    async (id: string): Promise<string> => {
      const src = projects.find((p) => p.id === id) ?? (await idb.get<Project>('projects', id));
      if (!src) throw new Error('项目不存在');
      const newId = uid('p-');
      const copy: Project = {
        ...structuredClone(src),
        id: newId,
        name: `${src.name} 副本`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        members: src.members.map((m) => ({ ...structuredClone(m), id: uid('m-') })),
      };
      // 复制后构件 id 全换，draft 内无构件引用，安全
      await idb.put('projects', copy);
      setProjects((prev) => [copy, ...prev]);
      setCurrentIdState(newId);
      return newId;
    },
    [projects],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      await idb.delete('projects', id);
      setProjects((prev) => {
        const next = prev.filter((p) => p.id !== id);
        if (currentId === id) setCurrentIdState(next[0]?.id ?? null);
        return next;
      });
    },
    [currentId],
  );

  const updateSettings = useCallback((s: Settings) => {
    setSettings(s);
    void idb.setKV('settings', s);
  }, []);

  const savePattern = useCallback(async (p: PatternInstance) => {
    await idb.put('patterns', p);
    setCustomPatterns((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      if (idx >= 0) return prev.map((x) => (x.id === p.id ? p : x));
      return [...prev, p];
    });
  }, []);

  const deletePattern = useCallback(async (id: string) => {
    await idb.delete('patterns', id);
    setCustomPatterns((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const library = useMemo(() => [...customPatterns, ...BUILTIN_PATTERNS], [customPatterns]);

  const exportPackage = useCallback(
    (id: string) => {
      const p = projects.find((x) => x.id === id);
      if (!p) return;
      const pkg: ProjectPackage = {
        app: 'caihua-studio',
        format: 1,
        exportedAt: Date.now(),
        project: p,
        customPatterns,
        settings,
      };
      download(`${p.name}.caihua.json`, JSON.stringify(pkg, null, 2));
    },
    [projects, customPatterns, settings],
  );

  const importPackage = useCallback(
    async (file: File): Promise<string> => {
      const text = await file.text();
      const pkg = JSON.parse(text) as ProjectPackage;
      if (pkg.app !== 'caihua-studio' || !pkg.project) throw new Error('不是有效的彩画项目包');
      const id = uid('p-');
      const p: Project = {
        ...structuredClone(pkg.project),
        id,
        name: pkg.project.name?.endsWith('（导入）') ? pkg.project.name : `${pkg.project.name}（导入）`,
        updatedAt: Date.now(),
      };
      await idb.put('projects', p);
      if (pkg.customPatterns?.length) {
        for (const pat of pkg.customPatterns) {
          // 避免与内置 id 冲突
          const toSave = pat.builtin ? { ...pat, builtin: false, id: uid('pat-') } : pat;
          await idb.put('patterns', toSave);
        }
        setCustomPatterns(await idb.getAll<PatternInstance>('patterns'));
      }
      setProjects((prev) => [p, ...prev]);
      setCurrentIdState(id);
      return id;
    },
    [],
  );

  const resetSeed = useCallback(async () => {
    const seed = buildSeedProject();
    seed.id = SEED_PROJECT_ID;
    await idb.put('projects', seed);
    setProjects((prev) => {
      const idx = prev.findIndex((p) => p.id === seed.id);
      if (idx >= 0) return prev.map((p) => (p.id === seed.id ? seed : p));
      return [seed, ...prev];
    });
    setCurrentIdState(seed.id);
  }, []);

  const value: StoreValue = {
    ready,
    projects,
    currentId,
    current,
    settings,
    library,
    saveState,
    savedAt,
    setCurrentId,
    createProject,
    duplicateProject,
    deleteProject,
    updateProject,
    updateCurrent,
    replaceCurrent,
    updateSettings,
    savePattern,
    deletePattern,
    exportPackage,
    importPackage,
    resetSeed,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within StoreProvider');
  return v;
}
