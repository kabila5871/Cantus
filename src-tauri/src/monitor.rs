use crate::error::CommandError;
use crate::state::AppState;
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, SystemTime};
use sysinfo::{ProcessesToUpdate, System};
use tauri::State;

// Persisted across calls so CPU% is a real delta between polls (a fresh System
// would always read 0%).
static SYS: LazyLock<Mutex<System>> = LazyLock::new(|| Mutex::new(System::new()));

#[derive(Serialize)]
pub struct SystemStats {
    pub cpu_percent: f32,
    pub mem_used_mb: u64,
    pub mem_total_mb: u64,
    pub app_cpu_percent: f32,
    pub app_mem_mb: u64,
    pub claude_count: u32,
    pub claude_cpu_percent: f32,
    pub claude_mem_mb: u64,
}

#[derive(Serialize)]
pub struct ClaudeTokens {
    pub total: u64,
    pub today: u64,
}

const MB: u64 = 1_048_576;

/// Cheap, poll this every couple of seconds: system + app CPU/memory and the
/// combined footprint of running `claude` processes.
#[tauri::command]
pub fn system_stats() -> SystemStats {
    let mut sys = SYS.lock().unwrap();
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let self_pid = sysinfo::get_current_pid().ok();
    let mut app_cpu_percent = 0.0;
    let mut app_mem_mb = 0;
    let mut claude_count = 0;
    let mut claude_cpu_percent = 0.0;
    let mut claude_mem_mb = 0;

    for (pid, proc) in sys.processes() {
        if Some(*pid) == self_pid {
            app_cpu_percent = proc.cpu_usage();
            app_mem_mb = proc.memory() / MB;
        }
        if proc
            .name()
            .to_string_lossy()
            .to_ascii_lowercase()
            .contains("claude")
        {
            claude_count += 1;
            claude_cpu_percent += proc.cpu_usage();
            claude_mem_mb += proc.memory() / MB;
        }
    }

    SystemStats {
        cpu_percent: sys.global_cpu_usage(),
        mem_used_mb: sys.used_memory() / MB,
        mem_total_mb: sys.total_memory() / MB,
        app_cpu_percent,
        app_mem_mb,
        claude_count,
        claude_cpu_percent,
        claude_mem_mb,
    }
}

/// Heavier — call on demand (e.g. when the monitor popover opens): input+output
/// tokens summed from this project's Claude transcripts, total and last 24h.
#[tauri::command]
pub fn claude_token_usage(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<ClaudeTokens, CommandError> {
    let root_str = match state.open.lock().unwrap().get(window.label()) {
        Some(p) => p.root.to_string_lossy().into_owned(),
        None => return Ok(ClaudeTokens { total: 0, today: 0 }),
    };
    let home = std::env::var("HOME").unwrap_or_default();
    let encoded = root_str.replace(['/', '.'], "-");
    let dir = PathBuf::from(&home)
        .join(".claude")
        .join("projects")
        .join(&encoded);
    let rd = match std::fs::read_dir(&dir) {
        Ok(r) => r,
        Err(_) => return Ok(ClaudeTokens { total: 0, today: 0 }),
    };
    let day_ago = SystemTime::now().checked_sub(Duration::from_secs(86_400));

    let mut total = 0u64;
    let mut today = 0u64;
    for entry in rd.filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let recent = match (
            entry.metadata().ok().and_then(|m| m.modified().ok()),
            day_ago,
        ) {
            (Some(m), Some(d)) => m >= d,
            _ => false,
        };
        let f = match std::fs::File::open(&path) {
            Ok(f) => f,
            Err(_) => continue,
        };
        let mut file_tokens = 0u64;
        for line in BufReader::new(f).lines().map_while(Result::ok) {
            if !line.contains("\"usage\"") {
                continue;
            }
            file_tokens += sum_field(&line, "input_tokens") + sum_field(&line, "output_tokens");
        }
        total += file_tokens;
        if recent {
            today += file_tokens;
        }
    }
    Ok(ClaudeTokens { total, today })
}

/// Sum every `"key": <int>` occurrence on a line.
fn sum_field(line: &str, key: &str) -> u64 {
    let needle = format!("\"{key}\":");
    let mut total = 0u64;
    let mut rest = line;
    while let Some(pos) = rest.find(&needle) {
        let after = &rest[pos + needle.len()..];
        let digits: String = after
            .trim_start()
            .chars()
            .take_while(char::is_ascii_digit)
            .collect();
        if let Ok(n) = digits.parse::<u64>() {
            total += n;
        }
        rest = after;
    }
    total
}
