export const meta = {
  name: 'build-feature',
  description: 'Implement one Cantus MVP feature end-to-end: plan the IPC contract, build backend + frontend (+ agent seam) in parallel, then review before landing.',
  whenToUse: 'When implementing a single Phase-1 feature that spans the Tauri IPC boundary (e.g. git status/stage/commit, PTY terminal, agent edit→diff, SQLite persistence). Pass the feature description as args.',
  phases: [
    { title: 'Design', detail: 'Architect the IPC contract and split the work across layers' },
    { title: 'Implement', detail: 'Backend, frontend, and agent-seam in parallel' },
    { title: 'Review', detail: 'cantus-reviewer checks correctness, IPC contract, scope, security' },
  ],
}

const feature = typeof args === 'string' ? args : (args?.feature ?? args?.description)
if (!feature) {
  log('No feature provided. Pass the feature description as args, e.g. "git stage + commit with inline diff".')
  return { error: 'missing feature description' }
}

const CONTRACT_SCHEMA = {
  type: 'object',
  required: ['summary', 'commands', 'events', 'tasks'],
  properties: {
    summary: { type: 'string' },
    commands: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'args', 'returns', 'errors'],
        properties: {
          name: { type: 'string' },
          args: { type: 'string' },
          returns: { type: 'string' },
          errors: { type: 'string' },
        },
      },
    },
    events: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'payload'],
        properties: { name: { type: 'string' }, payload: { type: 'string' } },
      },
    },
    tasks: {
      type: 'object',
      required: ['backend', 'frontend', 'agentSeam'],
      properties: {
        backend: { type: 'string' },
        frontend: { type: 'string' },
        agentSeam: { type: 'string', description: 'empty string if the feature does not touch the agent seam' },
      },
    },
  },
}

// 1. DESIGN — one architect defines the IPC contract and the per-layer task split.
phase('Design')
const contract = await agent(
  `You are architecting ONE feature for the Cantus IDE: "${feature}".
Read .claude/skills/cantus-architecture/SKILL.md and .claude/skills/tauri-ipc-command/SKILL.md and prd.md first.
Define the IPC contract end-to-end: the typed Tauri command(s) (name, args, return type, error variants),
any backend→frontend streaming events, and a crisp task description for each of the three implementation
agents (backend / frontend / agent-seam). Keep it Phase-1 MVP scope only — no RAG, no Phase 2/3 features.
If the feature does not touch the Claude Agent SDK seam, set tasks.agentSeam to an empty string.`,
  { label: 'design:ipc-contract', phase: 'Design', schema: CONTRACT_SCHEMA },
)

const contractBrief = `Agreed IPC contract for "${feature}":
${JSON.stringify({ commands: contract.commands, events: contract.events }, null, 2)}
Honor these signatures exactly — both sides must agree.`

const DOCTRINE =
  'Follow the clean-code doctrine (cantus-architecture → Clean-code doctrine): less code, fewer comments, ' +
  'targeted diff, no legacy/back-compat fallbacks, no dead or speculative code. Do not hand-format — the format hook handles it.'

// 2. IMPLEMENT — backend, frontend, and (if needed) agent-seam build in parallel against the shared contract.
phase('Implement')
const buildThunks = [
  () =>
    agent(
      `${contractBrief}\n\nYour task (Rust/Tauri backend): ${contract.tasks.backend}\n` +
        `Implement the command handlers, typed errors, registration in generate_handler!, and any PTY/git/SQLite work. cargo clippy clean.\n${DOCTRINE}`,
      { label: 'impl:backend', phase: 'Implement', agentType: 'rust-tauri-backend' },
    ),
  () =>
    agent(
      `${contractBrief}\n\nYour task (TypeScript/React frontend): ${contract.tasks.frontend}\n` +
        `Add the typed IPC bindings (single module), wire the UI/shared state, and handle each error variant. tsc --noEmit clean.\n${DOCTRINE}`,
      { label: 'impl:frontend', phase: 'Implement', agentType: 'react-frontend' },
    ),
]
if (contract.tasks.agentSeam && contract.tasks.agentSeam.trim()) {
  buildThunks.push(() =>
    agent(
      `${contractBrief}\n\nYour task (Claude Agent SDK seam): ${contract.tasks.agentSeam}\n` +
        `Honor the contract; coordinate edit→diff payloads with the frontend shape above.\n${DOCTRINE}`,
      { label: 'impl:agent-seam', phase: 'Implement', agentType: 'agent-sdk-bridge' },
    ),
  )
}
const built = (await parallel(buildThunks)).filter(Boolean)

// 3. REVIEW — adversarial check before landing.
phase('Review')
const REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict', 'blockers', 'findings'],
  properties: {
    verdict: { type: 'string', enum: ['safe-to-land', 'has-blockers'] },
    blockers: { type: 'array', items: { type: 'string' } },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'location', 'problem', 'fix'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'should-fix', 'nit'] },
          location: { type: 'string' },
          problem: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
  },
}
const review = await agent(
  `Review the working-tree changes implementing "${feature}".\n${contractBrief}\n` +
    `Verify the IPC contract holds on BOTH sides, errors are typed/handled, state stays backend-authoritative, ` +
    `local-first/security invariants hold, nothing strays out of Phase-1 scope, and the clean-code doctrine is met ` +
    `(less code, fewer comments, targeted diff, no legacy/back-compat fallbacks, no dead or speculative code).`,
  { label: 'review', phase: 'Review', schema: REVIEW_SCHEMA, agentType: 'cantus-reviewer' },
)

return {
  feature,
  contract,
  implemented: built.length,
  agentSeamTouched: Boolean(contract.tasks.agentSeam && contract.tasks.agentSeam.trim()),
  review,
}
