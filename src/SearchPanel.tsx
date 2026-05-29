import { useState, useEffect, useRef, useCallback } from "react";
import { searchInFiles, readFile, type SearchHit, type CommandError } from "./ipc";
import { useStore } from "./store";

interface FileGroup {
  path: string;
  hits: SearchHit[];
}

function groupByFile(hits: SearchHit[]): FileGroup[] {
  const map = new Map<string, SearchHit[]>();
  for (const hit of hits) {
    const arr = map.get(hit.path) ?? [];
    arr.push(hit);
    map.set(hit.path, arr);
  }
  return Array.from(map.entries()).map(([path, h]) => ({ path, hits: h }));
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="search-hit__mark">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function SearchPanel() {
  const store = useStore();
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<FileGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [capped, setCapped] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setGroups([]);
      setCapped(false);
      return;
    }
    setLoading(true);
    try {
      const hits = await searchInFiles(q);
      setGroups(groupByFile(hits));
      setCapped(hits.length >= 500);
    } catch (e) {
      const err = e as CommandError;
      console.error("searchInFiles failed", err.message);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(query), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const openHit = async (hit: SearchHit) => {
    const path = hit.path;
    if (!store.buffers.has(path)) {
      try {
        const fc = await readFile(path);
        store.openBuffer(path, fc.content, fc.content_hash);
      } catch (e) {
        console.error("readFile failed", e);
        return;
      }
    } else {
      store.setActiveBuffer(path);
    }
    store.setRevealTarget({ path, line: hit.line, column: hit.column });
  };

  const toggleCollapse = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const totalHits = groups.reduce((s, g) => s + g.hits.length, 0);

  return (
    <div className="search-panel">
      <div className="search-panel__bar">
        <input
          className="search-panel__input"
          placeholder="Search in files..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      <div className="search-panel__body">
        {loading && <div className="search-panel__state">Searching...</div>}

        {!loading && query.trim() && groups.length === 0 && (
          <div className="search-panel__state">No results</div>
        )}

        {!loading && groups.length > 0 && (
          <>
            {capped && (
              <div className="search-panel__capped">
                Results capped at 500 — refine your query
              </div>
            )}
            <div className="search-panel__summary">
              {totalHits} result{totalHits !== 1 ? "s" : ""} in {groups.length} file{groups.length !== 1 ? "s" : ""}
            </div>
            {groups.map((group) => {
              const isCollapsed = collapsed.has(group.path);
              return (
                <div key={group.path} className="search-group">
                  <button
                    className="search-group__header"
                    onClick={() => toggleCollapse(group.path)}
                  >
                    <span className="search-group__chevron">
                      {isCollapsed ? "▸" : "▾"}
                    </span>
                    <span className="search-group__path">{group.path}</span>
                    <span className="search-group__count">{group.hits.length}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="search-group__hits">
                      {group.hits.map((hit, i) => (
                        <button
                          key={i}
                          className="search-hit"
                          onClick={() => void openHit(hit)}
                        >
                          <span className="search-hit__line">{hit.line}</span>
                          <span className="search-hit__text">
                            {highlightMatch(hit.text.trim(), query)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
