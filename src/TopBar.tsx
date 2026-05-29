import type { ReactElement } from "react";

export type TopView =
  | "none"
  | "skills"
  | "agents"
  | "workflows"
  | "sessions"
  | "orchestrator"
  | "memory";

interface TopBarProps {
  active: TopView;
  onSelect: (view: TopView) => void;
  appName: string;
  version?: string;
  projectPath: string | null;
  onQuickOpen: () => void;
  hasProject: boolean;
}

type View = Exclude<TopView, "none">;

// Compact 16×16 line icons (stroke = currentColor) so the toggles read at a glance.
const ICON: Record<View, ReactElement> = {
  skills: <path d="M8 2l1.6 4.4L14 8l-4.4 1.6L8 14l-1.6-4.4L2 8l4.4-1.6z" />,
  agents: (
    <>
      <rect x="3" y="5.5" width="10" height="7.5" rx="2" />
      <path d="M8 5.5V3" />
      <circle cx="8" cy="2.3" r="0.6" fill="currentColor" />
      <path d="M6 9h0.01M10 9h0.01" />
    </>
  ),
  workflows: (
    <>
      <circle cx="4" cy="4" r="1.8" />
      <circle cx="4" cy="12" r="1.8" />
      <circle cx="12" cy="8" r="1.8" />
      <path d="M5.6 4.6 10.4 7.4M5.6 11.4 10.4 8.6" />
    </>
  ),
  sessions: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" />
    </>
  ),
  orchestrator: (
    <>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
    </>
  ),
  memory: (
    <>
      <rect x="3" y="3" width="10" height="10" rx="2" />
      <path d="M3 6.5h-1.5M3 9.5h-1.5M14.5 6.5H13M14.5 9.5H13M6.5 3V1.5M9.5 3V1.5M6.5 14.5V13M9.5 14.5V13" />
      <rect x="6" y="6" width="4" height="4" rx="1" />
    </>
  ),
};

const VIEWS: View[] = ["skills", "agents", "workflows", "sessions", "orchestrator", "memory"];
const LABEL: Record<View, string> = {
  skills: "Skills",
  agents: "Agents",
  workflows: "Workflows",
  sessions: "Sessions",
  orchestrator: "Task runner",
  memory: "Memory",
};

export function TopBar({
  active,
  onSelect,
  appName,
  version,
  projectPath,
  onQuickOpen,
  hasProject,
}: TopBarProps) {
  const toggle = (view: View) => onSelect(active === view ? "none" : view);
  const projectName = projectPath?.split("/").filter(Boolean).pop() ?? null;

  return (
    <header className="top-bar">
      <div className="top-bar__brand">
        <img className="top-bar__logo" src="/cantus.svg" alt="" aria-hidden="true" />
        <span className="top-bar__name">{appName}</span>
        {projectName && (
          <>
            <span className="top-bar__sep">/</span>
            <span className="top-bar__project" title={projectPath ?? undefined}>
              {projectName}
            </span>
          </>
        )}
      </div>

      {hasProject && (
        <button className="top-bar__search" onClick={onQuickOpen} title="Go to File (⌘P)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 14 14" strokeLinecap="round" />
          </svg>
          <span className="top-bar__search-text">Search files</span>
          <kbd className="top-bar__search-kbd">⌘P</kbd>
        </button>
      )}

      <nav className="top-bar__views" role="tablist" aria-label="Panels">
        {VIEWS.map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={active === v}
            className={`top-bar__view${active === v ? " is-active" : ""}`}
            onClick={() => toggle(v)}
            title={LABEL[v]}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {ICON[v]}
            </svg>
            <span className="top-bar__view-label">{LABEL[v]}</span>
          </button>
        ))}
      </nav>

      {version && <span className="top-bar__version">v{version}</span>}
    </header>
  );
}
