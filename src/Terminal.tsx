import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import {
  ptySpawn,
  ptyWrite,
  ptyResize,
  ptyKill,
  listenPtyOutput,
  listenPtyExit,
  type CommandError,
} from "./ipc";

export function Terminal({ program }: { program?: string } = {}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      fontFamily: '"SF Mono", Menlo, monospace',
      fontSize: 13,
      theme: {
        background: "#1b1d23",
        foreground: "#d7dae0",
        cursor: "#5b9dd9",
        selectionBackground: "#5b9dd926",
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();

    let termId: number | null = null;
    let disposed = false;

    const unlistenOutputP = listenPtyOutput((o) => {
      if (o.id !== termId) return;
      term.write(Uint8Array.from(atob(o.data), (c) => c.charCodeAt(0)));
    });

    const unlistenExitP = listenPtyExit((e) => {
      if (e.id !== termId) return;
      term.dispose();
      termId = null;
    });

    ptySpawn(term.cols, term.rows, program)
      .then((spawned) => {
        if (disposed) {
          void ptyKill(spawned.id).catch(() => {});
          return;
        }
        termId = spawned.id;
      })
      .catch((e: CommandError) => {
        console.error("pty_spawn failed", e.kind, e.message);
      });

    term.onData((data) => {
      if (termId === null) return;
      void ptyWrite(termId, data).catch((e: CommandError) => {
        console.error("pty_write failed", e.kind, e.message);
      });
    });

    const ro = new ResizeObserver(() => {
      fit.fit();
      if (termId !== null) {
        void ptyResize(termId, term.cols, term.rows).catch((e: CommandError) => {
          console.error("pty_resize failed", e.kind, e.message);
        });
      }
    });
    ro.observe(container);

    return () => {
      disposed = true;
      ro.disconnect();
      void unlistenOutputP.then((fn) => fn());
      void unlistenExitP.then((fn) => fn());
      if (termId !== null) {
        void ptyKill(termId).catch((e: CommandError) => {
          console.error("pty_kill failed", e.kind, e.message);
        });
      }
      term.dispose();
    };
  }, [program]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
