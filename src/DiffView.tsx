import { useCallback, useEffect, useState } from "react";
import { DiffEditor, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import * as ipc from "./ipc";
import { type GitDiff, type GitHunk, type CommandError } from "./ipc";
import { langFromPath } from "./lang";
import { useStore } from "./store";

loader.config({ monaco });

// Defensive references to bindings the backend agent is adding.
// They are typed as unknown here so tsc doesn't complain when the module
// is ahead of the backend; the runtime typeof guard gates all calls.
const _ipc = ipc as Record<string, unknown>;
const _gitStageHunk = _ipc["gitStageHunk"] as
  | ((path: string, hunkIndex: number) => Promise<ipc.GitStatus>)
  | undefined;
const _gitStageLines = _ipc["gitStageLines"] as
  | ((path: string, hunkIndex: number, lineIndices: number[]) => Promise<ipc.GitStatus>)
  | undefined;

const hasLineStaging = typeof _gitStageLines === "function";

type ViewMode = "stage" | "inline" | "split";

function HunkBlock({
  hunk,
  hunkIndex,
  path,
  onStaged,
}: {
  hunk: GitHunk;
  hunkIndex: number;
  path: string;
  onStaged: () => void;
}) {
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const store = useStore();

  const toggleLine = useCallback((idx: number) => {
    setSelectedLines((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const stageHunk = useCallback(async () => {
    if (!_gitStageHunk) return;
    setBusy(true);
    try {
      const status = await _gitStageHunk(path, hunkIndex);
      store.setGitStatus(status);
      onStaged();
    } finally {
      setBusy(false);
    }
  }, [path, hunkIndex, onStaged, store]);

  const stageSelected = useCallback(async () => {
    if (!hasLineStaging || !_gitStageLines || selectedLines.size === 0) return;
    setBusy(true);
    try {
      const status = await _gitStageLines(path, hunkIndex, [...selectedLines]);
      store.setGitStatus(status);
      onStaged();
    } finally {
      setBusy(false);
    }
  }, [path, hunkIndex, selectedLines, onStaged, store]);

  const rangeLabel = `@@ -${hunk.old_start},${hunk.old_lines} +${hunk.new_start},${hunk.new_lines} @@`;

  return (
    <div className="stage-hunk">
      <div className="stage-hunk__header">
        <span className="stage-hunk__range">{rangeLabel}</span>
        {hasLineStaging && selectedLines.size > 0 && (
          <button
            className="stage-hunk__btn stage-hunk__btn--selected"
            disabled={busy}
            onClick={stageSelected}
          >
            Stage selected ({selectedLines.size})
          </button>
        )}
        <button
          className="stage-hunk__btn"
          disabled={busy || !_gitStageHunk}
          onClick={stageHunk}
        >
          Stage hunk
        </button>
      </div>
      <div className="stage-hunk__lines">
        {hunk.lines.map((line, i) => {
          const isChanged = line.origin !== "context";
          const selected = selectedLines.has(i);
          return (
            <div
              key={i}
              className={[
                "stage-line",
                `stage-line--${line.origin}`,
                isChanged && hasLineStaging ? "stage-line--selectable" : "",
                selected ? "stage-line--selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={
                isChanged && hasLineStaging ? () => toggleLine(i) : undefined
              }
            >
              <span className="stage-line__gutter">
                {line.origin === "addition"
                  ? "+"
                  : line.origin === "deletion"
                    ? "-"
                    : " "}
              </span>
              <span className="stage-line__lineno">
                {line.origin !== "addition" && line.old_lineno != null
                  ? String(line.old_lineno).padStart(4)
                  : "    "}
              </span>
              <span className="stage-line__lineno">
                {line.origin !== "deletion" && line.new_lineno != null
                  ? String(line.new_lineno).padStart(4)
                  : "    "}
              </span>
              <span className="stage-line__content">{line.content}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StageView({
  diff,
  path,
  onRefresh,
}: {
  diff: GitDiff;
  path: string;
  onRefresh: () => void;
}) {
  if (diff.hunks.length === 0) {
    return <div className="stage-view__empty">No unstaged changes.</div>;
  }
  return (
    <div className="stage-view">
      {diff.hunks.map((hunk, i) => (
        <HunkBlock
          key={i}
          hunk={hunk}
          hunkIndex={i}
          path={path}
          onStaged={onRefresh}
        />
      ))}
    </div>
  );
}

export function DiffView() {
  const store = useStore();
  const path = store.diffPath;
  const [diff, setDiff] = useState<GitDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("inline");

  useEffect(() => {
    if (!path) {
      setDiff(null);
      setError(null);
      return;
    }
    setDiff(null);
    setError(null);
    void ipc.gitDiff(path)
      .then((d) => setDiff(d))
      .catch((e: CommandError) => setError(e.message));
  }, [path]);

  const handleStaged = useCallback(() => {
    if (!path) return;
    void ipc.gitDiff(path)
      .then((d) => {
        if (d.hunks.length === 0) {
          store.closeDiff();
        } else {
          setDiff(d);
        }
      })
      .catch((e: CommandError) => setError(e.message));
  }, [path, store]);

  if (!path) return null;

  return (
    <div className="diff-view">
      <div className="diff-view__header">
        <span className="diff-view__path">{path}</span>

        <div className="diff-view__mode-btns">
          {(["stage", "inline", "split"] as ViewMode[]).map((m) => (
            <button
              key={m}
              className={[
                "diff-view__mode-btn",
                mode === m ? "diff-view__mode-btn--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setMode(m)}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        <button className="diff-view__close" onClick={store.closeDiff}>
          ✕
        </button>
      </div>

      {error && <div className="diff-view__error">{error}</div>}

      {diff?.binary && (
        <div className="diff-view__binary">Binary file — no diff available</div>
      )}

      {diff && !diff.binary && mode === "stage" && (
        <div className="diff-view__stage">
          <StageView diff={diff} path={path} onRefresh={handleStaged} />
        </div>
      )}

      {diff && !diff.binary && mode !== "stage" && (
        <div className="diff-view__monaco">
          <DiffEditor
            theme="vs-dark"
            language={langFromPath(path)}
            original={diff.old_text}
            modified={diff.new_text}
            options={{
              renderSideBySide: mode === "split",
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
