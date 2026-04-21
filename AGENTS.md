# AGENTS.md

High-signal context for OpenCode sessions in this repo.

## Commands

```bash
pnpm dev          # Local dev: spins up Vercel Sandbox, uploads agent/ files, runs agent/main.ts
pnpm bundle       # Re-bundles agent/ files into src/agent-bundle.ts (rarely needed)
```

No build step, no test suite, no linter. The project runs TypeScript directly via `tsx`.

## Architecture

Autonomous sales-prospecting agent for Traumalis. Runs daily inside a Vercel Sandbox.

**Execution paths**
- **Production** — `api/cron.ts`: Vercel cron at 08:00 UTC creates a sandbox, clones the repo via `GITHUB_TOKEN`, installs `tsx`, and runs `agent/main.ts` (fire-and-forget, up to 40 min).
- **Local dev** — `index.ts`: creates a sandbox, uploads `agent/` files directly, runs `agent/main.ts`. Git commits are skipped because there is no repo inside the sandbox.

**Agent phases** (`agent/main.ts`), each gated by `hasTimeFor(minutes)`:
1. **FEEDBACK** — reads owner's email inbox (Agentmail) for improvement instructions.
2. **SELF_EDIT** — if feedback found, uses Claude to rewrite editable files and commits + pushes to GitHub.
3. **RESEARCH** — runs Exa news searches, evaluates results with Claude, enriches good results with contact info.
4. **REPORT** — emails a summary of new prospects and any applied self-edits to the owner.

**Safety constraint**: the agent may **only** send emails to `OWNER_EMAIL`. This is hard-coded in `agent/lib/agentmail.ts` and enforced at runtime.

## Self-Improvement System

The agent intentionally modifies its own configuration files and commits changes to GitHub.

- **Editable** (`agent/lib/git.ts:EDITABLE_FILES`) — `agent/working-files/approach.md`, `agent/working-files/search-queries.md`, `agent/prompts/evaluate-clinic.ts`, `agent/prompts/extract-contacts.ts`, `agent/prompts/interpret-feedback.ts`.
- **Protected** (`agent/lib/git.ts:PROTECTED_FILES`) — core infrastructure (`main.ts`, all `lib/` files, `api/cron.ts`, `index.ts`, `vercel.json`, `package.json`, `soul.md`). The agent cannot touch these.

## Environment Variables

Required in `.env.local` for local dev, and as Vercel env vars in production:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API |
| `AGENTMAIL_API_KEY` | Agentmail inbox API |
| `AGENTMAIL_INBOX_ID` | The agent's email inbox ID |
| `OWNER_EMAIL` | Where reports and feedback emails come from/go to |
| `GITHUB_TOKEN` | (production only) Git push for self-edits |
| `GITHUB_REPO` | (production only) e.g. `owner/traumalis-sdr` |
| `EXA_API_KEY` | Exa search API |

## TypeScript & Module Conventions

- ESM (`"type": "module"`), `NodeNext` module resolution.
- All imports use `.js` extensions even for `.ts` source files (NodeNext requirement).
- `tsx` is used for direct execution; no compiled `dist/` output is committed.

## Key Files

| File | Role |
|---|---|
| `agent/main.ts` | Orchestrates the four agent phases |
| `agent/lib/claude.ts` | Raw Anthropic API fetch (model: `claude-sonnet-4-6`), token tracking, retry logic |
| `agent/lib/exa.ts` | Exa search API — `searchClinics`, `getPageContents`, `searchContacts` |
| `agent/lib/agentmail.ts` | Read inbox, send messages (owner-only safety gate) |
| `agent/lib/git.ts` | File read/write with protection enforcement, `commitAndPush` |
| `agent/lib/timer.ts` | `hasTimeFor(minutes)` — guards each phase against the 40-minute sandbox timeout |
| `agent/lib/logger.ts` | Structured JSON logging to stdout; controlled by `LOG_LEVEL` env var |
| `agent/soul.md` | Mission and voice guidelines for the agent (protected) |

## Persistent State

`agent/working-files/prospects-seen.json` — URLs already evaluated, persisted to GitHub after each run to prevent re-processing. This file grows over time and is the agent's memory of what it's already seen.

## Additional Instruction Files

- `CLAUDE.md` — exists in repo root with overlapping guidance; prefer this file for OpenCode sessions.
