import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";

let runId = 0;
// At most one in-flight proposal per run — keyed by edit_id, value is { resolve, reject }.
const pendingProposals = new Map();
let editIdCounter = 0;

function writeLine(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function buildContextPreamble(context) {
  if (!context) return "";
  const parts = [];
  if (context.active_path) parts.push(`Open file: ${context.active_path}`);
  if (context.selection) {
    const s = context.selection;
    parts.push(
      `Selection (L${s.start_line}:${s.start_col}–L${s.end_line}:${s.end_col}):\n${s.text}`
    );
  }
  if (context.recent_edits?.length) {
    parts.push(
      `Recently edited: ${context.recent_edits.map((e) => e.path).join(", ")}`
    );
  }
  return parts.length ? `[Editor context]\n${parts.join("\n")}\n\n` : "";
}

// Compute what the file will look like after the tool runs.
// Returns new_content string, or throws if the file can't be read or the old_string isn't found.
function computeNewContent(toolName, input) {
  const filePath = resolve(process.cwd(), input.path);
  const original = readFileSync(filePath, "utf8");
  if (toolName === "Write") {
    return input.content;
  }
  // Edit: replace first occurrence of old_string with new_string.
  const idx = original.indexOf(input.old_string);
  if (idx === -1) throw new Error(`old_string not found in ${input.path}`);
  return original.slice(0, idx) + input.new_string + original.slice(idx + input.old_string.length);
}

async function canUseTool(toolName, input) {
  if (toolName !== "Edit" && toolName !== "Write") {
    return { behavior: "allow" };
  }

  let newContent;
  try {
    newContent = computeNewContent(toolName, input);
  } catch (err) {
    return { behavior: "deny", message: `Cannot preview edit: ${err.message}` };
  }

  const editId = ++editIdCounter;
  const currentRunId = runId - 1; // runId was already incremented when the prompt started

  writeLine({
    run_id: currentRunId,
    type: "propose_edit",
    edit_id: editId,
    path: input.path,
    new_content: newContent,
  });

  // Wait for the frontend to resolve or reject via stdin.
  const decision = await new Promise((res, rej) => {
    pendingProposals.set(editId, { resolve: res, reject: rej });
  });

  pendingProposals.delete(editId);

  if (decision === "accepted") {
    return {
      behavior: "deny",
      message: `User accepted the edit. The file ${input.path} now reflects the change.`,
    };
  }
  return {
    behavior: "deny",
    message: `User rejected the edit to ${input.path}. No changes were written.`,
  };
}

async function runPrompt(text, context) {
  const currentRunId = runId++;
  const preamble = buildContextPreamble(context);
  const prompt = preamble + text;
  try {
    for await (const message of query({
      prompt,
      options: {
        cwd: process.cwd(),
        includePartialMessages: true,
        allowedTools: ["Read", "Glob", "Grep", "Edit", "Write"],
        canUseTool,
      },
    })) {
      writeLine({ run_id: currentRunId, ...message });
    }
  } catch (err) {
    writeLine({
      run_id: currentRunId,
      type: "error",
      message: String(err?.message ?? err),
    });
  }
}

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return;
  }

  if (parsed?.type === "prompt" && typeof parsed.text === "string") {
    runPrompt(parsed.text, parsed.context ?? null);
    return;
  }

  if (parsed?.type === "resolve_edit" && typeof parsed.edit_id === "number") {
    const pending = pendingProposals.get(parsed.edit_id);
    if (pending) pending.resolve(parsed.decision);
    return;
  }
});

rl.on("close", () => {});
