import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { systemStats, claudeTokenUsage, type SystemStats, type ClaudeTokens } from "./ipc";

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

const gb = (mb: number) => (mb / 1024).toFixed(1);

export function Monitor() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [tokens, setTokens] = useState<ClaudeTokens | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = () => systemStats().then((s) => alive && setStats(s)).catch(() => {});
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    claudeTokenUsage().then(setTokens).catch(() => {});
  }, [open]);

  if (!stats) return null;

  return (
    <div className="monitor">
      <button className="monitor__trigger" onClick={() => setOpen((o) => !o)} title="System & Claude usage">
        <span className="monitor__metric">CPU {Math.round(stats.cpu_percent)}%</span>
        <span className="monitor__metric">{gb(stats.mem_used_mb)}G</span>
        <span className="monitor__metric monitor__metric--claude">⌬ {stats.claude_count}</span>
      </button>

      {open &&
        createPortal(
          <>
          <div className="monitor__backdrop" onClick={() => setOpen(false)} />
          <div className="monitor__popover">
            <div className="monitor__row">
              <span className="monitor__label">System</span>
              <span className="monitor__val">
                CPU {Math.round(stats.cpu_percent)}% · RAM {gb(stats.mem_used_mb)}/{gb(stats.mem_total_mb)} GB
              </span>
            </div>
            <div className="monitor__row">
              <span className="monitor__label">Cantus</span>
              <span className="monitor__val">
                CPU {Math.round(stats.app_cpu_percent)}% · {stats.app_mem_mb} MB
              </span>
            </div>
            <div className="monitor__row">
              <span className="monitor__label">Claude</span>
              <span className="monitor__val">
                {stats.claude_count} process{stats.claude_count === 1 ? "" : "es"} · CPU{" "}
                {Math.round(stats.claude_cpu_percent)}% · {stats.claude_mem_mb} MB
              </span>
            </div>
            <div className="monitor__row">
              <span className="monitor__label">Tokens</span>
              <span className="monitor__val">
                {tokens ? `${fmtNum(tokens.today)} today · ${fmtNum(tokens.total)} total` : "…"}
              </span>
            </div>
          </div>
          </>,
          document.body,
        )}
    </div>
  );
}
