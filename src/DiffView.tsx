import { useEffect, useState } from "react";
import { DiffEditor, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { gitDiff, type GitDiff, type CommandError } from "./ipc";
import { langFromPath } from "./lang";
import { useStore } from "./store";

loader.config({ monaco });

export function DiffView() {
  const store = useStore();
  const path = store.diffPath;
  const [diff, setDiff] = useState<GitDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setDiff(null);
      setError(null);
      return;
    }
    setDiff(null);
    setError(null);
    void gitDiff(path)
      .then((d) => setDiff(d))
      .catch((e: CommandError) => setError(e.message));
  }, [path]);

  if (!path) return null;

  return (
    <div className="diff-view">
      <div className="diff-view__header">
        <span className="diff-view__path">{path}</span>
        <button className="diff-view__close" onClick={store.closeDiff}>
          ✕
        </button>
      </div>

      {error && <div className="diff-view__error">{error}</div>}

      {diff?.binary && (
        <div className="diff-view__binary">Binary file — no diff available</div>
      )}

      {diff && !diff.binary && (
        <div className="diff-view__monaco">
          <DiffEditor
            theme="vs-dark"
            language={langFromPath(path)}
            original={diff.old_text}
            modified={diff.new_text}
            options={{
              renderSideBySide: false,
              readOnly: true,
              fontSize: 13,
              fontFamily: '"SF Mono", "Cascadia Code", Menlo, monospace',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
            }}
          />
        </div>
      )}
    </div>
  );
}
