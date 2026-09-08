import {AgentId, agentById, nextRunStatus} from './crew';
import {ChatProvider, ProviderResult} from './provider';
import {Conversation, Event, Handoff, Message, Run} from './store';

export interface OrchestrationOptions { conversation: Conversation; prompt: string; agents: AgentId[]; provider: ChatProvider; signal?: AbortSignal; now?: () => number; uid?: () => string; }
export interface OrchestrationResult { conversation: Conversation; paused: boolean; }
const isAbort = (error: unknown) => error instanceof DOMException ? error.name === 'AbortError' : error instanceof Error && error.name === 'AbortError';
const workflowEvent = (id: string, type: Event['type'], text: string, createdAt: number, payload: Partial<Event> = {}): Event => ({id, type, text, createdAt, ...payload});
const cancelled = (run: Run, now: () => number, uid: () => string, current: Conversation, agent: AgentId): OrchestrationResult => {
  const runs = current.runs.some(item => item.id === run.id) ? current.runs.map(item => item.id === run.id ? {...item, status: 'cancelled' as const, finishedAt: now(), error: 'Run cancelled'} : item) : [...current.runs, {...run, status: 'cancelled' as const, finishedAt: now(), error: 'Run cancelled'}];
  return {conversation: {...current, runs, events: [...current.events, workflowEvent(uid(), 'cancelled', `${agentById(agent).name} was cancelled`, now(), {owner: agent, objective: run.task, approvalRequired: false})]}, paused: false};
};

