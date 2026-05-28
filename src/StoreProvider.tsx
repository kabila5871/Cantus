import { useState, useCallback, type ReactNode } from "react";
import { StoreContext, type AppStore, type Buffer, type ChatMessage, type ProposeEdit } from "./store";
import type { Project, DirEntry, GitStatus, AgentStatus, Selection, RecentEdit, EditorContext } from "./ipc";

const MAX_RECENT_EDITS = 10;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<Project | null>(null);
  const [invalidatedPaths, setInvalidatedPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set());
  const [dirCache, setDirCacheState] = useState<Map<string, DirEntry[]>>(
    () => new Map(),
  );
  const [buffers, setBuffers] = useState<Map<string, Buffer>>(() => new Map());
  const [activeBufferPath, setActiveBufferPath] = useState<string | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [diffPath, setDiffPath] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({
    state: "stopped",
    project_id: null,
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activeSelection, setActiveSelection] = useState<Selection | null>(null);
  const [recentEdits, setRecentEdits] = useState<RecentEdit[]>([]);
  const [pendingEdit, setPendingEditState] = useState<ProposeEdit | null>(null);

  const invalidatePath = useCallback((path: string) => {
    setInvalidatedPaths((prev) => new Set(prev).add(path));
  }, []);

  const clearInvalidated = useCallback((path: string) => {
    setInvalidatedPaths((prev) => {
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  }, []);

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const setDirCache = useCallback((path: string, entries: DirEntry[]) => {
    setDirCacheState((prev) => new Map(prev).set(path, entries));
  }, []);

  const openBuffer = useCallback(
    (path: string, content: string, hash: string) => {
      setBuffers((prev) =>
        new Map(prev).set(path, {
          path,
          content,
          contentHash: hash,
          dirty: false,
          externallyChanged: false,
        }),
      );
      setActiveBufferPath(path);
    },
    [],
  );

  const setActiveBuffer = useCallback((path: string) => {
    setActiveBufferPath(path);
  }, []);

  const closeBuffer = useCallback(
    (path: string) => {
      setBuffers((prev) => {
        if (!prev.has(path)) return prev;
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
      // If the closed tab was active, fall back to the nearest remaining one.
      setActiveBufferPath((cur) => {
        if (cur !== path) return cur;
        const remaining = [...buffers.keys()].filter((k) => k !== path);
        return remaining.at(-1) ?? null;
      });
    },
    [buffers],
  );

  const markDirty = useCallback((path: string) => {
    setBuffers((prev) => {
      const buf = prev.get(path);
      if (!buf || buf.dirty) return prev;
      return new Map(prev).set(path, { ...buf, dirty: true });
    });
  }, []);

  const reconcileBuffer = useCallback((path: string, hash: string) => {
    setBuffers((prev) => {
      const buf = prev.get(path);
      if (!buf) return prev;
      return new Map(prev).set(path, {
        ...buf,
        contentHash: hash,
        dirty: false,
        externallyChanged: false,
      });
    });
  }, []);

  const flagExternalChange = useCallback((path: string) => {
    setBuffers((prev) => {
      const buf = prev.get(path);
      if (!buf) return prev;
      return new Map(prev).set(path, { ...buf, externallyChanged: true });
    });
  }, []);

  const openDiff = useCallback((path: string) => setDiffPath(path), []);
  const closeDiff = useCallback(() => setDiffPath(null), []);

  const appendChatDelta = useCallback((runId: number, text: string) => {
    setChatMessages((prev) => {
      // Tool activity can land between delta batches, so accumulate into the
      // run's open streaming bubble wherever it sits — not just at the tail.
      const i = prev.findIndex(
        (m) => m.runId === runId && m.kind === "assistant" && m.streaming,
      );
      if (i === -1) {
        return [...prev, { runId, kind: "assistant", text, streaming: true }];
      }
      const next = [...prev];
      next[i] = { ...next[i], text: next[i].text + text };
      return next;
    });
  }, []);

  const finalizeChatMessage = useCallback(
    (runId: number, role: string, text: string) => {
      const kind = role === "user" ? "user" : "assistant";
      setChatMessages((prev) => {
        // Settle the run's open assistant bubble in place; user echoes never
        // stream, so they're always appended.
        const i =
          kind === "assistant"
            ? prev.findIndex(
                (m) => m.runId === runId && m.kind === "assistant" && m.streaming,
              )
            : -1;
        if (i === -1) {
          return [...prev, { runId, kind, text, streaming: false }];
        }
        const next = [...prev];
        next[i] = { runId, kind, text, streaming: false };
        return next;
      });
    },
    [],
  );

  const addChatActivity = useCallback((runId: number, line: string) => {
    setChatMessages((prev) => [
      ...prev,
      { runId, kind: "activity", text: line, streaming: false },
    ]);
  }, []);

  const addChatError = useCallback((runId: number, message: string) => {
    setChatMessages((prev) => [
      ...prev,
      { runId, kind: "error", text: message, streaming: false },
    ]);
  }, []);

  const pushRecentEdit = useCallback((path: string) => {
    setRecentEdits((prev) => {
      const name = path.split("/").at(-1) ?? path;
      const entry: RecentEdit = { path, summary: `saved ${name}` };
      const without = prev.filter((e) => e.path !== path);
      return [entry, ...without].slice(0, MAX_RECENT_EDITS);
    });
  }, []);

  // Snapshot is read at send time — no per-keystroke streaming to the backend.
  const editorContext = useCallback((): EditorContext => {
    return {
      active_path: activeBufferPath,
      selection: activeSelection,
      recent_edits: recentEdits,
    };
  // activeBufferPath, activeSelection, recentEdits are stable refs read at call time
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBufferPath, activeSelection, recentEdits]);

  const setPendingEdit = useCallback((edit: ProposeEdit) => {
    setPendingEditState(edit);
  }, []);

  const clearPendingEdit = useCallback(() => {
    setPendingEditState(null);
  }, []);

  const store: AppStore = {
    project,
    setProject,
    invalidatedPaths,
    invalidatePath,
    clearInvalidated,
    expandedDirs,
    toggleDir,
    dirCache,
    setDirCache,
    buffers,
    activeBufferPath,
    openBuffer,
    setActiveBuffer,
    closeBuffer,
    markDirty,
    reconcileBuffer,
    flagExternalChange,
    gitStatus,
    setGitStatus,
    diffPath,
    openDiff,
    closeDiff,
    agentStatus,
    setAgentStatus,
    chatMessages,
    appendChatDelta,
    finalizeChatMessage,
    addChatActivity,
    addChatError,
    activeSelection,
    setActiveSelection,
    recentEdits,
    pushRecentEdit,
    editorContext,
    pendingEdit,
    setPendingEdit,
    clearPendingEdit,
  };

  return (
    <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
  );
}
