import { useEffect, useCallback, useState, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import {
  openProject,
  openInNewWindow,
  readDir,
  readFile,
  createDir,
  createFile,
  movePath,
  type DirEntry,
  type CommandError,
} from "./ipc";
import { useStore } from "./store";

interface FlatNode {
  entry: DirEntry;
  depth: number;
}

function flatten(
  root: string,
  cache: Map<string, DirEntry[]>,
  expanded: Set<string>,
): FlatNode[] {
  const nodes: FlatNode[] = [];
  function walk(dirPath: string, depth: number) {
    const entries = cache.get(dirPath) ?? [];
    for (const entry of entries) {
      nodes.push({ entry, depth });
      if (entry.is_dir && expanded.has(entry.path)) {
        walk(entry.path, depth + 1);
      }
    }
  }
  walk(root, 0);
  return nodes;
}

function parentDir(path: string): string {
  if (!path.includes("/")) return "";
  return path.split("/").slice(0, -1).join("/");
}

function basename(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function FolderIcon() {
  return (
    <svg className="ti" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.75 4c0-.55.45-1 1-1h3.1l1.4 1.5h6c.55 0 1 .45 1 1v6c0 .55-.45 1-1 1H2.75c-.55 0-1-.45-1-1V4Z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className="ti" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 2.25h4.5L12 5.75v8a.75.75 0 0 1-.75.75h-7.5A.75.75 0 0 1 3 13.75V3a.75.75 0 0 1 .75-.75Z" />
      <path d="M8.5 2.5V6h3.25" />
    </svg>
  );
}

function NewFileIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 2H4.25A1.25 1.25 0 0 0 3 3.25v9.5A1.25 1.25 0 0 0 4.25 14H8" />
      <path d="M8.5 2 12 5.5V8" />
      <path d="M12 10.5v4M10 12.5h4" />
    </svg>
  );
}

function NewFolderIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 4.5c0-.55.45-1 1-1h2.8l1.3 1.4H10" />
      <path d="M2 4.5V12c0 .55.45 1 1 1h5" />
      <path d="M13 4.9c.55 0 1 .45 1 1V8" />
      <path d="M12.5 10.5v4M10.5 12.5h4" />
    </svg>
  );
}

interface ContextMenu {
  x: number;
  y: number;
  node: FlatNode;
}

interface RenameState {
  path: string;
  name: string;
}