export async function orchestrate({conversation, prompt, agents, provider, signal, now = Date.now, uid = () => crypto.randomUUID()}: OrchestrationOptions): Promise<OrchestrationResult> {
  let current = conversation;
  let previous: AgentId = 'breakwater';
  const structuredResults: Array<{agent: AgentId; result: ProviderResult}> = [];
  for (const agent of agents) {
    const run: Run = {id: uid(), agent, status: nextRunStatus('queued', 'start'), task: prompt, createdAt: now()};
    if (signal?.aborted) return cancelled(run, now, uid, current, agent);
    current = {...current, runs: [...current.runs, run], events: [...current.events, workflowEvent(uid(), 'working', `${agentById(agent).name} is working`, now(), {owner: agent, objective: prompt, runId: run.id, runStatus: run.status, approvalRequired: false})]};
    try {
      const context = structuredResults.length ? JSON.stringify(structuredResults) : '';
      const result = await provider.complete({prompt, agent, context});
      if (signal?.aborted) return cancelled(run, now, uid, current, agent);
      structuredResults.push({agent, result});
      const output: Message = {id: uid(), role: 'assistant', agent, content: result.result, createdAt: now(), evidence: result.evidence, uncertainties: result.uncertainties, blockers: result.blockers, proposedNextAction: result.proposedNextAction};
      const hasHandoff = agent !== previous;
      const handoffs: Handoff[] = hasHandoff ? [...current.handoffs, {id: uid(), runId: run.id, from: previous, to: agent, transition: 'handoff', context: JSON.stringify({agent, result}), createdAt: now()}] : current.handoffs;
      const waiting = Boolean(result.requiresApproval);
      const approval = waiting ? {id: uid(), runId: run.id, action: result.proposedNextAction, payload: JSON.stringify({prompt, agent, result}), status: 'pending' as const, createdAt: now()} : undefined;
      const handoffEvent = hasHandoff ? workflowEvent(uid(), 'handoff', `${agentById(previous).name} handed work to ${agentById(agent).name}`, now(), {owner: previous, objective: prompt, runId: run.id, runStatus: nextRunStatus(run.status, 'handoff'), from: previous, to: agent, approvalRequired: false}) : undefined;
      const lifecycleStatus = hasHandoff ? nextRunStatus(run.status, 'handoff') : run.status;
      const terminalStatus = waiting ? nextRunStatus(lifecycleStatus, 'approval') : nextRunStatus(lifecycleStatus, 'complete');
      current = {...current,
        runs: current.runs.map(item => item.id === run.id ? {...item, status: terminalStatus, finishedAt: waiting ? undefined : now(), output: result.result, evidence: result.evidence, uncertainties: result.uncertainties, blockers: result.blockers} : item),
        messages: [...current.messages, output], handoffs, approvals: approval ? [...current.approvals, approval] : current.approvals,
        events: [...current.events, ...(handoffEvent ? [handoffEvent] : []), workflowEvent(uid(), waiting ? 'waiting_for_approval' : 'completed', waiting ? `${agentById(agent).name} is waiting for approval` : `${agentById(agent).name} completed`, now(), {owner: agent, objective: prompt, runId: run.id, runStatus: terminalStatus, evidence: result.evidence, nextAction: result.proposedNextAction, approvalRequired: waiting})],
      };
      if (waiting) return {conversation: current, paused: true};
      previous = agent;
    } catch (error) {
      if (isAbort(error)) return cancelled(run, now, uid, current, agent);
      const message = error instanceof Error ? error.message : String(error);
      current = {...current, runs: current.runs.map(item => item.id === run.id ? {...item, status: nextRunStatus(item.status, 'fail'), finishedAt: now(), error: message} : item), events: [...current.events, workflowEvent(uid(), 'failed', `${agentById(agent).name} failed: ${message}`, now(), {owner: agent, objective: prompt, runId: run.id, runStatus: nextRunStatus(run.status, 'fail'), nextAction: 'Inspect the failure and retry locally', approvalRequired: false})]};
      return {conversation: current, paused: false};
    }
  }
  if (signal?.aborted || !structuredResults.length) return {conversation: current, paused: false};
  try {
    const synthesisRun: Run = {id: uid(), agent: 'breakwater', status: nextRunStatus('queued', 'start'), task: prompt, createdAt: now()};
    current = {...current, runs: [...current.runs, synthesisRun], events: [...current.events, workflowEvent(uid(), 'working', 'Breakwater is preparing the final synthesis', now(), {owner: 'breakwater', objective: prompt, runId: synthesisRun.id, runStatus: synthesisRun.status, approvalRequired: false})]};
    const context = JSON.stringify({prompt, completedSpecialists: structuredResults});
    const synthesis = await provider.complete({prompt: `Synthesize the completed specialist work for: ${prompt}`, agent: 'breakwater', context});
    if (signal?.aborted) return {conversation: {...current, events: [...current.events, workflowEvent(uid(), 'cancelled', 'Final synthesis was cancelled', now(), {owner: 'breakwater', objective: prompt})]}, paused: false};
    const message: Message = {id: uid(), role: 'assistant', agent: 'breakwater', content: `Final synthesis: ${synthesis.result}`, createdAt: now(), evidence: synthesis.evidence, uncertainties: synthesis.uncertainties, blockers: synthesis.blockers, proposedNextAction: synthesis.proposedNextAction};
    const waiting = Boolean(synthesis.requiresApproval);
    const approval = waiting ? {id: uid(), runId: synthesisRun.id, action: synthesis.proposedNextAction, payload: JSON.stringify({prompt, agent: 'breakwater', result: synthesis}), status: 'pending' as const, createdAt: now()} : undefined;
    const status = waiting ? nextRunStatus(synthesisRun.status, 'approval') : nextRunStatus(synthesisRun.status, 'complete');
    return {conversation: {...current, messages: [...current.messages, message], runs: current.runs.map(item => item.id === synthesisRun.id ? {...item, status, finishedAt: waiting ? undefined : now(), output: synthesis.result, evidence: synthesis.evidence, uncertainties: synthesis.uncertainties, blockers: synthesis.blockers} : item), approvals: approval ? [...current.approvals, approval] : current.approvals, events: [...current.events, workflowEvent(uid(), waiting ? 'waiting_for_approval' : 'completed', waiting ? 'Breakwater is waiting for approval' : 'Breakwater completed the final synthesis', now(), {owner: 'breakwater', objective: prompt, runId: synthesisRun.id, runStatus: status, evidence: synthesis.evidence, nextAction: synthesis.proposedNextAction, approvalRequired: waiting})]}, paused: waiting};
  } catch (error) {
    if (isAbort(error)) return {conversation: current, paused: false};
    const message = error instanceof Error ? error.message : String(error);
    return {conversation: {...current, events: [...current.events, workflowEvent(uid(), 'failed', `Breakwater synthesis failed: ${message}`, now(), {owner: 'breakwater', objective: prompt})]}, paused: false};
  }
}
