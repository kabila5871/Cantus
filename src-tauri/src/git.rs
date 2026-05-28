use crate::error::CommandError;
use git2::{DiffOptions, Repository, StatusOptions};
use serde::Serialize;
use std::path::Path;

// ── Serializable types ────────────────────────────────────────────────────────

#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum GitChange {
    Added,
    Modified,
    Deleted,
    Renamed,
    Untracked,
    Conflicted,
}

#[derive(Serialize)]
pub struct GitFileStatus {
    pub path: String,
    pub staged: Option<GitChange>,
    pub unstaged: Option<GitChange>,
}

#[derive(Serialize)]
pub struct GitStatus {
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    pub entries: Vec<GitFileStatus>,
}

#[derive(Serialize)]
pub struct GitDiffLine {
    pub origin: &'static str,
    pub content: String,
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
}

#[derive(Serialize)]
pub struct GitHunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<GitDiffLine>,
}

#[derive(Serialize)]
pub struct GitDiff {
    pub path: String,
    pub old_text: String,
    pub new_text: String,
    pub binary: bool,
    pub hunks: Vec<GitHunk>,
}

// ── Internal helpers ──────────────────────────────────────────────────────────

fn open(root: &Path) -> Result<Repository, CommandError> {
    Repository::open(root).map_err(Into::into)
}

fn to_forward_slash(p: &str) -> String {
    p.replace('\\', "/")
}

fn staged_change(s: git2::Status) -> Option<GitChange> {
    if s.contains(git2::Status::INDEX_NEW) {
        Some(GitChange::Added)
    } else if s.contains(git2::Status::INDEX_MODIFIED) {
        Some(GitChange::Modified)
    } else if s.contains(git2::Status::INDEX_DELETED) {
        Some(GitChange::Deleted)
    } else if s.contains(git2::Status::INDEX_RENAMED) {
        Some(GitChange::Renamed)
    } else {
        None
    }
}

fn unstaged_change(s: git2::Status) -> Option<GitChange> {
    if s.contains(git2::Status::CONFLICTED) {
        Some(GitChange::Conflicted)
    } else if s.contains(git2::Status::WT_NEW) {
        Some(GitChange::Untracked)
    } else if s.contains(git2::Status::WT_MODIFIED) {
        Some(GitChange::Modified)
    } else if s.contains(git2::Status::WT_DELETED) {
        Some(GitChange::Deleted)
    } else if s.contains(git2::Status::WT_RENAMED) {
        Some(GitChange::Renamed)
    } else {
        None
    }
}

fn compute_status(repo: &Repository) -> Result<GitStatus, CommandError> {
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true);

    let statuses = repo.statuses(Some(&mut opts))?;

    let entries = statuses
        .iter()
        .filter_map(|e| {
            let path = to_forward_slash(e.path()?);
            let s = e.status();
            let staged = staged_change(s);
            let unstaged = unstaged_change(s);
            if staged.is_none() && unstaged.is_none() {
                return None;
            }
            Some(GitFileStatus {
                path,
                staged,
                unstaged,
            })
        })
        .collect();

    let (branch, upstream, ahead, behind) = head_info(repo);

    Ok(GitStatus {
        branch,
        upstream,
        ahead,
        behind,
        entries,
    })
}

fn head_info(repo: &Repository) -> (Option<String>, Option<String>, usize, usize) {
    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => return (None, None, 0, 0),
    };

    let branch = if head.is_branch() {
        head.shorthand().map(str::to_owned)
    } else {
        None
    };

    let upstream_name = branch.as_deref().and_then(|b| {
        repo.find_branch(b, git2::BranchType::Local)
            .ok()
            .and_then(|br| br.upstream().ok())
            .and_then(|up| up.name().ok().flatten().map(str::to_owned))
    });

    let (ahead, behind) = upstream_name
        .as_deref()
        .and_then(|up| {
            let local_oid = head.target()?;
            let upstream_ref = repo.find_reference(up).ok()?;
            let upstream_oid = upstream_ref.target()?;
            repo.graph_ahead_behind(local_oid, upstream_oid).ok()
        })
        .unwrap_or((0, 0));

    (branch, upstream_name, ahead, behind)
}

// ── Public API ────────────────────────────────────────────────────────────────

pub fn status(root: &Path) -> Result<GitStatus, CommandError> {
    compute_status(&open(root)?)
}

pub fn stage(root: &Path, paths: &[String]) -> Result<GitStatus, CommandError> {
    let repo = open(root)?;
    if !paths.is_empty() {
        let mut index = repo.index()?;
        for rel in paths {
            let abs = root.join(rel);
            // Use a plain relative path for libgit2 index operations.
            let index_path = Path::new(rel);
            if abs.exists() {
                index.add_path(index_path)?;
            } else {
                // Stage the deletion.
                index.remove_path(index_path)?;
            }
        }
        index.write()?;
    }
    compute_status(&repo)
}

