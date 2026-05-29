import { useCallback, useEffect, useState } from "react";
import {
  listMemories,
  addMemory,
  updateMemory,
  deleteMemory,
  listCapabilityStats,
  type Memory,
  type CapabilityStat,
} from "./ipc";
import { useStore } from "./store";

interface MemoryViewProps {
  onClose(): void;
}

function relativeTime(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function MemoryView({ onClose }: MemoryViewProps) {
  const store = useStore();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [stats, setStats] = useState<CapabilityStat[]>([]);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const load = useCallback(() => {
    listMemories().then(setMemories).catch(() => {});
    listCapabilityStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load, store.project]);

  const add = () => {
    const fact = draft.trim();
    if (!fact) return;
    addMemory(fact, "", [], 0.8)
      .then((m) => {
        setMemories((prev) => [m, ...prev]);
        setDraft("");
      })
      .catch(() => {});
  };

  const remove = (id: number) => {
    deleteMemory(id)
      .then(() => setMemories((prev) => prev.filter((m) => m.id !== id)))
      .catch(() => {});
  };

  const commitEdit = (m: Memory) => {
    const fact = editText.trim();
    setEditingId(null);
    if (!fact || fact === m.fact) return;
    updateMemory(m.id, fact, m.confidence)
      .then(() => setMemories((prev) => prev.map((x) => (x.id === m.id ? { ...x, fact } : x))))
      .catch(() => {});
  };

  return (
    <div className="mem">
      <div className="mem__head">
        <span className="mem__title">Code memory</span>
        <span className="mem__sub">
          what this project has learned · {memories.length} fact{memories.length === 1 ? "" : "s"}
        </span>
        <button className="asset-browser__close" onClick={onClose}>
          &times;
        </button>
      </div>

      <div className="mem__body">
        <section className="mem__section">
          <h3 className="mem__section-title">Learned facts</h3>
          <p className="mem__hint">
            Distilled judgment, relevance-retrieved at the gap-check. Capture the quirks a new engineer learns the hard
            way — they accrue automatically as runs complete, and you can add your own.
          </p>
          <div className="mem__add">
            <textarea
              className="mem__input"
              placeholder="e.g. the auth module's tests need AUTH_TEST_TOKEN set"
              value={draft}
              rows={2}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
              }}
            />
            <button className="mem__add-btn" onClick={add} disabled={!draft.trim()}>
              Add memory
            </button>
          </div>

          {memories.length === 0 ? (
            <div className="mem__empty">No learned facts yet — they accrue as runs complete, or add your own.</div>
          ) : (
            <div className="mem__list">
              {memories.map((m) => (
                <div key={m.id} className="mem__card">
                  {editingId === m.id ? (
                    <textarea
                      className="mem__input"
                      value={editText}
                      autoFocus
                      rows={2}
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={() => commitEdit(m)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          commitEdit(m);
                        }
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                  ) : (
                    <p
                      className="mem__fact"
                      onDoubleClick={() => {
                        setEditingId(m.id);
                        setEditText(m.fact);
                      }}
                    >
                      {m.fact}
                    </p>
                  )}
                  <div className="mem__meta">
                    {m.task_type && <span className="mem__tag">{m.task_type}</span>}
                    {m.capabilities.map((c) => (
                      <span key={c} className="mem__cap">
                        {c}
                      </span>
                    ))}
                    <span className="mem__meta-dim">
                      {Math.round(m.confidence * 100)}% · {relativeTime(m.created_at)}
                    </span>
                    <span className="mem__spacer" />
                    <button
                      className="mem__act"
                      onClick={() => {
                        setEditingId(m.id);
                        setEditText(m.fact);
                      }}
                    >
                      edit
                    </button>
                    <button className="mem__act mem__act--danger" onClick={() => remove(m.id)}>
                      delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mem__section">
          <h3 className="mem__section-title">Capability usage</h3>
          <p className="mem__hint">Per-skill/agent run counts and success rate — the stats layered on the registry.</p>
          {stats.length === 0 ? (
            <div className="mem__empty">No capabilities recorded yet.</div>
          ) : (
            <div className="mem__stats">
              {stats.map((s) => (
                <span key={s.kind + s.name} className="mem__stat">
                  <span className="mem__stat-kind">{s.kind}</span>
                  <span className="mem__stat-name">{s.name}</span>
                  <span className="mem__stat-num">
                    {s.uses}× · {Math.round((s.successes / s.uses) * 100)}%
                  </span>
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