export function Explorer() {
  const store = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ kind: "file" | "dir"; parent: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const newInputRef = useRef<HTMLInputElement>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [renaming, setRenaming] = useState<RenameState | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null); // folder path or "" for root
  const [moveError, setMoveError] = useState<string | null>(null);
  // Pointer-based drag (HTML5 drop is suppressed by the window's native
  // dragDropEnabled, which we keep on for Finder→terminal file drops).
  const dragStartRef = useRef<{ path: string; x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const dropTargetRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);
  const dragLabelRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState(false);
  const openMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (!openMenuRef.current?.contains(e.target as Node)) setOpenMenu(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openMenu]);

  const rootKey = "";
  const nodes = store.project
    ? flatten(rootKey, store.dirCache, store.expandedDirs)
    : [];

  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 22,
    overscan: 10,
  });

  const loadDir = useCallback(
    async (dirPath: string) => {
      try {
        const entries = await readDir(dirPath);
        store.setDirCache(dirPath, entries);
        store.clearInvalidated(dirPath);
      } catch (e) {
        console.error("readDir failed", e);
      }
    },
    [store],
  );

  useEffect(() => {
    if (store.project) void loadDir(rootKey);
  }, [store.project, loadDir]);

  useEffect(() => {
    for (const p of store.invalidatedPaths) {
      void loadDir(p);
    }
  }, [store.invalidatedPaths, loadDir]);

  const handleOpenFolder = async () => {
    setOpenMenu(false);
    const selected = await dialogOpen({ directory: true, multiple: false });
    if (typeof selected !== "string") return;
    try {
      const project = await openProject(selected);
      store.setProject(project);
      store.setDirCache(rootKey, []);
    } catch (e) {
      const err = e as CommandError;
      console.error("open_project failed", err.kind, err.message);
    }
  };

  // Open a folder in a brand-new window with its own independent codebase.
  const handleOpenInNewWindow = async () => {
    setOpenMenu(false);
    const selected = await dialogOpen({ directory: true, multiple: false });
    if (typeof selected !== "string") return;
    try {
      await openInNewWindow(selected);
    } catch (e) {
      const err = e as CommandError;
      console.error("open_in_new_window failed", err.kind, err.message);
    }
  };

  const handleNodeClick = useCallback(
    async (node: FlatNode) => {
      setSelectedPath(node.entry.path);
      if (node.entry.is_dir) {
        store.toggleDir(node.entry.path);
        if (
          !store.expandedDirs.has(node.entry.path) &&
          !store.dirCache.has(node.entry.path)
        ) {
          await loadDir(node.entry.path);
        }
      } else if (store.buffers.has(node.entry.path)) {
        store.setActiveBuffer(node.entry.path);
      } else {
        try {
          const fc = await readFile(node.entry.path);
          store.openBuffer(node.entry.path, fc.content, fc.content_hash);
        } catch (e) {
          const err = e as CommandError;
          console.error("read_file failed", err.kind, err.message);
        }
      }
    },
    [store, loadDir],
  );

  // Derive parent for toolbar new-file/new-folder based on the current selection.
  // Folder selected → create inside it; file selected → create in its parent; nothing → root.
  const startCreate = (kind: "file" | "dir", explicitParent?: string) => {
    let parent = "";
    if (explicitParent !== undefined) {
      parent = explicitParent;
    } else if (selectedPath) {
      const node = nodes.find((n) => n.entry.path === selectedPath);
      parent = node?.entry.is_dir
        ? node.entry.path
        : parentDir(selectedPath);
    }
    setCreating({ kind, parent });
    setNewName("");
    setCreateError(null);
  };

  const cancelCreate = () => {
    setCreating(null);
    setNewName("");
    setCreateError(null);
  };

  const submitCreate = async () => {
    if (!creating) return;
    const name = newName.trim();
    if (!name) return cancelCreate();
    const rel = creating.parent ? `${creating.parent}/${name}` : name;
    try {
      if (creating.kind === "dir") await createDir(rel);
      else await createFile(rel);
    } catch (e) {
      setCreateError((e as CommandError).message);
      return;
    }
    if (creating.parent && !store.expandedDirs.has(creating.parent)) {
      store.toggleDir(creating.parent);
    }
    await loadDir(creating.parent);
    setSelectedPath(rel);
    if (creating.kind === "file") {
      try {
        const fc = await readFile(rel);
        store.openBuffer(rel, fc.content, fc.content_hash);
      } catch {
        /* best-effort */
      }
    } else {
      if (!store.expandedDirs.has(rel)) store.toggleDir(rel);
      await loadDir(rel);
    }
    cancelCreate();
  };

  useEffect(() => {
    if (creating) newInputRef.current?.focus();
  }, [creating]);

  // Context menu
  const openContextMenu = (e: React.MouseEvent, node: FlatNode) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedPath(node.entry.path);
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (!contextMenu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeContextMenu();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [contextMenu, closeContextMenu]);

  // Rename
  const startRename = (node: FlatNode) => {
    closeContextMenu();
    setRenaming({ path: node.entry.path, name: node.entry.name });
  };

  useEffect(() => {
    if (renaming) renameInputRef.current?.select();
  }, [renaming]);

  const submitRename = async () => {
    if (!renaming) return;
    const newBasename = renaming.name.trim();
    if (!newBasename || newBasename === basename(renaming.path)) {
      setRenaming(null);
      return;
    }
    const dir = parentDir(renaming.path);
    const to = dir ? `${dir}/${newBasename}` : newBasename;
    try {
      await movePath(renaming.path, to);
    } catch (e) {
      setMoveError((e as CommandError).message);
      setRenaming(null);
      return;
    }
    await loadDir(dir);
    // If the renamed file was open, close old path and open new one.
    if (store.buffers.has(renaming.path)) {
      const buf = store.buffers.get(renaming.path)!;
      store.closeBuffer(renaming.path);
      store.openBuffer(to, buf.content, buf.contentHash);
    }
    setSelectedPath(to);
    setRenaming(null);
  };

  // Move a file/dir into targetFolder ("" = root). Refreshes both ends and
  // remaps an open buffer if the moved file was being edited.
  const performMove = async (from: string, targetFolder: string) => {
    const to = targetFolder ? `${targetFolder}/${basename(from)}` : basename(from);
    // No-ops: already in that folder, onto itself, or into its own subtree.
    if (to === from || parentDir(from) === targetFolder || from === targetFolder) return;
    if (targetFolder === from || targetFolder.startsWith(from + "/")) return;

    try {
      await movePath(from, to);
    } catch (e) {
      setMoveError((e as CommandError).message);
      return;
    }

    await Promise.all([loadDir(parentDir(from)), loadDir(targetFolder)]);
    if (!store.expandedDirs.has(targetFolder)) store.toggleDir(targetFolder);
    setSelectedPath(to);

    if (store.buffers.has(from)) {
      const buf = store.buffers.get(from)!;
      store.closeBuffer(from);
      try {
        const fc = await readFile(to);
        store.openBuffer(to, fc.content, fc.content_hash);
      } catch {
        store.openBuffer(to, buf.content, buf.contentHash);
      }
    }
  };
  // The window listeners below are registered once; route through a ref so they
  // always call the latest performMove (which closes over fresh store state).
  const performMoveRef = useRef(performMove);
  performMoveRef.current = performMove;

  // Resolve the folder under the cursor: a folder row → that folder, a file row
  // → its parent, empty tree area → root. Returns null if outside the tree.
  const folderAtPoint = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y);
    const row = el?.closest("[data-node-path]") as HTMLElement | null;
    if (row) {
      const p = row.getAttribute("data-node-path") ?? "";
      return row.getAttribute("data-node-dir") === "1" ? p : parentDir(p);
    }
    if (el && containerRef.current?.contains(el)) return "";
    return null;
  };

  // Pointer-driven drag: start tracking on mousedown; promote to a drag past a
  // small threshold; drop on mouseup. (HTML5 dnd "drop" never fires here.)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      if (!draggingRef.current) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return;
        draggingRef.current = true;
        setDragPath(start.path);
      }
      if (dragLabelRef.current) {
        dragLabelRef.current.style.left = `${e.clientX + 12}px`;
        dragLabelRef.current.style.top = `${e.clientY + 10}px`;
      }
      const target = folderAtPoint(e.clientX, e.clientY);
      dropTargetRef.current = target;
      setDropTarget(target);
    };
    const onUp = () => {
      const start = dragStartRef.current;
      const dragged = draggingRef.current;
      const target = dropTargetRef.current;
      dragStartRef.current = null;
      draggingRef.current = false;
      dropTargetRef.current = null;
      setDragPath(null);
      setDropTarget(null);
      if (dragged && start && target !== null) {
        suppressClickRef.current = true; // the trailing click shouldn't open/select
        void performMoveRef.current(start.path, target);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-line react-hooks/exhaustive-deps -- handlers read refs/stable store
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard navigation
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (nodes.length === 0) return;
    const found = nodes.findIndex((n) => n.entry.path === selectedPath);
    const cur = found < 0 ? 0 : found;
    const node = nodes[cur];
    const move = (to: number) => {
      const i = Math.max(0, Math.min(to, nodes.length - 1));
      setSelectedPath(nodes[i].entry.path);
      virtualizer.scrollToIndex(i);
    };
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(cur + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(cur - 1);
        break;
      case "Enter":
        e.preventDefault();
        void handleNodeClick(node);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (node.entry.is_dir && !store.expandedDirs.has(node.entry.path)) {
          void handleNodeClick(node);
        } else {
          move(cur + 1);
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (node.entry.is_dir && store.expandedDirs.has(node.entry.path)) {
          store.toggleDir(node.entry.path);
        } else {
          move(cur - 1);
        }
        break;
    }
  };

  if (!store.project) {
    return (
      <div className="explorer explorer--empty">
        <button className="explorer__open-btn" onClick={handleOpenFolder}>
          Open Folder
        </button>
      </div>
    );
  }

  return (
    <div className="explorer">
      <div className="explorer__header">
        <span className="explorer__project-name">
          {store.project.root_path.split("/").at(-1)}
        </span>
        <button
          className="explorer__action"
          onClick={() => startCreate("file")}
          title="New File"
          aria-label="New File"
        >
          <NewFileIcon />
        </button>
        <button
          className="explorer__action"
          onClick={() => startCreate("dir")}
          title="New Folder"
          aria-label="New Folder"
        >
          <NewFolderIcon />
        </button>
        <div className="explorer__open-wrap" ref={openMenuRef}>
          <button
            className="explorer__open-btn explorer__open-btn--small"
            onClick={() => setOpenMenu((v) => !v)}
            title="Open a folder…"
            aria-haspopup="menu"
            aria-expanded={openMenu}
          >
            ···
          </button>
          {openMenu && (
            <div className="ctx-menu explorer__open-menu" role="menu">
              <button className="ctx-menu__item" onClick={() => void handleOpenFolder()}>
                Open Folder…
              </button>
              <button className="ctx-menu__item" onClick={() => void handleOpenInNewWindow()}>
                Open in New Window…
              </button>
            </div>
          )}
        </div>
      </div>

      {moveError && (
        <div className="explorer__error-row" onClick={() => setMoveError(null)}>
          {moveError}
        </div>
      )}

      {creating && (
        <div
          className="explorer__new-row"
          style={{ paddingLeft: 6 + (creating.parent ? (nodes.find((n) => n.entry.path === creating.parent)?.depth ?? 0) + 1 : 0) * 12 }}
        >
          <span className="explorer__new-breadcrumb">
            {creating.parent || "root"}
          </span>
          <span className="tree-node__icon">
            {creating.kind === "dir" ? <FolderIcon /> : <FileIcon />}
          </span>
          <input
            ref={newInputRef}
            className={`explorer__new-input${createError ? " explorer__new-input--error" : ""}`}
            value={newName}
            placeholder={creating.kind === "dir" ? "Folder name" : "File name"}
            title={createError ?? undefined}
            onChange={(e) => {
              setNewName(e.target.value);
              setCreateError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitCreate();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelCreate();
              }
            }}
            onBlur={cancelCreate}
          />
        </div>
      )}

      <div
        ref={containerRef}
        className="explorer__tree"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const node = nodes[vi.index];
            const isActive =
              !node.entry.is_dir && store.activeBufferPath === node.entry.path;
            const isSelected = selectedPath === node.entry.path;
            const isExpanded =
              node.entry.is_dir && store.expandedDirs.has(node.entry.path);
            const isDropTarget =
              node.entry.is_dir && dropTarget === node.entry.path;
            const isRenaming = renaming?.path === node.entry.path;

            return (
              <div
                key={node.entry.path}
                style={{
                  position: "absolute",
                  top: vi.start,
                  left: 0,
                  right: 0,
                  height: vi.size,
                  paddingLeft: 6 + node.depth * 12,
                }}
                className={`tree-node${isActive ? " tree-node--active" : ""}${isSelected ? " tree-node--selected" : ""}${isDropTarget ? " tree-node--drop-target" : ""}`}
                data-node-path={node.entry.path}
                data-node-dir={node.entry.is_dir ? "1" : "0"}
                onMouseDown={(e) => {
                  if (e.button !== 0 || isRenaming) return;
                  dragStartRef.current = { path: node.entry.path, x: e.clientX, y: e.clientY };
                }}
                onClick={() => {
                  if (suppressClickRef.current) { suppressClickRef.current = false; return; }
                  if (!isRenaming) void handleNodeClick(node);
                }}
                onContextMenu={(e) => openContextMenu(e, node)}
              >
                <span className="tree-node__chevron">
                  {node.entry.is_dir ? (isExpanded ? "▾" : "▸") : ""}
                </span>
                <span
                  className={`tree-node__icon tree-node__icon--${node.entry.is_dir ? "dir" : "file"}`}
                >
                  {node.entry.is_dir ? <FolderIcon /> : <FileIcon />}
                </span>
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    className="explorer__rename-input"
                    value={renaming.name}
                    onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); void submitRename(); }
                      else if (e.key === "Escape") { e.preventDefault(); setRenaming(null); }
                    }}
                    onBlur={() => void submitRename()}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="tree-node__name">{node.entry.name}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {contextMenu && (
        <div
          ref={menuRef}
          className="ctx-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.node.entry.is_dir && (
            <>
              <button
                className="ctx-menu__item"
                onMouseDown={(e) => {
                  e.preventDefault();
                  closeContextMenu();
                  startCreate("file", contextMenu.node.entry.path);
                }}
              >
                New File
              </button>
              <button
                className="ctx-menu__item"
                onMouseDown={(e) => {
                  e.preventDefault();
                  closeContextMenu();
                  startCreate("dir", contextMenu.node.entry.path);
                }}
              >
                New Folder
              </button>
            </>
          )}
          <button
            className="ctx-menu__item"
            onMouseDown={(e) => {
              e.preventDefault();
              startRename(contextMenu.node);
            }}
          >
            Rename
          </button>
        </div>
      )}

      {dragPath && (
        <div ref={dragLabelRef} className="explorer__drag-label">
          {basename(dragPath)}
        </div>
      )}
    </div>
  );
}
