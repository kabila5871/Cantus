import { useEffect, useRef, useState } from "react";
import {
  gitStatus,
  gitStage,
  gitUnstage,
  gitCommit,
  type GitFileStatus,
  type GitStatus,
  type CommandError,
} from "./ipc";
import { useStore } from "./store";

const CHANGE_LABEL: Record<string, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  untracked: "U",
  conflicted: "C",
};

function FileRow({
  entry,
  side,
  onAction,
  onDiff,
}: {
  entry: GitFileStatus;
  side: "staged" | "unstaged";
  onAction: (paths: string[]) => Promise<void>;
  onDiff: (path: string) => void;
}) {
  const change = side === "staged" ? entry.staged! : entry.unstaged!;
  const label = CHANGE_LABEL[change] ?? "?";
  const name = entry.path.split("/").at(-1) ?? entry.path;

  return (
    <div className="git-row" onClick={() => onDiff(entry.path)} title={entry.path}>
      <span className={`git-badge git-badge--${change}`}>{label}</span>
      <span className="git-row__name">{name}</span>
      <button
        className="git-row__action"
        title={side === "staged" ? "Unstage" : "Stage"}
        onClick={(e) => {
          e.stopPropagation();
          void onAction([entry.path]);
        }}
      >
        {side === "staged" ? "−" : "+"}
      </button>
    </div>
  );
}

export function GitPanel() {
  const store = useStore();
  const [error, setError] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const projectRef = useRef(store.project);
  projectRef.current = store.project;

  const load = async () => {
    if (!projectRef.current) return;
    try {
      store.setGitStatus(await gitStatus());
      setError(null);
    } catch (e) {
      const err = e as CommandError;
      if (err.kind === "git" || err.kind === "no_project") {
        store.setGitStatus(null);
        setError(err.kind === "no_project" ? null : "Not a git repository");
      }
    }
  };

  useEffect(() => {
    void load();
  }, [store.project]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStage = async (paths: string[]) => {
    try {
      store.setGitStatus(await gitStage(paths));
      setError(null);
    } catch (e) {
      setError((e as CommandError).message);
    }
  };

  const handleUnstage = async (paths: string[]) => {
    try {
      store.setGitStatus(await gitUnstage(paths));
      setError(null);
    } catch (e) {
      setError((e as CommandError).message);
    }
  };

  const handleCommit = async () => {
    if (!commitMsg.trim()) return;
    setCommitting(true);
    try {
      store.setGitStatus(await gitCommit(commitMsg.trim()));
      setCommitMsg("");
      setError(null);
    } catch (e) {
      setError((e as CommandError).message);
    } finally {
      setCommitting(false);
    }
  };

  if (!store.project) {
    return (
      <div className="git-panel git-panel--empty">
        <span>No project open</span>
      </div>
    );
  }

  if (error === "Not a git repository") {
    return (
      <div className="git-panel git-panel--empty">
        <span>Not a git repository</span>
      </div>
    );
  }

  const status: GitStatus | null = store.gitStatus;
  const staged = status?.entries.filter((e) => e.staged != null) ?? [];
  const unstaged = status?.entries.filter((e) => e.unstaged != null) ?? [];
  const canCommit = !committing && commitMsg.trim().length > 0 && staged.length > 0;

  return (
    <div className="git-panel">
      <div className="git-panel__header">
        <span className="git-panel__branch">
          {status?.branch ?? "detached HEAD"}
        </span>
        {status && (status.ahead > 0 || status.behind > 0) && (
          <span className="git-panel__sync">
            {status.ahead > 0 && `↑${status.ahead}`}
            {status.behind > 0 && `↓${status.behind}`}
          </span>
        )}
      </div>

      {error && <div className="git-panel__error">{error}</div>}

      <div className="git-panel__scroll">
        {staged.length > 0 && (
          <section className="git-section">
            <div className="git-section__title">
              Staged
              <button
                className="git-section__action"
                onClick={() => void handleUnstage(staged.map((e) => e.path))}
                title="Unstage all"
              >
                −
              </button>
            </div>
            {staged.map((entry) => (
              <FileRow
                key={entry.path + ":staged"}
                entry={entry}
                side="staged"
                onAction={handleUnstage}
                onDiff={store.openDiff}
              />
            ))}
          </section>
        )}

        {unstaged.length > 0 && (
          <section className="git-section">
            <div className="git-section__title">
              Changes
              <button
                className="git-section__action"
                onClick={() => void handleStage(unstaged.map((e) => e.path))}
                title="Stage all"
              >
                +
              </button>
            </div>
            {unstaged.map((entry) => (
              <FileRow
                key={entry.path + ":unstaged"}
                entry={entry}
                side="unstaged"
                onAction={handleStage}
                onDiff={store.openDiff}
              />
            ))}
          </section>
        )}

        {staged.length === 0 && unstaged.length === 0 && status && (
          <div className="git-panel__clean">No changes</div>
        )}
      </div>

      <div className="git-panel__commit">
        <textarea
          className="git-commit-msg"
          placeholder="Commit message"
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          rows={3}
        />
        <button
          className="git-commit-btn"
          disabled={!canCommit}
          onClick={() => void handleCommit()}
        >
          Commit{staged.length > 0 ? ` (${staged.length})` : ""}
        </button>
      </div>
    </div>
  );
}
