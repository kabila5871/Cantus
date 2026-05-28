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

interface TerminalProps {
  program?: string;
  args?: string[];
  visible?: boolean;
  onPty?: (id: number) => void;
}

export function Terminal({ program, args, visible = true, onPty }: TerminalProps) {
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
      if (e.id !== termId) return;
      disposeTerm();
      termId = null;
      termIdRef.current = null;
    });

    // Open once JetBrains Mono is loaded (so xterm measures the right cell), then
    // fit + spawn on the NEXT FRAME: this effect runs after React commits but
    // before the browser lays out the container, so measuring synchronously gives
    // a zero-size box and a bogus column count (claude wraps to a sliver).
    const boot = () => {
      if (disposed) return;
      term.open(container);

      requestAnimationFrame(() => {
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
            // Container is fully laid out now — push the true size to the pty.
            fit.fit();
            void ptyResize(spawned.id, term.cols, term.rows).catch(() => {});
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
      });
    };

    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.load) {
      void fonts.load('13px "JetBrains Mono"').then(boot, boot);
    } else {
      boot();
    }

    return () => {
      disposed = true;
      fitRef.current = null;
      termRef.current = null;
      termIdRef.current = null;
      ro?.disconnect();
      void unlistenOutputP.then((fn) => fn());
      void unlistenExitP.then((fn) => fn());
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
      style={{ width: "100%", height: "100%", display: visible ? undefined : "none" }}
    />
  );
}
