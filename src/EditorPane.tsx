import { useEffect, useRef, useCallback } from "react";
import MonacoEditor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { writeFile, type CommandError } from "./ipc";
import { useStore } from "./store";
import { langFromPath } from "./lang";
import { defineCantusDarkTheme } from "./monacoTheme";

loader.config({ monaco });
defineCantusDarkTheme();

function TabBar() {
  const store = useStore();
  const paths = [...store.buffers.keys()];

  if (paths.length === 0) return null;

  return (
    <div className="tab-bar">
      {paths.map((p) => {
        const buf = store.buffers.get(p)!;
        const name = p.split("/").at(-1);
        const active = store.activeBufferPath === p;
        const close = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (buf.dirty && !confirm(`Discard unsaved changes to ${name}?`)) return;
          store.closeBuffer(p);
        };
        return (
          <div
            key={p}
            className={`tab${active ? " tab--active" : ""}${buf.externallyChanged ? " tab--external" : ""}`}
            onClick={() => store.setActiveBuffer(p)}
            onAuxClick={(e) => e.button === 1 && close(e)}
            title={p}
          >
            <span className="tab__name">{name}</span>
            <button
              className={`tab__close${buf.dirty ? " tab__close--dirty" : ""}`}
              title="Close"
              onClick={close}
            >
              <span className="tab__close-x">×</span>
              <span className="tab__close-dot" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function EditorPane() {
  const store = useStore();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const prevPathRef = useRef<string | null>(null);
  const modelsRef = useRef<Map<string, monaco.editor.ITextModel>>(new Map());

  const activePath = store.activeBufferPath;
  const activeBuf = activePath ? store.buffers.get(activePath) : undefined;

  useEffect(() => {
    if (!activePath || !activeBuf) return;

    if (!modelsRef.current.has(activePath)) {
      const uri = monaco.Uri.parse(`file:///${activePath}`);
      const existing = monaco.editor.getModel(uri);
      const model =
        existing ??
        monaco.editor.createModel(
          activeBuf.content,
          langFromPath(activePath),
          uri,
        );
      modelsRef.current.set(activePath, model);
    }
  }, [activePath, activeBuf]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activePath) return;
    if (prevPathRef.current === activePath) return;

    const model = modelsRef.current.get(activePath);
    if (model && editor.getModel() !== model) {
      editor.setModel(model);
    }
    prevPathRef.current = activePath;
  }, [activePath]);

  // Reveal a line when a search hit navigates to this file.
  useEffect(() => {
    const target = store.revealTarget;
    if (!target || target.path !== activePath) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.revealLineInCenter(target.line);
    editor.setPosition({ lineNumber: target.line, column: target.column });
    editor.focus();
    store.setRevealTarget(null);
  }, [store.revealTarget, activePath, store]);

  useEffect(() => {
    const current = editorRef.current?.getModel() ?? null;
    for (const [path, model] of modelsRef.current) {
      if (!store.buffers.has(path) && model !== current) {
        model.dispose();
        modelsRef.current.delete(path);
      }
    }
  }, [store.buffers]);

  const handleMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      editorRef.current = editor;

      editor.onDidChangeModelContent(() => {
        const path = store.activeBufferPath;
        if (path) store.updateBuffer(path, editor.getModel()?.getValue() ?? "");
      });

      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        async () => {
          const path = store.activeBufferPath;
          if (!path) return;
          const content = editor.getModel()?.getValue();
          if (content === undefined) return;
          try {
            const entry = await writeFile(path, content);
            store.reconcileBuffer(path, entry.content_hash);
          } catch (e) {
            const err = e as CommandError;
            console.error("write_file failed", err.kind, err.message);
          }
        },
      );
    },
    [store],
  );

  if (!activeBuf) {
    return (
      <div className="editor-pane editor-pane--empty">
        <span>Open a file from the explorer</span>
      </div>
    );
  }

  return (
    <div className="editor-pane">
      <TabBar />
      {activeBuf.externallyChanged && (
        <div className="editor-banner">
          File changed on disk.{" "}
          <button
            onClick={async () => {
              if (!activePath) return;
              const { readFile } = await import("./ipc");
              try {
                const fc = await readFile(activePath);
                const model = modelsRef.current.get(activePath);
                if (model) {
                  model.setValue(fc.content);
                }
                store.reconcileBuffer(activePath, fc.content_hash);
              } catch (e) {
                console.error("reload failed", e);
              }
            }}
          >
            Reload
          </button>
        </div>
      )}
      <div className="editor-pane__monaco">
        <MonacoEditor
          theme="cantus-dark"
          path={activePath ?? undefined}
          defaultValue={activeBuf.content}
          language={langFromPath(activePath ?? "")}
          options={{
            fontSize: 13,
            fontFamily: '"JetBrains Mono", monospace',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            renderWhitespace: "selection",
            smoothScrolling: true,
            cursorBlinking: "smooth",
          }}
          onMount={handleMount}
        />
      </div>
    </div>
  );
}
