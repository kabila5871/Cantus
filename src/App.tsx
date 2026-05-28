import { useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { appInfo, currentProject, listenFsChanged, gitStatus, type AppInfo } from "./ipc";
import { StoreProvider } from "./StoreProvider";
import { useStore } from "./store";
import { Explorer } from "./Explorer";
import { EditorPane } from "./EditorPane";
import { Terminal } from "./Terminal";
import { GitPanel } from "./GitPanel";
import { DiffView } from "./DiffView";
import { ChatPane } from "./ChatPane";
import "@xterm/xterm/css/xterm.css";
import "./App.css";

function Pane({ children }: { children: React.ReactNode }) {
  return <section className="pane">{children}</section>;
}

type SidebarTab = "explorer" | "git";

function WorkspaceInner({ info }: { info: AppInfo | null }) {
  const store = useStore();
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("explorer");

  // The fs-event subscription below lives for the component's lifetime, so it
  // must read the live buffer map, not the empty one captured at mount.
  const buffersRef = useRef(store.buffers);
  buffersRef.current = store.buffers;

  // Restore active project on mount and subscribe to fs events.
  useEffect(() => {
    void currentProject().then((p) => {
      if (p) store.setProject(p);
    });

    let unlisten: (() => void) | undefined;
    void listenFsChanged((change) => {
      // Parent dir of the changed path needs re-fetch.
      const parts = change.path.split("/");
      parts.pop();
      const parent = parts.join("/") || "";

      store.invalidatePath(parent);

      // Flag an open buffer only if disk content truly diverged from what we
      // last wrote/read — hash comparison suppresses our own write events.
      if (change.kind !== "removed") {
        const buf = buffersRef.current.get(change.path);
        if (buf && change.content_hash && change.content_hash !== buf.contentHash) {
          store.flagExternalChange(change.path);
        }
      }

      // Refresh git mirror on any worktree change.
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
        {store.gitStatus && (
          <span className="titlebar__git">
            {store.gitStatus.branch ?? "HEAD"}
            {store.gitStatus.entries.filter((e) => e.staged != null).length > 0 && (
              <span className="titlebar__git-staged">
                {" "}
                S:{store.gitStatus.entries.filter((e) => e.staged != null).length}
              </span>
            )}
            {store.gitStatus.entries.filter((e) => e.unstaged != null).length > 0 && (
              <span className="titlebar__git-changed">
                {" "}
                M:{store.gitStatus.entries.filter((e) => e.unstaged != null).length}
              </span>
            )}
          </span>
        )}
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
            {sidebarTab === "explorer" ? <Explorer /> : <GitPanel />}
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
            <ChatPane />
          </Pane>
        </Panel>
      </PanelGroup>
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
