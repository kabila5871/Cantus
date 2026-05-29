import { useState, useCallback, type ReactNode } from "react";
import { StoreContext, type AppStore, type Buffer, type ChatMessage, type PaneId } from "./store";
import type { Project, DirEntry, GitStatus, SessionMeta } from "./ipc";

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
  const [focusedPane, setFocusedPane] = useState<PaneId>("editor");
  const [chatLaunch, setChatLaunch] = useState<string | null>(null);
  const [chatOpenSession, setChatOpenSessionState] = useState<SessionMeta | null>(null);
  const [agentChanges, setAgentChanges] = useState<string[]>([]);
  const [chatActive, setChatActive] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [revealTarget, setRevealTargetState] = useState<{ path: string; line: number; column: number } | null>(null);

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
      setDiffPath(null);
    },
    [],
  );

  const setActiveBuffer = useCallback((path: string) => {
    setActiveBufferPath(path);
    setDiffPath(null);
  }, []);

  const closeBuffer = useCallback(
    (path: string) => {
      setBuffers((prev) => {
        if (!prev.has(path)) return prev;
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
      setActiveBufferPath((cur) => {
        if (cur !== path) return cur;
        const remaining = [...buffers.keys()].filter((k) => k !== path);
        return remaining.at(-1) ?? null;
      });
    },
    [buffers],
  );

  const updateBuffer = useCallback((path: string, content: string) => {
    setBuffers((prev) => {
      const buf = prev.get(path);
      if (!buf || buf.content === content) return prev;
      return new Map(prev).set(path, { ...buf, content, dirty: true });
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

  const addChatError = useCallback((runId: number, message: string) => {
    setChatMessages((prev) => [
      ...prev,
      { runId, kind: "error", text: message, streaming: false },
    ]);
  }, []);

  const focusPane = useCallback((pane: PaneId) => setFocusedPane(pane), []);
  const setChatLaunchCb = useCallback((v: string | null) => setChatLaunch(v), []);
  const setChatOpenSession = useCallback((v: SessionMeta | null) => setChatOpenSessionState(v), []);

  const noteAgentChange = useCallback((path: string) => {
    setAgentChanges((prev) => [path, ...prev.filter((p) => p !== path)]);
  }, []);

  const dismissAgentChange = useCallback((path: string) => {
    setAgentChanges((prev) => prev.filter((p) => p !== path));
  }, []);

  const clearAgentChanges = useCallback(() => setAgentChanges([]), []);
  const setChatActiveCb = useCallback((b: boolean) => setChatActive(b), []);
  const setRevealTarget = useCallback((t: { path: string; line: number; column: number } | null) => setRevealTargetState(t), []);

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
    updateBuffer,
    reconcileBuffer,
    flagExternalChange,
    gitStatus,
    setGitStatus,
    diffPath,
    openDiff,
    closeDiff,
    focusedPane,
    focusPane,
    chatLaunch,
    setChatLaunch: setChatLaunchCb,
    chatOpenSession,
    setChatOpenSession,
    agentChanges,
    noteAgentChange,
    dismissAgentChange,
    clearAgentChanges,
    chatActive,
    setChatActive: setChatActiveCb,
    addChatError,
    chatMessages,
    revealTarget,
    setRevealTarget,
  };

  return (
    <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
  );
}
