import { useEffect, useState, type ReactNode } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { appInfo, projectRoot, type AppInfo } from "./ipc";
import "./App.css";

function Pane({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="pane">
      <header className="pane__title">{title}</header>
      <div className="pane__body">{children}</div>
    </section>
  );
}

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [root, setRoot] = useState<string | null>(null);

  useEffect(() => {
    void appInfo().then(setInfo);
    void projectRoot().then(setRoot);
  }, []);

  return (
    <div className="app">
      <header className="titlebar">
        <span className="titlebar__brand">{info?.name ?? "Cantus"}</span>
        <span className="titlebar__path">{root ?? "No project open"}</span>
        {info && <span className="titlebar__version">v{info.version}</span>}
      </header>

      <PanelGroup direction="horizontal" className="workspace">
        <Panel defaultSize={18} minSize={12}>
          <Pane title="Explorer" />
        </Panel>
        <PanelResizeHandle className="resize resize--col" />
        <Panel defaultSize={54} minSize={30}>
          <PanelGroup direction="vertical">
            <Panel defaultSize={70} minSize={20}>
              <Pane title="Editor" />
            </Panel>
            <PanelResizeHandle className="resize resize--row" />
            <Panel defaultSize={30} minSize={10}>
              <Pane title="Terminal" />
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle className="resize resize--col" />
        <Panel defaultSize={28} minSize={18}>
          <Pane title="Claude" />
        </Panel>
      </PanelGroup>
    </div>
  );
}
