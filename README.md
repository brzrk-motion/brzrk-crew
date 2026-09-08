# brzrk-crew

A local, inspectable Grok Bot-inspired chat workspace for a five-agent crew. This MVP is deliberately small: one responsive workspace, deterministic orchestration, persisted browser state, and an approval boundary with no external side effects.

## Run

Requirements: Node 20+ (validated with Node 26) and npm.

```sh
npm install
npm run dev
# open the URL Vite prints, normally http://localhost:5173
```

Verification commands:

```sh
npm test       # Vitest domain tests
npm run build  # TypeScript project check and production build
npm run preview
```

## Architecture

- `src/main.tsx` is the thin UI/orchestration shell: left conversation rail, central timeline/composer, and crew/activity rail.
- `src/domain/crew.ts` contains fixed agent profiles, mention/keyword routing, the run status transition helper, and approval transition rules.
- `src/domain/store.ts` is the local persistence boundary. Conversations, messages, runs, events, handoffs, and approvals are serialized to browser `localStorage`; no media or external database is used.
- `src/domain/provider.ts` defines the `ChatProvider` adapter contract. `mockProvider` is deterministic and local. The future xAI integration point is replacing that implementation with an xAI Responses API adapter (and adding server-side secret handling plus streaming), without changing the workspace domain types.
- `src/test/domain.test.ts` covers explicit/keyword routing, handoff/completion status behavior, and the approval boundary.

The mock run is sequential: Breakwater routes to a specialist, each specialist returns a structured result, and later specialists receive an explicit persisted handoff record. Prompts containing publish/send/delete/spend/production produce a pending approval card. Approve/deny only updates local state and records an event; it never performs the proposed action.

## Agents

Breakwater (manager/orchestration), Reef (research/evidence), Swell (documentation/clarity), Tide (outreach/drafts), and Wake (review/verification). Use `@reef`, `@swell`, `@tide`, `@wake`, or `@breakwater` to route directly; otherwise simple keywords select a specialist and Breakwater is the default.

## Limitations and next steps

This is single-user, browser-local mock mode. There is no authentication, multi-device sync, real xAI streaming, tool execution, artifact storage, retry/cancel control, parallel delegation, or production database. Approval semantics are intentionally broad and simulated. The next safe increment is a server-side provider adapter with xAI credentials kept off the client, streamed events, and a narrow allowlisted tool/approval policy.
