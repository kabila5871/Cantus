import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface CommandError {
  kind:
    | "not_found"
    | "io"
    | "no_project"
    | "forbidden"
    | "db"
    | "pty"
    | "git"
    | "agent";
  message: string;
}

export type GitChange =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

export interface GitFileStatus {
  path: string;
  staged: GitChange | null;
  unstaged: GitChange | null;
}

export interface GitStatus {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  entries: GitFileStatus[];
}

export interface GitDiffLine {
  origin: "context" | "addition" | "deletion";
  content: string;
  old_lineno: number | null;
  new_lineno: number | null;
}

export interface GitHunk {
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  lines: GitDiffLine[];
}

export interface GitDiff {
  path: string;
  old_text: string;
  new_text: string;
  binary: boolean;
  hunks: GitHunk[];
}

export interface SpawnedTerminal {
  id: number;
}

export interface PtyOutput {
  id: number;
  data: string;
}

export interface PtyExit {
  id: number;
}

export interface AppInfo {
  name: string;
  version: string;
}

export interface Project {
  id: number;
  root_path: string;
}

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface FileContent {
  content: string;
  content_hash: string;
}

export interface FileEntry {
  path: string;
  content_hash: string;
  updated_at: string;
}

export interface FsChange {
  path: string;
  kind: "created" | "modified" | "removed";
  content_hash: string | null;
}

export const appInfo = (): Promise<AppInfo> => invoke("app_info");

export const openProject = (path: string): Promise<Project> =>
  invoke("open_project", { path });

export const currentProject = (): Promise<Project | null> =>
  invoke("current_project");

export const readDir = (path: string): Promise<DirEntry[]> =>
  invoke("read_dir", { path });

export const readFile = (path: string): Promise<FileContent> =>
  invoke("read_file", { path });

export const writeFile = (path: string, content: string): Promise<FileEntry> =>
  invoke("write_file", { path, content });

export const listenFsChanged = (
  cb: (change: FsChange) => void,
): Promise<UnlistenFn> => listen<FsChange>("fs://changed", (e) => cb(e.payload));

export const ptySpawn = (cols: number, rows: number): Promise<SpawnedTerminal> =>
  invoke("pty_spawn", { cols, rows });

export const ptyWrite = (id: number, data: string): Promise<void> =>
  invoke("pty_write", { id, data });

export const ptyResize = (id: number, cols: number, rows: number): Promise<void> =>
  invoke("pty_resize", { id, cols, rows });

export const ptyKill = (id: number): Promise<void> => invoke("pty_kill", { id });

export const listenPtyOutput = (
  cb: (o: PtyOutput) => void,
): Promise<UnlistenFn> => listen<PtyOutput>("pty://output", (e) => cb(e.payload));

export const listenPtyExit = (
  cb: (e: PtyExit) => void,
): Promise<UnlistenFn> => listen<PtyExit>("pty://exit", (e) => cb(e.payload));

export const gitStatus = (): Promise<GitStatus> => invoke("git_status");

export const gitStage = (paths: string[]): Promise<GitStatus> =>
  invoke("git_stage", { paths });

export const gitUnstage = (paths: string[]): Promise<GitStatus> =>
  invoke("git_unstage", { paths });

export const gitCommit = (message: string): Promise<GitStatus> =>
  invoke("git_commit", { message });

export const gitDiff = (path: string): Promise<GitDiff> =>
  invoke("git_diff", { path });

// ── Agent seam ────────────────────────────────────────────────────────────────

export interface Selection {
  start_line: number;
  start_col: number;
  end_line: number;
  end_col: number;
  text: string;
}

export interface RecentEdit {
  path: string;
  summary: string;
}

export interface EditorContext {
  active_path: string | null;
  selection: Selection | null;
  recent_edits: RecentEdit[];
}

export interface AgentStatus {
  state: "running" | "stopped";
  project_id: number | null;
}

export type AgentEvent =
  | { event: "delta"; run_id: number; text: string }
  | { event: "message"; run_id: number; role: string; text: string }
  | { event: "tool"; run_id: number; name: string; input: unknown }
  | { event: "result"; run_id: number; subtype: string; total_cost_usd: number; num_turns: number }
  | { event: "error"; run_id: number; message: string }
  | { event: "status"; state: "running" | "stopped" }
  | { event: "propose_edit"; run_id: number; edit_id: number; path: string; new_content: string };

export const agentStart = (): Promise<AgentStatus> => invoke("agent_start");

export const agentSend = (text: string, context: EditorContext): Promise<void> =>
  invoke("agent_send", { text, context });

export const agentResolveEdit = (
  editId: number,
  decision: "accepted" | "rejected",
): Promise<void> => invoke("agent_resolve_edit", { editId, decision });

export const agentStop = (): Promise<AgentStatus> => invoke("agent_stop");

export const agentStatus = (): Promise<AgentStatus> => invoke("agent_status");

export const listenAgentEvent = (
  cb: (e: AgentEvent) => void,
): Promise<UnlistenFn> =>
  listen<AgentEvent>("agent://event", (e) => cb(e.payload));
