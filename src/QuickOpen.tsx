import { useEffect, useMemo, useRef, useState } from "react";
import { listFiles, readFile, type CommandError } from "./ipc";
import { useStore } from "./store";

interface Props {
  onClose: () => void;
}

// Rank a path against the query: substring-in-basename beats substring-in-path
// beats subsequence; shorter paths win ties. Returns null when there's no match.
function score(query: string, path: string): number | null {
  const q = query.toLowerCase();
  const p = path.toLowerCase();
  const base = p.slice(p.lastIndexOf("/") + 1);
  const bi = base.indexOf(q);
  if (bi >= 0) return 1000 - bi - path.length * 0.01;
  const pi = p.indexOf(q);
  if (pi >= 0) return 600 - pi - path.length * 0.01;
  let qi = 0;
  for (let i = 0; i < p.length && qi < q.length; i++) if (p[i] === q[qi]) qi++;
  return qi === q.length ? 200 - path.length * 0.01 : null;
}

export function QuickOpen({ onClose }: Props) {
  const store = useStore();
  const [files, setFiles] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    void listFiles().then(setFiles).catch(() => {});
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return files.slice(0, 100);
    return files
      .map((f) => ({ f, s: score(q, f) }))
      .filter((x): x is { f: string; s: number } => x.s !== null)
      .sort((a, b) => b.s - a.s)
      .slice(0, 100)
      .map((x) => x.f);
  }, [query, files]);

  useEffect(() => setSel(0), [query]);
  useEffect(() => {
    (listRef.current?.children[sel] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const openFile = async (path: string) => {
    onClose();
    if (store.buffers.has(path)) {
      store.setActiveBuffer(path);
      return;
    }
    try {
      const fc = await readFile(path);
      store.openBuffer(path, fc.content, fc.content_hash);
    } catch (e) {
      store.addChatError(-1, `Open failed: ${(e as CommandError).message}`);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[sel]) void openFile(results[sel]);
    }
  };

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette__input"
          placeholder="Search files by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <ul className="palette__list" ref={listRef}>
          {results.map((path, i) => {
            const slash = path.lastIndexOf("/");
            const base = slash >= 0 ? path.slice(slash + 1) : path;
            const dir = slash >= 0 ? path.slice(0, slash) : "";
            return (
              <li
                key={path}
                className={`palette__item quick-open__item${i === sel ? " palette__item--selected" : ""}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => void openFile(path)}
              >
                <span className="quick-open__name">{base}</span>
                {dir && <span className="quick-open__dir">{dir}</span>}
              </li>
            );
          })}
          {results.length === 0 && (
            <li className="palette__item quick-open__empty">No matching files</li>
          )}
        </ul>
      </div>
    </div>
  );
}
