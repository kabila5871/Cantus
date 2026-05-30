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
    | "planner";
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

export const openInNewWindow = (path: string): Promise<void> =>
  invoke("open_in_new_window", { path });

export const currentProject = (): Promise<Project | null> =>
  invoke("current_project");

export const readDir = (path: string): Promise<DirEntry[]> =>
  invoke("read_dir", { path });

export const readFile = (path: string): Promise<FileContent> =>
  invoke("read_file", { path });

export const writeFile = (path: string, content: string): Promise<FileEntry> =>
  invoke("write_file", { path, content });

export const createDir = (path: string): Promise<void> =>
  invoke("create_dir", { path });

export const createFile = (path: string): Promise<void> =>
  invoke("create_file", { path });

export const movePath = (from: string, to: string): Promise<void> =>
  invoke("move_path", { from, to });

export interface SearchHit {
  path: string;
  line: number;
  column: number;
  text: string;
}

export const searchInFiles = (query: string): Promise<SearchHit[]> =>
  invoke("search_in_files", { query });

export const listFiles = (): Promise<string[]> => invoke("list_files");

export const listenFsChanged = (
  cb: (change: FsChange) => void,
): Promise<UnlistenFn> => listen<FsChange>("fs://changed", (e) => cb(e.payload));

export interface SessionMeta {
  id: string;
  title: string;
  updated_at: number; // epoch milliseconds
  git_branch: string | null;
  message_count: number;
}

export interface AssetItem {
  name: string;
  description: string;
  scope: "user" | "project";
  path: string;
}

export interface ClaudeAssets {
  skills: AssetItem[];
  agents: AssetItem[];
  workflows: AssetItem[];
}

export const ptySpawn = (
  cols: number,
  rows: number,
  program?: string,
  args?: string[],
): Promise<SpawnedTerminal> => invoke("pty_spawn", { cols, rows, program, args });

export const listSessions = (): Promise<SessionMeta[]> => invoke("list_sessions");

export const deleteSession = (id: string): Promise<void> => invoke("delete_session", { id });

export const findRunSession = (goal: string): Promise<string | null> =>
  invoke("find_run_session", { goal });

export const listClaudeAssets = (): Promise<ClaudeAssets> => invoke("list_claude_assets");

export const deleteAsset = (path: string): Promise<void> => invoke("delete_asset", { path });

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

export interface Branch { name: string; is_current: boolean; is_remote: boolean }
export const gitBranches = (): Promise<Branch[]> => invoke("git_branches");
export const gitCheckout = (name: string): Promise<GitStatus> => invoke("git_checkout", { name });
export const gitCreateBranch = (name: string): Promise<GitStatus> => invoke("git_create_branch", { name });
export const gitDiscard = (paths: string[]): Promise<GitStatus> => invoke("git_discard", { paths });

export const gitStageHunk = (path: string, hunkIndex: number): Promise<GitStatus> => invoke("git_stage_hunk", { path, hunkIndex });
export const gitUnstageHunk = (path: string, hunkIndex: number): Promise<GitStatus> => invoke("git_unstage_hunk", { path, hunkIndex });
export const gitStageLines = (path: string, hunkIndex: number, lineIndices: number[]): Promise<GitStatus> => invoke("git_stage_lines", { path, hunkIndex, lineIndices });
export const gitUnstageLines = (path: string, hunkIndex: number, lineIndices: number[]): Promise<GitStatus> => invoke("git_unstage_lines", { path, hunkIndex, lineIndices });
export const gitDiscardHunk = (path: string, hunkIndex: number): Promise<GitStatus> => invoke("git_discard_hunk", { path, hunkIndex });
export const gitDiscardLines = (path: string, hunkIndex: number, lineIndices: number[]): Promise<GitStatus> => invoke("git_discard_lines", { path, hunkIndex, lineIndices });

// ── Orchestration seam ───────────────────────────────────────────────────────

export interface Orchestration {
  id: string;
  title: string;
  goal: string;
  tasks: string[];
  session_id: string | null;
  updated_at: number;
}

export const listOrchestrations = (): Promise<Orchestration[]> =>
  invoke("list_orchestrations");

export const saveOrchestration = (o: {
  id: string;
  title: string;
  goal: string;
  tasks: string[];
  session_id: string | null;
}): Promise<void> => invoke("save_orchestration", { o });

export const deleteOrchestration = (id: string): Promise<void> =>
  invoke("delete_orchestration", { id });

export const planTasks = (goal: string): Promise<string[]> =>
  invoke("plan_tasks", { goal });

// ── Capability memory (learned stats layered on the filesystem registry) ──────

export type CapabilityKind = "skill" | "agent";

export interface CapabilityStat {
  name: string;
  kind: CapabilityKind;
  uses: number;
  successes: number;
}

export const listCapabilityStats = (): Promise<CapabilityStat[]> =>
  invoke("list_capability_stats");

export const recordCapabilityUse = (
  name: string,
  kind: CapabilityKind,
  success: boolean,
): Promise<void> => invoke("record_capability_use", { name, kind, success });

export type GapStatus = "reuse" | "new";

export interface GapItem {
  name: string;
  kind: CapabilityKind;
  status: GapStatus;
  description: string;
}

export const gapCheck = (
  goal: string,
  tasks: string[],
  skills: string[],
  agents: string[],
): Promise<GapItem[]> => invoke("gap_check", { goal, tasks, skills, agents });

// ── Learned memory (distilled facts, relevance-retrieved via SQLite FTS5) ─────

export interface Memory {
  id: number;
  fact: string;
  task_type: string;
  capabilities: string[];
  retries: number;
  confidence: number;
  created_at: number; // epoch milliseconds
}

export const listMemories = (): Promise<Memory[]> => invoke("list_memories");

export const addMemory = (
  fact: string,
  taskType: string,
  capabilities: string[],
  confidence: number,
): Promise<Memory> => invoke("add_memory", { fact, taskType, capabilities, confidence });

export const updateMemory = (id: number, fact: string, confidence: number): Promise<void> =>
  invoke("update_memory", { id, fact, confidence });

export const deleteMemory = (id: number): Promise<void> => invoke("delete_memory", { id });

// Distill one durable lesson from a completed run's transcript, reconciled
// against existing memories. Returns the stored memory, or null if nothing durable.
export const distillMemory = (goal: string): Promise<Memory | null> =>
  invoke("distill_memory", { goal });

// ── IDE monitor ───────────────────────────────────────────────────────────────

export interface SystemStats {
  cpu_percent: number;
  mem_used_mb: number;
  mem_total_mb: number;
  app_cpu_percent: number;
  app_mem_mb: number;
  claude_count: number;
  claude_cpu_percent: number;
  claude_mem_mb: number;
}

export interface ClaudeTokens {
  total: number;
  today: number;
}

export const systemStats = (): Promise<SystemStats> => invoke("system_stats");

export const claudeTokenUsage = (): Promise<ClaudeTokens> => invoke("claude_token_usage");


