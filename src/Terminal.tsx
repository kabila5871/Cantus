import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen } from "@tauri-apps/api/event";
import {
  ptySpawn,
  ptyWrite,
  ptyResize,
  ptyKill,
  listenPtyOutput,
  listenPtyExit,
  type CommandError,
} from "./ipc";

// Backslash-escape spaces and shell metacharacters — this mirrors what a native
// terminal inserts on a file drag, which is the form Claude Code's input detects
// (single-quoting is NOT recognized as a file path by its attachment parser).
const escapePath = (p: string) => p.replace(/[\s'"\\()$`&;|<>*?[\]{}!#~]/g, (c) => "\\" + c);

interface TerminalProps {
  program?: string;
  args?: string[];
  visible?: boolean;
  onPty?: (id: number) => void;
  onExit?: () => void;
}

export function Terminal({ program, args, visible = true, onPty, onExit }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const termIdRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      fontFamily: '"JetBrains Mono", Menlo, monospace',
      fontSize: 13,
      scrollback: 5000,
      theme: {
        background: "#0e1014",
        foreground: "#e4e7ee",
        cursor: "#e0855f",
        selectionBackground: "#e0855f33",
      },
    });
    termRef.current = term;

    const fit = new FitAddon();
    fitRef.current = fit;
    term.loadAddon(fit);

    let termId: number | null = null;
    let disposed = false;
    let termDisposed = false;
    let ro: ResizeObserver | null = null;

    const disposeTerm = () => {
      if (termDisposed) return;
      termDisposed = true;
      term.dispose();
    };

    const unlistenOutputP = listenPtyOutput((o) => {
      if (o.id !== termId) return;
      term.write(Uint8Array.from(atob(o.data), (c) => c.charCodeAt(0)));
    });

    const unlistenExitP = listenPtyExit((e) => {
      if (disposed || e.id !== termId) return;
      disposeTerm();
      termId = null;
      termIdRef.current = null;
      onExit?.();
    });

    // Open once JetBrains Mono is loaded (so xterm measures the right cell), then
    // fit + spawn on the NEXT FRAME: this effect runs after React commits but
    // before the browser lays out the container, so measuring synchronously gives
    // a zero-size box and a bogus column count (claude wraps to a sliver).
    const spawnNow = () => {
      if (disposed) return;
      fit.fit();

      ptySpawn(term.cols, term.rows, program, args)
        .then((spawned) => {
          if (disposed) {
            void ptyKill(spawned.id).catch(() => {});
            return;
          }
          termId = spawned.id;
          termIdRef.current = spawned.id;
          onPty?.(spawned.id);
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

      ro = new ResizeObserver(() => {
        fit.fit();
        if (termId !== null) {
          void ptyResize(termId, term.cols, term.rows).catch(() => {});
        }
      });
      ro.observe(container);
    };

    const boot = () => {
      if (disposed) return;
      term.open(container);

      // Spawn only once the pane has stopped GROWING (reached its final width).
      // claude draws its UI at spawn-time width, and a banner printed while the
      // pane is still a sliver can't reflow when the pane later grows. Track the
      // max width seen and spawn once it has held steady (stopped growing).
      let maxWidth = 0;
      let sinceGrow = 0;
      let attempts = 0;
      const waitForSettle = () => {
        if (disposed) return;
        const w = container.clientWidth;
        if (w > maxWidth) {
          maxWidth = w;
          sinceGrow = 0;
        } else {
          sinceGrow++;
        }
        attempts++;
        // ~250ms with no further growth, or a 5s hard cap.
        if ((maxWidth > 0 && sinceGrow >= 5) || attempts > 100) {
          spawnNow();
        } else {
          setTimeout(waitForSettle, 50);
        }
      };
      waitForSettle();
    };

    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.load) {
      void fonts.load('13px "JetBrains Mono"').then(boot, boot);
    } else {
      boot();
    }

    // The built-in `tauri://drag-*` events never reached this listener, so the Rust
    // side (on_window_event) handles the OS drop and re-emits a normal custom event
    // carrying the absolute path(s) + cursor. Write them into the PTY — the same
    // thing a native terminal does on a file drag. Route to the terminal under the
    // cursor; fall back to the focused terminal when coords are ambiguous.
    type DragPayload = { phase: "over" | "leave" | "drop"; paths: string[]; position: { x: number; y: number } | null };
    // Accept a drop when the cursor is over this terminal — tested at both physical
    // and CSS pixel scales because the OS position's scale is unreliable. For the
    // Claude pane specifically, accept whenever it is the visible terminal: it is the
    // pane users drag files onto, and the coordinate test alone can't be trusted.
    const rect = () => container.getBoundingClientRect();
    const pointInContainer = (pos: { x: number; y: number } | null) => {
      if (!pos) return false;
      const r = rect();
      if (r.width === 0 || r.height === 0) return false;
      const dpr = window.devicePixelRatio || 1;
      const hit = (x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      return hit(pos.x / dpr, pos.y / dpr) || hit(pos.x, pos.y);
    };
    const isVisible = () => rect().width > 0 && rect().height > 0;
    const isDropTarget = (pos: { x: number; y: number } | null) =>
      pointInContainer(pos) || (program === "claude" && isVisible());

    const dragUnlistenP = listen<DragPayload>("cantus://drag", (e) => {
      if (disposed) return;
      const { phase, paths, position } = e.payload;
      if (phase === "leave") {
        container.classList.remove("terminal--drag-over");
        return;
      }
      const target = isDropTarget(position);
      if (phase === "over") {
        container.classList.toggle("terminal--drag-over", target);
        return;
      }
      container.classList.remove("terminal--drag-over");
      if (termId === null || !paths.length || !target) return;
      term.focus();
      void ptyWrite(termId, paths.map(escapePath).join(" ") + " ").catch((err: CommandError) =>
        console.error("pty_write (drop) failed", err.kind, err.message),
      );
    });

    return () => {
      disposed = true;
      fitRef.current = null;
      termRef.current = null;
      termIdRef.current = null;
      ro?.disconnect();
      void unlistenOutputP.then((fn) => fn());
      void unlistenExitP.then((fn) => fn());
      void dragUnlistenP.then((fn) => fn()).catch(() => {});
      if (termId !== null) {
        void ptyKill(termId).catch(() => {});
      }
      disposeTerm();
    };
  }, [program, args]); // eslint-disable-line react-hooks/exhaustive-deps -- args identity is stable per tab

  // display:none suppresses the ResizeObserver, so refit (with the real size) on reveal.
  useEffect(() => {
    if (!visible) return;
    const fit = fitRef.current;
    const term = termRef.current;
    const id = termIdRef.current;
    if (!fit || !term) return;
    requestAnimationFrame(() => {
      fit.fit();
      if (id !== null) {
        void ptyResize(id, term.cols, term.rows).catch(() => {});
      }
    });
  }, [visible]);

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, display: visible ? undefined : "none" }}
    />
  );
}
