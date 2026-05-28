import { useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  appInfo,
  currentProject,
  listenFsChanged,
  gitStatus,
  loadHistory,
  lspStatus,
  type AppInfo,
} from "./ipc";
import { StoreProvider } from "./StoreProvider";
import { useStore } from "./store";
import { Explorer } from "./Explorer";
import { EditorPane } from "./EditorPane";
import { Terminal } from "./Terminal";
import { GitPanel } from "./GitPanel";
import { DiffView } from "./DiffView";
import { StatusBar } from "./StatusBar";
import { CommandPalette } from "./CommandPalette";
import { handleGlobalKeyDown } from "./keybindings";
import "@xterm/xterm/css/xterm.css";
import "./App.css";

function Pane({ children }: { children: React.ReactNode }) {
  return <section className="pane">{children}</section>;
}

type SidebarTab = "explorer" | "git";

function WorkspaceInner({ info }: { info: AppInfo | null }) {
  const store = useStore();
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("explorer");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const chatFocusCbRef = useRef<(() => void) | null>(null);

  const buffersRef = useRef(store.buffers);
  buffersRef.current = store.buffers;

  const focusChatInput = useCallback(() => {
    chatFocusCbRef.current?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      handleGlobalKeyDown(e, store, () => setPaletteOpen(true), focusChatInput);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [store, focusChatInput]);

  useEffect(() => {
    void currentProject().then((p) => {
      if (!p) return;
      store.hydrateHistory({ messages: [], summaries: [] });
      store.setProject(p);
      loadHistory()
        .then((h) => store.hydrateHistory(h))
        .catch((e: { message?: string }) => {
          store.addChatError(-1, `Failed to load history: ${e.message ?? String(e)}`);
        });
    });

    void lspStatus().then((s) => store.setLspStatus(s)).catch(() => {});

    let unlisten: (() => void) | undefined;
    void listenFsChanged((change) => {
      const parts = change.path.split("/");
      parts.pop();
      const parent = parts.join("/") || "";

      store.invalidatePath(parent);

      if (change.kind !== "removed") {
        const buf = buffersRef.current.get(change.path);
        if (buf && change.content_hash && change.content_hash !== buf.contentHash) {
          store.flagExternalChange(change.path);
        }
      }

      void gitStatus()
        .then((s) => store.setGitStatus(s))
        .catch(() => {});
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- store methods are stable

  return (
    <div className="app">
      <header className="titlebar">
        <span className="titlebar__brand">{info?.name ?? "Cantus"}</span>
        <span className="titlebar__path">
          {store.project?.root_path ?? "No project open"}
        </span>
        {info && <span className="titlebar__version">v{info.version}</span>}
      </header>

      <PanelGroup direction="horizontal" className="workspace">
        <Panel defaultSize={18} minSize={12}>
          <Pane>
            <div className="sidebar-tabs">
              <button
                className={`sidebar-tab${sidebarTab === "explorer" ? " sidebar-tab--active" : ""}`}
                onClick={() => setSidebarTab("explorer")}
              >
                Files
              </button>
              <button
                className={`sidebar-tab${sidebarTab === "git" ? " sidebar-tab--active" : ""}`}
                onClick={() => setSidebarTab("git")}
              >
                Git
              </button>
            </div>
            <div className="sidebar-body">
              {sidebarTab === "explorer" ? <Explorer /> : <GitPanel />}
            </div>
          </Pane>
        </Panel>
        <PanelResizeHandle className="resize resize--col" />
        <Panel defaultSize={54} minSize={30}>
          <PanelGroup direction="vertical">
            <Panel defaultSize={70} minSize={20}>
              <Pane>
                {store.diffPath ? <DiffView /> : <EditorPane />}
              </Pane>
            </Panel>
            <PanelResizeHandle className="resize resize--row" />
            <Panel defaultSize={30} minSize={10}>
              <Pane>
                <Terminal />
              </Pane>
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle className="resize resize--col" />
        <Panel defaultSize={28} minSize={18}>
          <Pane>
            <Terminal program="claude" />
          </Pane>
        </Panel>
      </PanelGroup>

      <StatusBar />

      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          focusChatInput={focusChatInput}
        />
      )}
    </div>
  );
}

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void appInfo().then(setInfo);
  }, []);

  return (
    <StoreProvider>
      <WorkspaceInner info={info} />
    </StoreProvider>
  );
}
