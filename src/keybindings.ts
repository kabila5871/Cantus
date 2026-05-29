import { open } from "@tauri-apps/plugin-dialog";
import { openProject, writeFile, type CommandError } from "./ipc";
import type { AppStore } from "./store";

export function handleGlobalKeyDown(
  e: KeyboardEvent,
  store: AppStore,
  openPalette: () => void,
  focusChatInput: () => void,
  openQuickOpen: () => void,
): void {
  const meta = e.metaKey || e.ctrlKey;
  if (!meta) return;

  switch (e.key) {
    case "p": {
      e.preventDefault();
      openQuickOpen();
      break;
    }

    case "o": {
      e.preventDefault();
      void (async () => {
        const path = await open({ directory: true, multiple: false, title: "Open Project" });
        if (!path) return;
        const selected = Array.isArray(path) ? path[0] : path;
        if (!selected) return;
        try {
          const project = await openProject(selected);
          store.setProject(project);
        } catch (err) {
          store.addChatError(-1, `Open failed: ${(err as CommandError).message}`);
        }
      })();
      break;
    }

    case "s": {
      // Monaco intercepts Cmd+S inside the editor via addCommand; this handler
      // fires for saves triggered outside the editor focus (e.g., from a pane
      // that doesn't have the Monaco instance focused).
      e.preventDefault();
      void (async () => {
        const path = store.activeBufferPath;
        const buf = path ? store.buffers.get(path) : undefined;
        if (!path || !buf) return;
        try {
          const entry = await writeFile(path, buf.content);
          store.reconcileBuffer(path, entry.content_hash);
        } catch (err) {
          store.addChatError(-1, `Save failed: ${(err as CommandError).message}`);
        }
      })();
      break;
    }

    case "k": {
      e.preventDefault();
      openPalette();
      break;
    }

    case "1": {
      e.preventDefault();
      store.focusPane("explorer");
      break;
    }

    case "2": {
      e.preventDefault();
      store.focusPane("editor");
      break;
    }

    case "3": {
      e.preventDefault();
      store.focusPane("terminal");
      break;
    }

    case "4": {
      e.preventDefault();
      store.focusPane("chat");
      focusChatInput();
      break;
    }
  }
}
