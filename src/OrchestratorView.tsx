import { useRef, useState } from "react";
import { TerminalTabs, type TerminalTabDef } from "./TerminalTabs";

interface OrchestratorViewProps {
  onClose(): void;
}

let workerCounter = 0;
const newWorkerKey = () => `orch-${++workerCounter}`;

function setupPrompt(goal: string, tasks: string[]): string {
  const numbered = tasks.map((t, i) => `${i + 1}. ${t}`).join("\n");
  return `Overall goal: ${goal}

Planned tasks:
${numbered}

Before any implementation, prepare THIS repository's Claude Code assets so these tasks can be executed well:
- Create or update the agents (.claude/agents/*.md), skills (.claude/skills/<name>/SKILL.md), and/or workflows (.claude/workflows/*.js) the work needs.
- If a relevant agent/skill/workflow already EXISTS, modify it to fit rather than creating a duplicate.
- Keep them minimal and specific to this goal.
When done, list exactly what you created or modified. Do NOT implement the tasks themselves yet — that happens next in separate worker sessions.`;
}

function composePrompt(goal: string, task: string): string {
  return `Overall goal: ${goal}

Your task: ${task}

Use the project's Claude agents/skills/workflows under .claude/ where helpful — they were prepared for this goal.

Work autonomously in this repository: make the changes needed for your task, then briefly summarize what you changed. Stay scoped to your task.`;
}

function shortTitle(task: string, n: number): string {
  const trimmed = task.trim();
  if (!trimmed) return `Worker ${n}`;
  return trimmed.length > 24 ? trimmed.slice(0, 24) + "…" : trimmed;
}

export function OrchestratorView({ onClose }: OrchestratorViewProps) {
  const [goal, setGoal] = useState("");
  const [tasks, setTasks] = useState<string[]>([""]);
  const [workers, setWorkers] = useState<TerminalTabDef[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [prepared, setPrepared] = useState(false);
  const workersRef = useRef(workers);
  workersRef.current = workers;

  const nonEmptyTasks = tasks.filter((t) => t.trim().length > 0);

  const handlePrepare = () => {
    if (!goal.trim()) return;
    const key = newWorkerKey();
    const tab: TerminalTabDef = {
      key,
      title: "Setup · assets",
      program: "claude",
      args: [setupPrompt(goal, nonEmptyTasks)],
    };
    setWorkers((prev) => [...prev, tab]);
    setActiveKey(key);
    setPrepared(true);
  };

  const handleLaunch = () => {
    if (nonEmptyTasks.length === 0 || !prepared) return;
    const newWorkers: TerminalTabDef[] = nonEmptyTasks.map((task, i) => ({
      key: newWorkerKey(),
      title: shortTitle(task, workers.length + i + 1),
      program: "claude",
      args: [composePrompt(goal, task)],
    }));
    setWorkers((prev) => [...prev, ...newWorkers]);
    setActiveKey(newWorkers[0].key);
  };

  const handleClose = (key: string) => {
    const current = workersRef.current;
    setActiveKey((cur) => {
      if (cur !== key) return cur;
      const idx = current.findIndex((w) => w.key === key);
      const remaining = current.filter((w) => w.key !== key);
      return (remaining[idx] ?? remaining[idx - 1])?.key ?? null;
    });
    setWorkers((prev) => prev.filter((w) => w.key !== key));
  };

  const handleAdd = () => {
    const key = newWorkerKey();
    setWorkers((prev) => [...prev, { key, title: `Worker ${prev.length + 1}`, program: "claude" }]);
    setActiveKey(key);
  };

  const updateTask = (idx: number, value: string) => {
    setTasks((prev) => prev.map((t, i) => (i === idx ? value : t)));
  };

  const removeTask = (idx: number) => {
    setTasks((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length === 0 ? [""] : next;
    });
  };

  const addTask = () => setTasks((prev) => [...prev, ""]);

  return (
    <div className="orchestrator">
      <div className="asset-browser__header">
        <span className="asset-browser__title">Orchestrator</span>
        <button className="asset-browser__close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="orchestrator__composer">
        <textarea
          className="orchestrator__goal"
          placeholder="Overall goal…"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={3}
        />
        <div className="orchestrator__tasks">
          {tasks.map((task, idx) => (
            <div key={idx} className="orchestrator__task-row">
              <input
                className="orchestrator__task-input"
                placeholder={`Task ${idx + 1}…`}
                value={task}
                onChange={(e) => updateTask(idx, e.target.value)}
              />
              <button
                className="orchestrator__task-remove"
                onClick={() => removeTask(idx)}
                title="Remove task"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="orchestrator__actions">
          <button className="orchestrator__add-task" onClick={addTask}>
            Add task
          </button>
          <button
            className="orchestrator__launch"
            onClick={handlePrepare}
            disabled={!goal.trim() || prepared}
          >
            1 · Prepare agents &amp; skills
          </button>
          <button
            className="orchestrator__launch orchestrator__launch--secondary"
            onClick={handleLaunch}
            disabled={!prepared || nonEmptyTasks.length === 0}
          >
            2 · Start orchestration ({nonEmptyTasks.length})
          </button>
        </div>
        <div className="orchestrator__hint">
          Prepare first — let Claude create/modify the agents, skills &amp; workflows; then start orchestration.
        </div>
      </div>

      <div className="orchestrator__board">
        <TerminalTabs
          tabs={workers}
          activeKey={activeKey}
          onSelect={setActiveKey}
          onClose={handleClose}
          onAdd={handleAdd}
          emptyState={
            <div className="orchestrator__empty">
              Set a goal and tasks, click "1 · Prepare" to scaffold Claude assets, then "2 · Start orchestration" to fan out workers.
            </div>
          }
        />
      </div>
    </div>
  );
}
