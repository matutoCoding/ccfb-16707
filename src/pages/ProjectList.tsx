import React, { useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { useToast, Modal } from '../components/ui';
import { CATEGORY_LABEL } from '../lib/settings';
import type { Route } from '../components/ui';

export default function ProjectList({ go }: { go: (r: Route) => void }) {
  const { projects, setCurrentId, createProject, duplicateProject, deleteProject, exportPackage, importPackage, resetSeed } =
    useStore();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const open = (id: string) => {
    setCurrentId(id);
    go('draft');
  };

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const id = await importPackage(f);
      setCurrentId(id);
      toast('项目包已导入');
      go('members');
    } catch (e) {
      toast(`导入失败：${(e as Error).message}`, 'err');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <div className="page-head">
        <h2>项目列表</h2>
        <span className="desc">项目自动保存在本机 IndexedDB，可导出 .caihua.json 包发给他人</span>
        <span className="spacer" />
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
          ⬆ 导入项目包
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => onImport(e.target.files?.[0])}
        />
        <button
          className="btn ghost"
          onClick={async () => {
            await resetSeed();
            toast('已重建五开间测试殿');
          }}
        >
          🏛 重建测试殿
        </button>
        <button className="btn primary" onClick={() => setNewOpen(true)}>
          ＋ 新建项目
        </button>
      </div>

      <div className="grid proj-grid">
        <div className="card new-card" onClick={() => setNewOpen(true)}>
          <div style={{ textAlign: 'center' }}>
            <div className="plus">＋</div>
            <div style={{ fontWeight: 700, marginTop: 6 }}>空白新项目</div>
          </div>
        </div>

        {projects.map((p) => {
          const counts = p.members.reduce<Record<string, number>>((acc, m) => {
            acc[m.category] = (acc[m.category] ?? 0) + 1;
            return acc;
          }, {});
          const lf = (counts.liang ?? 0) + (counts.fang ?? 0);
          return (
            <div key={p.id} className="card proj-card" onClick={() => open(p.id)}>
              <div className="pc-top">
                <div className="proj-thumb">🏯</div>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</h3>
                  <div className="proj-meta">{p.hall?.title ?? '普通项目'}</div>
                </div>
              </div>
              <div className="proj-meta">
                共 <b>{p.members.length}</b> 个构件 · 梁枋 <b>{lf}</b> 根
                <br />
                {(['liang', 'fang', 'lin', 'dianban'] as const).map(
                  (c) =>
                    counts[c] > 0 && (
                      <span key={c} className="badge gray" style={{ marginRight: 5 }}>
                        {CATEGORY_LABEL[c]} {counts[c]}
                      </span>
                    ),
                )}
              </div>
              {p.note && <div className="hint">{p.note}</div>}
              <div className="proj-actions" onClick={(e) => e.stopPropagation()}>
                <button className="btn sm primary" onClick={() => open(p.id)}>
                  起谱
                </button>
                <button
                  className="btn sm"
                  onClick={async () => {
                    await duplicateProject(p.id);
                    toast('已复制项目');
                  }}
                >
                  复制
                </button>
                <button className="btn sm" onClick={() => exportPackage(p.id)}>
                  打包导出
                </button>
                <button
                  className="btn sm danger"
                  onClick={() => {
                    if (confirm(`确定删除项目“${p.name}”？此操作不可恢复。`)) {
                      void deleteProject(p.id);
                      toast('项目已删除');
                    }
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {newOpen && (
        <Modal title="新建项目" onClose={() => setNewOpen(false)}>
          <label className="field">
            项目名称
            <input
              autoFocus
              value={name}
              placeholder="如：某殿彩画复原工程"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="modal-actions">
            <button className="btn" onClick={() => setNewOpen(false)}>
              取消
            </button>
            <button
              className="btn"
              onClick={() => {
                const id = createProject(name.trim() || '五开间殿（测试）', true);
                setNewOpen(false);
                setName('');
                setCurrentId(id);
                go('members');
              }}
            >
              用五开间测试殿创建
            </button>
            <button
              className="btn primary"
              onClick={() => {
                const id = createProject(name.trim() || '空白项目', false);
                setNewOpen(false);
                setName('');
                setCurrentId(id);
                go('members');
              }}
            >
              空白创建
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
