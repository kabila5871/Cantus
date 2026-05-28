// The single typed boundary to the Rust backend. Every privileged operation the
// frontend needs goes through a function here — never a raw `invoke` elsewhere.
import { invoke } from "@tauri-apps/api/core";

/** Mirrors the Rust `CommandError`; an Err rejects `invoke` with this shape. */
export interface CommandError {
  kind: "not_found" | "io";
  message: string;
}

export interface AppInfo {
  name: string;
  version: string;
}

export const appInfo = (): Promise<AppInfo> => invoke("app_info");

/** Open a local folder as the active project; resolves to its canonical path. */
export const openProject = (path: string): Promise<string> =>
  invoke("open_project", { path });

/** The active project's root path, or null if none is open. */
export const projectRoot = (): Promise<string | null> => invoke("project_root");
