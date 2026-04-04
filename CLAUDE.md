# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Run the agent locally (spins up a Vercel Sandbox, uploads agent/ files, runs agent/main.ts inside it)
pnpm bundle       # Re-bundle agent/ files into src/agent-bundle.ts (rarely needed — local dev reads agent/ directly)
```

No build step, no test suite. The project uses `tsx` to run TypeScript directly.

## Environment Variables

Required in `.env.local` for local dev, and as Vercel env vars in production:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API (haiku model) |
| `AGENTMAIL_API_KEY` | Agentmail inbox API |
| `AGENTMAIL_INBOX_ID` | The agent's email inbox ID |
| `OWNER_EMAIL` | Where reports and feedback emails come from/go to |
| `GITHUB_TOKEN` | (production only) Git push for self-edits |
| `GITHUB_REPO` | (production only) e.g. `owner/traumalis-sdr` |

## Architecture

This is an autonomous sales prospecting agent that runs daily inside a Vercel Sandbox.

### Execution paths

**Production** (`api/cron.ts`): Vercel cron fires at 08:00 UTC → creates a Vercel Sandbox → installs tsx → clones this repo via `GITHUB_TOKEN` → runs `agent/main.ts`. The cron handler responds immediately (fire-and-forget); the agent runs asynchronously inside the sandbox for up to 40 minutes.

**Local dev** (`index.ts`): Creates a Vercel Sandbox → uploads `agent/` directory files → runs `agent/main.ts`. Self-edits are skipped because there's no git repo inside the sandbox in this path.

### Agent phases (`agent/main.ts`)

The agent runs sequentially through four phases, each gated by `hasTimeFor(N)` (remaining minutes):

1. **FEEDBACK** — reads the owner's email inbox via Agentmail to find improvement instructions
2. **SELF_EDIT** — if feedback found, uses Claude to rewrite editable files and commits + pushes to GitHub
3. **RESEARCH** — runs Exa news searches → evaluates each result with Claude → enriches good results with contact info
4. **REPORT** — emails a summary of new prospects and any applied self-edits to the owner

### Self-improvement system

The agent can modify its own configuration files and push the changes to GitHub. This is intentional.

**Editable** (`agent/lib/git.ts:EDITABLE_FILES`):
- `agent/working-files/approach.md` — who to target, what counts as a prospect
- `agent/working-files/search-queries.md` — Exa search queries and evaluation signals
- `agent/prompts/evaluate-clinic.ts` — prompt for prospect evaluation
- `agent/prompts/extract-contacts.ts` — prompt for contact extraction
- `agent/prompts/interpret-feedback.ts` — prompt for parsing owner emails

**Protected** (`agent/lib/git.ts:PROTECTED_FILES`): core infrastructure (`main.ts`, all `lib/` files, `api/cron.ts`, `index.ts`, `vercel.json`, `package.json`, `soul.md`) — the agent cannot touch these.

### Key libraries

| File | Role |
|---|---|
| `agent/lib/claude.ts` | Raw fetch to Anthropic API (haiku model), token tracking, retry logic |
| `agent/lib/exa.ts` | Exa search API — `searchClinics`, `getPageContents`, `searchContacts` |
| `agent/lib/agentmail.ts` | Read inbox, send messages |
| `agent/lib/git.ts` | File read/write with protection enforcement, `commitAndPush` |
| `agent/lib/timer.ts` | `hasTimeFor(minutes)` — guards each phase against timeout |

### Persistent state

`agent/working-files/prospects-seen.json` — URLs already evaluated, persisted to GitHub after each run to prevent re-processing. This file grows over time and is the agent's memory of what it's already seen.
