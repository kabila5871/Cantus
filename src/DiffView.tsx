import { useCallback, useEffect, useRef, useState } from "react";
import { DiffEditor, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { gitDiff, gitStageHunk, gitStageLines, gitDiscardHunk, gitDiscardLines } from "./ipc";
import { type GitDiff, type GitHunk, type CommandError } from "./ipc";
import { langFromPath } from "./lang";
import { useStore } from "./store";
import { defineCantusDarkTheme } from "./monacoTheme";

loader.config({ monaco });
defineCantusDarkTheme();

type ViewMode = "split" | "inline";

// Maps a modified-editor line number to { hunkIndex, lineIndices } of all
// addition lines within that hunk that fall on or before the given line.
// Returns null if the line is not inside any hunk.
function resolveLineRange(
  hunks: GitHunk[],
  fromLine: number,
  toLine: number,
): { hunkIndex: number; lineIndices: number[] } | null {
  for (let hi = 0; hi < hunks.length; hi++) {
    const hunk = hunks[hi];
    const indices: number[] = [];
    for (let li = 0; li < hunk.lines.length; li++) {
      const line = hunk.lines[li];
      if (
        line.origin === "addition" &&
        line.new_lineno !== null &&
        line.new_lineno >= fromLine &&
        line.new_lineno <= toLine
      ) {
        indices.push(li);
      }
    }
    if (indices.length > 0) return { hunkIndex: hi, lineIndices: indices };
  }
  return null;
}

// Content widget that floats next to the cursor offering "Stage N lines" and "Discard selected".
class StageSelectionWidget implements monaco.editor.IContentWidget {
  private domNode: HTMLElement;
  private position: monaco.editor.IContentWidgetPosition | null = null;
  readonly getId = () => "cantus.stage-selection";

  constructor(
    stageLabel: string,
    discardLabel: string,
    line: number,
    onStage: () => void,
    onDiscard: () => void,
  ) {
    this.domNode = document.createElement("div");
    this.domNode.className = "diff-gutter-float-widget";

    const makeBtn = (label: string, cls: string, handler: () => void) => {
      const btn = document.createElement("button");
      btn.className = cls;
      btn.textContent = label;
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handler();
      });
      return btn;
    };

    this.domNode.appendChild(
      makeBtn(stageLabel, "diff-gutter-stage-btn diff-gutter-stage-btn--float", onStage),
    );
    this.domNode.appendChild(
      makeBtn(discardLabel, "diff-gutter-discard-btn diff-gutter-discard-btn--float", onDiscard),
    );

    this.position = {
      position: { lineNumber: line, column: 1 },
      preference: [
        monaco.editor.ContentWidgetPositionPreference.ABOVE,
        monaco.editor.ContentWidgetPositionPreference.BELOW,
      ],
    };
  }

  getDomNode = () => this.domNode;
  getPosition = () => this.position;
  updateLine(line: number) {
    this.position = {
      position: { lineNumber: line, column: 1 },
      preference: [
        monaco.editor.ContentWidgetPositionPreference.ABOVE,
        monaco.editor.ContentWidgetPositionPreference.BELOW,
      ],
    };
  }
}

