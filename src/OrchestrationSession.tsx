import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  gapCheck,
  distillMemory,
  listSessions,
  findRunSession,
  listClaudeAssets,
  listCapabilityStats,
  recordCapabilityUse,
  type CommandError,
  type AssetItem,
  type CapabilityStat,
  type CapabilityKind,
  type GapItem,
} from "./ipc";
import { Terminal } from "./Terminal";

interface OrchestrationSessionProps {
  visible: boolean;
  goal: string;
  tasks: string[];
  onGoalChange: (g: string) => void;
  onRename: () => void;
  onClose: () => void;
  runSessionId: string | null;
  onRunSession: (id: string) => void;
}

type Decision = "reuse" | "compose" | "build";
type CapState = "idle" | "used" | "new";

interface Cap {
  name: string;
  kind: CapabilityKind;
  uses: number;
  successes: number;
  state: CapState;
  detail: string;
}

interface Worker {
  args: string[];
  status: "running" | "ended";
}

function workflowPrompt(goal: string, subtasks: string[], caps: Cap[]): string {
  const agents = caps.filter((c) => c.kind === "agent").map((c) => c.name);
  const skills = caps.filter((c) => c.kind === "skill").map((c) => c.name);
  const numbered = subtasks.length
    ? subtasks.map((t, i) => `${i + 1}. ${t}`).join("\n")
    : "(decompose the goal yourself)";
  return `Goal: ${goal}

Subtasks:
${numbered}

Orchestrate this end to end yourself:
1. Author a Claude Code workflow at .claude/workflows/<kebab-name>.js that sequences the work — begin with the required \`export const meta = { name, description, phases }\` block, then drive the subtasks with agent()/parallel()/pipeline(). Best matches for this task — agents: ${agents.join(", ") || "none"}; skills: ${skills.join(", ") || "none"} — use them where they fit, plus any other agents/skills under .claude/ that help, and create any genuinely-missing skill/agent first.
2. Then RUN that workflow with the Workflow tool and report what it did.

You own the orchestration. Keep it minimal and runnable.`;
}

const ICONS: Record<string, ReactNode> = {
  analyze: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" strokeLinecap="round" />
    </>
  ),
  run: <path d="M5 3.5 13 8 5 12.5z" fill="currentColor" stroke="none" />,
  resume: (
    <>
      <path d="M2.6 8a5.4 5.4 0 1 0 1.7-3.9" />
      <path d="M2 3v3.2h3.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  restart: (
    <>
      <path d="M13.4 8a5.4 5.4 0 1 1-1.7-3.9" />
      <path d="M14 3v3.2h-3.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  collapse: <path d="M4 10l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />,
  expand: <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />,
  panel: (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="2" />
      <path d="M9.5 3v10" />
    </>
  ),
};

function IconBtn({
  icon,
  title,
  onClick,
  disabled,
  primary,
  busy,
}: {
  icon: ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      className={"orch__icon-btn" + (primary ? " orch__icon-btn--primary" : "") + (busy ? " orch__icon-btn--busy" : "")}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        {busy ? ICONS.restart : icon}
      </svg>
    </button>
  );
}

