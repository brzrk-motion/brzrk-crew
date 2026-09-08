# brzrk-crew MVP architecture brief

## Goal
Build an inspectable Grok Bot-inspired local chat workspace for James and five named specialist agents: Breakwater, Reef, Swell, Tide, and Wake.

## MVP vertical slice
- Single-user local web app
- Persistent conversations and messages
- Manager-led routing with explicit `@agent` selection
- Five fixed agent profiles
- Sequential handoffs visible in the transcript
- Status events: queued, working, waiting_for_input, waiting_for_approval, handing_off, completed, failed, cancelled
- Approval cards for consequential actions, with no real external side effects in the first slice
- Mock provider mode for deterministic local testing
- Provider adapter boundary for future xAI Responses API integration

## Product rules
- Breakwater owns the user task and final synthesis.
- Specialists return structured results: result, evidence, uncertainties, proposed next action, blockers.
- Handoffs are explicit records, not hidden prompt concatenation.
- Local persistence is the source of truth; large files remain outside SQLite.
- Keep tools allowlisted and workspace-scoped.
- Do not claim progress without a persisted event.

## Future direction
Add real xAI streaming, workspace artifacts, retry/cancel, agent editing, narrow approval rules, parallel join points, cost accounting, and durable routines only after the vertical slice is sound.