export function DiffView() {
  const store = useStore();
  const path = store.diffPath;
  const [diff, setDiff] = useState<GitDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("split");

  // Refs for Monaco integration — not state because mutations must not re-render.
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const modifiedEditorRef = useRef<monaco.editor.ICodeEditor | null>(null);
  const widgetRef = useRef<StageSelectionWidget | null>(null);
  const diffRef = useRef<GitDiff | null>(null);

  // Keep diffRef in sync so Monaco callbacks (which close over stale state) can
  // read the latest hunks without re-registering listeners.
  useEffect(() => { diffRef.current = diff; }, [diff]);

  const fetchDiff = useCallback((p: string) => {
    void gitDiff(p)
      .then((d) => setDiff(d))
      .catch((e: CommandError) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!path) { setDiff(null); setError(null); return; }
    setDiff(null);
    setError(null);
    fetchDiff(path);
  }, [path, fetchDiff]);

  // Refresh after a stage action: re-fetch diff, update git status, close if clean.
  const afterStage = useCallback(async (p: string) => {
    try {
      const d = await gitDiff(p);
      if (d.hunks.length === 0) {
        store.closeDiff();
      } else {
        setDiff(d);
      }
    } catch (e) {
      setError((e as CommandError).message);
    }
  }, [store]);

  // Place a "+" glyph in the gutter at each hunk's start line.
  const applyDecorations = useCallback(
    (editor: monaco.editor.ICodeEditor, d: GitDiff | null) => {
      if (!d) {
        decorationsRef.current?.clear();
        return;
      }
      const lineCount = editor.getModel()?.getLineCount() ?? 0;
      const decos: monaco.editor.IModelDeltaDecoration[] = d.hunks.map((hunk) => {
        const line = Math.max(1, Math.min(hunk.new_start === 0 ? 1 : hunk.new_start, lineCount || 1));
        return {
          range: new monaco.Range(line, 1, line, 1),
          options: {
            glyphMarginClassName: "diff-gutter-stage-glyph",
            glyphMarginHoverMessage: { value: "Stage hunk" },
            linesDecorationsClassName: "diff-gutter-discard-glyph",
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        };
      });
      if (decorationsRef.current) decorationsRef.current.set(decos);
      else decorationsRef.current = editor.createDecorationsCollection(decos);
    },
    [],
  );

  // Re-apply when the diff changes (only fires once the editor is mounted).
  useEffect(() => {
    const editor = modifiedEditorRef.current;
    if (editor) applyDecorations(editor, diff);
  }, [diff, applyDecorations]);

  // Remove the floating stage-lines widget.
  const clearWidget = useCallback(() => {
    const editor = modifiedEditorRef.current;
    if (editor && widgetRef.current) {
      editor.removeContentWidget(widgetRef.current);
      widgetRef.current = null;
    }
  }, []);

  const handleEditorMount = useCallback(
    (diffEditor: monaco.editor.IStandaloneDiffEditor) => {
      const modified = diffEditor.getModifiedEditor();
      modifiedEditorRef.current = modified;

      // onMount fires after the diff state is already set (and again on each
      // mode remount), so apply the glyph decorations here — the [diff] effect
      // alone runs before the editor exists and would miss them.
      decorationsRef.current = null;
      applyDecorations(modified, diffRef.current);

      // Glyph-margin click → stage hunk; line-decorations click → discard hunk.
      modified.onMouseDown((e) => {
        const isStage = e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN;
        const isDiscard = e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS;
        if ((!isStage && !isDiscard) || !e.target.position) return;

        const clickedLine = e.target.position.lineNumber;
        const currentDiff = diffRef.current;
        if (!currentDiff || !path) return;

        const model = modified.getModel();
        const lineCount = model?.getLineCount() ?? 0;
        const hunkIndex = currentDiff.hunks.findIndex((hunk) => {
          const line = Math.max(1, Math.min(hunk.new_start === 0 ? 1 : hunk.new_start, lineCount || 1));
          return line === clickedLine;
        });
        if (hunkIndex === -1) return;

        if (isStage) {
          void gitStageHunk(path, hunkIndex)
            .then((status) => {
              store.setGitStatus(status);
              return afterStage(path);
            })
            .catch((err: CommandError) => setError(err.message));
        } else {
          if (!confirm("Discard changes in this hunk? This cannot be undone.")) return;
          void gitDiscardHunk(path, hunkIndex)
            .then((status: import("./ipc").GitStatus) => {
              store.setGitStatus(status);
              return afterStage(path);
            })
            .catch((err: CommandError) => setError(err.message));
        }
      });

      // Selection change → show floating "Stage N lines" widget.
      modified.onDidChangeCursorSelection((e) => {
        clearWidget();
        const currentDiff = diffRef.current;
        if (!currentDiff || !path) return;

        const sel = e.selection;
        const startLine = sel.startLineNumber;
        const endLine = sel.endLineNumber;
        // Only show widget for non-collapsed selections.
        if (startLine === endLine && sel.startColumn === sel.endColumn) return;

        const resolved = resolveLineRange(currentDiff.hunks, startLine, endLine);
        if (!resolved || resolved.lineIndices.length === 0) return;

        const { hunkIndex, lineIndices } = resolved;
        const lineWord = `line${resolved.lineIndices.length === 1 ? "" : "s"}`;
        const stageLabel = `Stage ${resolved.lineIndices.length} ${lineWord}`;
        const discardLabel = `Discard ${resolved.lineIndices.length} ${lineWord}`;

        const widget = new StageSelectionWidget(
          stageLabel,
          discardLabel,
          startLine,
          () => {
            clearWidget();
            void gitStageLines(path, hunkIndex, lineIndices)
              .then((status) => {
                store.setGitStatus(status);
                return afterStage(path);
              })
              .catch((err: CommandError) => setError(err.message));
          },
          () => {
            clearWidget();
            if (!confirm("Discard selected lines? This cannot be undone.")) return;
            void gitDiscardLines(path, hunkIndex, lineIndices)
              .then((status: import("./ipc").GitStatus) => {
                store.setGitStatus(status);
                return afterStage(path);
              })
              .catch((err: CommandError) => setError(err.message));
          },
        );
        widgetRef.current = widget;
        modified.addContentWidget(widget);
        modified.layoutContentWidget(widget);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, store, afterStage, clearWidget, applyDecorations],
  );

  // Clean up decorations / widget when diff view closes.
  useEffect(() => {
    return () => {
      clearWidget();
      decorationsRef.current?.clear();
      decorationsRef.current = null;
      modifiedEditorRef.current = null;
    };
  }, [clearWidget]);

  if (!path) return null;

  return (
    <div className="diff-view">
      <div className="diff-view__header">
        <span className="diff-view__path">{path}</span>
        <div className="diff-view__mode-btns">
          {(["split", "inline"] as ViewMode[]).map((m) => (
            <button
              key={m}
              className={[
                "diff-view__mode-btn",
                mode === m ? "diff-view__mode-btn--active" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => setMode(m)}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <button className="diff-view__close" onClick={store.closeDiff}>✕</button>
      </div>

      {error && <div className="diff-view__error">{error}</div>}

      {diff?.binary && (
        <div className="diff-view__binary">Binary file — no diff available</div>
      )}

      {diff && !diff.binary && (
        <div className="diff-view__monaco">
          <DiffEditor
            key={mode}
            height="100%"
            theme="cantus-dark"
            language={langFromPath(path)}
            original={diff.old_text}
            modified={diff.new_text}
            onMount={handleEditorMount}
            options={{
              renderSideBySide: mode === "split",
              readOnly: true,
              glyphMargin: true,
              lineDecorationsWidth: 18,
              // Collapse unchanged code to changes + context, like VS Code.
              hideUnchangedRegions: {
                enabled: true,
                contextLineCount: 3,
                minimumLineCount: 3,
                revealLineCount: 20,
              },
              renderOverviewRuler: true,
              lineNumbers: "on",
              renderGutterMenu: true,
              fontSize: 13,
              fontFamily: '"JetBrains Mono", monospace',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
            }}
          />
        </div>
      )}
    </div>
  );
}