export function OrchestrationSession({
  visible,
  goal,
  tasks,
  onGoalChange,
  onRename,
  onClose,
  runSessionId,
  onRunSession,
}: OrchestrationSessionProps) {
  const [assets, setAssets] = useState<{ skills: AssetItem[]; agents: AssetItem[] }>({ skills: [], agents: [] });
  const [stats, setStats] = useState<CapabilityStat[]>([]);
  const [gap, setGap] = useState<GapItem[] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [gapError, setGapError] = useState<string | null>(null);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [runnerOpen, setRunnerOpen] = useState(true);
  const [railOpen, setRailOpen] = useState(false);

  const runRef = useRef<{ caps: Cap[]; goal: string } | null>(null);

  const subtasks = useMemo(() => tasks.filter((t) => t.trim().length > 0), [tasks]);

  const load = useCallback(() => {
    listClaudeAssets()
      .then((a) => setAssets({ skills: a.skills, agents: a.agents }))
      .catch(() => {});
    listCapabilityStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Relink a task with no stored run session (e.g. created before run-session
  // tracking) by matching its goal to an existing transcript, so Resume works.
  useEffect(() => {
    if (runSessionId || worker || !goal.trim()) return;
    findRunSession(goal).then((id) => id && onRunSession(id)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot recovery on open
  }, []);

  const reuseItems = useMemo(() => gap?.filter((i) => i.status === "reuse") ?? [], [gap]);
  const newItems = useMemo(() => gap?.filter((i) => i.status === "new") ?? [], [gap]);
  const decision: Decision | null = !gap
    ? null
    : newItems.length
      ? "build"
      : reuseItems.length >= 2
        ? "compose"
        : reuseItems.length === 1
          ? "reuse"
          : "build";

  const statOf = useCallback(
    (name: string, kind: CapabilityKind) => stats.find((s) => s.name === name && s.kind === kind),
    [stats],
  );

  const buildGroup = useCallback(
    (items: AssetItem[], kind: CapabilityKind): Cap[] => {
      const chosen = new Set((gap ?? []).filter((i) => i.kind === kind).map((i) => i.name));
      const known = new Set(items.map((a) => a.name));
      const registry: Cap[] = items.map((a) => {
        const st = statOf(a.name, kind);
        return {
          name: a.name,
          kind,
          uses: st?.uses ?? 0,
          successes: st?.successes ?? 0,
          state: chosen.has(a.name) ? "used" : "idle",
          detail: `${a.scope} ${kind}`,
        };
      });
      const proposed: Cap[] = newItems
        .filter((i) => i.kind === kind && !known.has(i.name))
        .map((i) => ({ name: i.name, kind, uses: 0, successes: 0, state: "new", detail: i.description }));
      return [...registry, ...proposed];
    },
    [gap, newItems, statOf],
  );

  const skillCaps = useMemo(() => buildGroup(assets.skills, "skill"), [buildGroup, assets.skills]);
  const agentCaps = useMemo(() => buildGroup(assets.agents, "agent"), [buildGroup, assets.agents]);
  const capsFromGap = useCallback(
    (items: GapItem[]): Cap[] =>
      items.map((i) => {
        const st = statOf(i.name, i.kind);
        return {
          name: i.name,
          kind: i.kind,
          uses: st?.uses ?? 0,
          successes: st?.successes ?? 0,
          state: i.status === "new" ? "new" : "used",
          detail: i.description,
        };
      }),
    [statOf],
  );
  const chosenCaps = useMemo<Cap[]>(() => capsFromGap(gap ?? []), [capsFromGap, gap]);

  const prompt = useMemo(() => workflowPrompt(goal, subtasks, chosenCaps), [goal, subtasks, chosenCaps]);

  const analyze = async () => {
    if (!goal.trim() || analyzing) return;
    setAnalyzing(true);
    setGapError(null);
    try {
      const skills = assets.skills.map((a) => `${a.name}: ${a.description}`);
      const agents = assets.agents.map((a) => `${a.name}: ${a.description}`);
      setGap(await gapCheck(goal, subtasks, skills, agents));
    } catch (e) {
      setGapError((e as CommandError).message || "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const runWorkflow = async () => {
    if (!goal.trim() || worker) return;
    let caps = chosenCaps;
    // Auto-run the gap-check if it hasn't, so the workflow prompt is enriched
    // with the relevant skills/agents rather than "none".
    if (!gap) {
      setAnalyzing(true);
      setGapError(null);
      try {
        const skills = assets.skills.map((a) => `${a.name}: ${a.description}`);
        const agents = assets.agents.map((a) => `${a.name}: ${a.description}`);
        const items = await gapCheck(goal, subtasks, skills, agents);
        setGap(items);
        caps = capsFromGap(items);
      } catch (e) {
        setGapError((e as CommandError).message || "Analysis failed");
      } finally {
        setAnalyzing(false);
      }
    }
    // Snapshot existing sessions so we can identify (and persist) the one this
    // run creates — that lets a closed task be reopened and resumed.
    const before = new Set((await listSessions().catch(() => [])).map((s) => s.id));
    runRef.current = { caps, goal: goal.trim() };
    setWorker({ args: [workflowPrompt(goal, subtasks, caps)], status: "running" });
    setRunnerOpen(false);
    setTimeout(() => {
      listSessions()
        .then((after) => {
          const fresh = after.find((s) => !before.has(s.id));
          if (fresh) onRunSession(fresh.id);
        })
        .catch(() => {});
    }, 3000);
  };

  const resumeRun = () => {
    if (!runSessionId || worker) return;
    setWorker({ args: ["--resume", runSessionId], status: "running" });
    setRunnerOpen(false);
  };

  const reset = () => {
    runRef.current = null;
    setWorker(null);
    setGap(null);
    setGapError(null);
    setMenuOpen(false);
    setRunnerOpen(true);
  };

  const onWorkerExit = () => {
    setWorker((w) => (w ? { ...w, status: "ended" } : w));
    const run = runRef.current;
    if (!run) return;
    runRef.current = null;
    run.caps.forEach((c) => recordCapabilityUse(c.name, c.kind, true).catch(() => {}));
    // Distill a durable lesson from the run's transcript (reconciled against
    // existing memories) instead of writing a structural row.
    distillMemory(run.goal).catch(() => {});
    listCapabilityStats().then(setStats).catch(() => {});
    load();
  };

  const statusText = worker ? (worker.status === "ended" ? "Done" : "Running") : gap ? "Analyzed" : "Ready";

  const renderChip = (c: Cap) => (
    <span
      key={c.kind + c.name}
      className={"orch__chip orch__chip--" + c.state}
      title={c.state === "new" ? c.detail : `${c.detail}${c.uses ? ` · used ${c.uses}×` : ""}`}
    >
      <span className="orch__chip-name">{c.name}</span>
      {c.state === "new" ? (
        <span className="orch__chip-badge">new</span>
      ) : (
        c.uses > 0 && (
          <span className="orch__chip-stat">
            {c.uses}× · {Math.round((c.successes / c.uses) * 100)}%
          </span>
        )
      )}
    </span>
  );

  return (
    <div className="orch">
      <div className="orch__main">
        <div className="orch__card">
          <div className="orch__card-main">
            <span className="orch__card-label">Task worker</span>
            <span className="orch__card-title">{goal.trim() || "Untitled task worker"}</span>
          </div>
          <div className="orch__card-side">
            <span className="orch__status">{statusText}</span>
            {worker && (
              <IconBtn
                icon={runnerOpen ? ICONS.collapse : ICONS.expand}
                title={runnerOpen ? "Minimise details" : "Show details"}
                onClick={() => setRunnerOpen((o) => !o)}
              />
            )}
            {worker && <IconBtn icon={ICONS.restart} title="Restart" onClick={reset} />}
            <IconBtn
              icon={ICONS.panel}
              title={railOpen ? "Hide capability memory" : "Show capability memory"}
              onClick={() => setRailOpen((o) => !o)}
              primary={!railOpen && chosenCaps.length > 0}
            />
            <button className="orch__menu-btn" title="Worker actions" onClick={() => setMenuOpen((o) => !o)}>
              ⋯
            </button>
            {menuOpen && (
              <>
                <div className="orch__menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="orch__menu">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onRename();
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className="orch__menu-danger"
                    onClick={() => {
                      setMenuOpen(false);
                      onClose();
                    }}
                  >
                    Close worker
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="orch__stage">
          {(!worker || runnerOpen) && (
          <div className={"orch__single" + (worker ? " orch__single--running" : "")}>
            <textarea
              className="orch__goal"
              placeholder="Describe the task — Claude will summarize coverage, build a workflow, and run it."
              value={goal}
              readOnly={!!worker}
              onChange={(e) => onGoalChange(e.target.value)}
              rows={3}
            />
            <div className="orch__single-actions">
              <IconBtn
                icon={ICONS.analyze}
                title={analyzing ? "Analyzing…" : gap ? "Re-analyze coverage" : "Analyze coverage"}
                onClick={analyze}
                disabled={!goal.trim() || analyzing || !!worker}
                busy={analyzing}
              />
              <IconBtn
                icon={ICONS.run}
                title="Create & run workflow"
                onClick={runWorkflow}
                disabled={!goal.trim() || analyzing || !!worker}
                primary
              />
              {runSessionId && !worker && (
                <IconBtn icon={ICONS.resume} title="Resume this task's last run" onClick={resumeRun} />
              )}
            </div>

            {gapError && <div className="orch__plan-error">{gapError}</div>}

            {gap && (
              <div className="orch__summary">
                {decision && <span className={"orch__badge orch__badge--" + decision}>{decision}</span>}
                <p>
                  {reuseItems.length
                    ? `Reuse ${reuseItems.map((i) => i.name).join(", ")}.`
                    : "Nothing existing covers this task."}
                </p>
                <p className={newItems.length ? undefined : "orch__summary-dim"}>
                  {newItems.length
                    ? `Build new: ${newItems.map((i) => i.name).join(", ")} (badged "new" in the panel).`
                    : "No new capabilities needed."}
                </p>
                <p className="orch__summary-dim">
                  Create &amp; run builds a .claude workflow from this and lets Claude orchestrate it.
                </p>
              </div>
            )}

            {goal.trim() && (
              <details className="orch__prompt-wrap" open>
                <summary className="orch__prompt-summary">Workflow prompt Claude will run</summary>
                <pre className="orch__prompt">{prompt}</pre>
              </details>
            )}
          </div>
          )}

          {worker && (
            <div className="orch__termwrap">
              <Terminal program="claude" args={worker.args} visible={visible} onExit={onWorkerExit} />
            </div>
          )}
        </div>
      </div>

      {railOpen && (
        <aside className="orch__rail">
          <div className="orch__rail-head">Capability memory · registry + what worked</div>
          <div className="orch__rail-group">
            <span className="orch__rail-label">Skills</span>
            <div className="orch__chips">
              {skillCaps.length ? skillCaps.map(renderChip) : <span className="orch__cap-empty">none in registry</span>}
            </div>
          </div>
          <div className="orch__rail-group">
            <span className="orch__rail-label">Agents</span>
            <div className="orch__chips">
              {agentCaps.length ? agentCaps.map(renderChip) : <span className="orch__cap-empty">none in registry</span>}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