pub fn unstage(root: &Path, paths: &[String]) -> Result<GitStatus, CommandError> {
    let repo = open(root)?;
    if !paths.is_empty() {
        match repo.head().ok().and_then(|h| h.peel_to_commit().ok()) {
            Some(commit) => {
                let obj = commit.as_object();
                let index_paths: Vec<&Path> = paths.iter().map(|p| Path::new(p.as_str())).collect();
                repo.reset_default(Some(obj), index_paths)?;
            }
            None => {
                // Unborn branch — remove from index.
                let mut index = repo.index()?;
                for rel in paths {
                    let _ = index.remove_path(Path::new(rel));
                }
                index.write()?;
            }
        }
    }
    compute_status(&repo)
}

pub fn commit(root: &Path, message: &str) -> Result<GitStatus, CommandError> {
    let message = message.trim();
    if message.is_empty() {
        return Err(CommandError::Git("commit message is empty".into()));
    }

    let repo = open(root)?;
    let mut index = repo.index()?;
    index.read(false)?;

    // Verify something is staged.
    let has_staged = {
        let head_tree = repo
            .head()
            .ok()
            .and_then(|h| h.peel_to_commit().ok())
            .map(|c| c.tree())
            .transpose()?;
        let diff = match &head_tree {
            Some(tree) => repo.diff_tree_to_index(Some(tree), Some(&index), None)?,
            None => repo.diff_tree_to_index(None, Some(&index), None)?,
        };
        diff.deltas().len() > 0
    };

    if !has_staged {
        return Err(CommandError::Git("nothing staged to commit".into()));
    }

    let sig = repo.signature()?;
    let tree_oid = index.write_tree()?;
    let tree = repo.find_tree(tree_oid)?;

    let parent_commit = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    let parents: Vec<&git2::Commit<'_>> = parent_commit.iter().collect();

    repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)?;

    compute_status(&repo)
}

pub fn diff(root: &Path, path: &str) -> Result<GitDiff, CommandError> {
    let repo = open(root)?;
    let abs_path = root.join(path);
    let index_path = Path::new(path);

    let mut diff_opts = DiffOptions::new();
    diff_opts.pathspec(path);

    let diff = repo.diff_index_to_workdir(None, Some(&mut diff_opts))?;

    // Detect binary.
    let mut is_binary = false;
    for delta in diff.deltas() {
        if delta.new_file().is_binary() || delta.old_file().is_binary() {
            is_binary = true;
            break;
        }
    }

    if is_binary {
        return Ok(GitDiff {
            path: path.to_owned(),
            old_text: String::new(),
            new_text: String::new(),
            binary: true,
            hunks: vec![],
        });
    }

    // old_text: blob at index/HEAD.
    let old_text = {
        let mut index = repo.index()?;
        index.read(false)?;
        match index.get_path(index_path, 0) {
            Some(entry) => {
                let blob = repo.find_blob(entry.id)?;
                String::from_utf8_lossy(blob.content()).into_owned()
            }
            None => String::new(),
        }
    };

    // new_text: current worktree content.
    let new_text = if abs_path.exists() {
        std::fs::read_to_string(&abs_path).map_err(CommandError::from)?
    } else {
        String::new()
    };

    // `foreach` takes all closures simultaneously so they cannot share &mut state.
    // Use Cell for the hunk index (interior mutability, no aliased &mut).
    use std::cell::Cell;

    let hunk_idx = Cell::new(usize::MAX);

    struct RawHunk {
        old_start: u32,
        old_lines: u32,
        new_start: u32,
        new_lines: u32,
    }
    let mut raw_hunks: Vec<RawHunk> = Vec::new();
    let mut flat_lines: Vec<(usize, GitDiffLine)> = Vec::new();

    diff.foreach(
        &mut |_, _| true,
        None,
        Some(&mut |_, hunk| {
            let idx = raw_hunks.len();
            raw_hunks.push(RawHunk {
                old_start: hunk.old_start(),
                old_lines: hunk.old_lines(),
                new_start: hunk.new_start(),
                new_lines: hunk.new_lines(),
            });
            hunk_idx.set(idx);
            true
        }),
        Some(&mut |_, _, line| {
            let origin = match line.origin() {
                ' ' => "context",
                '+' => "addition",
                '-' => "deletion",
                _ => return true,
            };
            let idx = hunk_idx.get();
            if idx != usize::MAX {
                flat_lines.push((
                    idx,
                    GitDiffLine {
                        origin,
                        content: String::from_utf8_lossy(line.content()).into_owned(),
                        old_lineno: line.old_lineno(),
                        new_lineno: line.new_lineno(),
                    },
                ));
            }
            true
        }),
    )?;

    let mut hunks: Vec<GitHunk> = raw_hunks
        .into_iter()
        .map(|h| GitHunk {
            old_start: h.old_start,
            old_lines: h.old_lines,
            new_start: h.new_start,
            new_lines: h.new_lines,
            lines: Vec::new(),
        })
        .collect();

    for (idx, line) in flat_lines {
        hunks[idx].lines.push(line);
    }

    Ok(GitDiff {
        path: path.to_owned(),
        old_text,
        new_text,
        binary: false,
        hunks,
    })
}
