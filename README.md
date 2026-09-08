# brzrk-crew

A local, inspectable Grok Bot-inspired chat workspace for a five-agent crew. The MVP is deliberately small: one responsive workspace, deterministic sequential orchestration, browser-local conversation history, structured handoffs, recoverable run statuses, and an approval boundary with no external side effects.

## Run

Requirements: Node 20+ and npm.

```sh
npm install
npm run dev
# open the URL Vite prints, normally http://localhost:5173
```

Verification commands:

```sh
npm test
npm run build
npm run preview
```

## Architecture

- `src/main.tsx` is the responsive UI shell and delegates work to the domain orchestrator.
- `src/domain/crew.ts` contains agent profiles, routing, lifecycle transitions, and approval transitions.
- `src/domain/orchestrator.ts` runs specialists sequentially, passes the prior structured result as handoff context, preserves evidence/uncertainties/next action, records failures/cancellation, and pauses on approval.
- `src/domain/store.ts` persists a collection of conversations, each with messages, runs, events, handoffs, and approvals in browser `localStorage`.
- `src/domain/provider.ts` defines the mock-first provider boundary. The provider is deterministic, local, and has no network or external side effects.

Breakwater routes to specialists and the UI presents the returned specialist work. Approval decisions resolve the linked waiting run locally; approval never performs the proposed action. A future provider adapter can replace the mock without changing the workspace domain.

## Agents

Breakwater (manager/orchestration), Reef (research/evidence), Swell (documentation/clarity), Tide (outreach/drafts), and Wake (review/verification). Use `@reef`, `@swell`, `@tide`, `@wake`, or `@breakwater` to route directly; simple keywords select a specialist and Breakwater is the default.

## Limitations

This is single-user browser-local mock mode. There is no authentication, multi-device sync, real provider streaming, tool execution, artifact storage, parallel delegation, or production database. Consequential actions remain simulated and explicitly side-effect-free.
