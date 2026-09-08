import {describe, expect, it} from 'vitest';
import {approvalTransition, nextRunStatus, routeMessage} from '../domain/crew';
import {orchestrate} from '../domain/orchestrator';
import {newConversation, initialState, loadState, resolveApproval, saveState} from '../domain/store';
import {ChatProvider, ProviderResult} from '../domain/provider';

const result = (agent: string, context: string): ProviderResult => ({result: `${agent}:${context}`, evidence: ['evidence'], uncertainties: ['unknown'], blockers: ['blocker'], proposedNextAction: 'continue'});
const provider: ChatProvider = {complete: async ({agent, context}) => result(agent, context)};

describe('routing and lifecycle', () => {
  it('honors explicit mentions and keywords', () => { expect(routeMessage('Ask @reef and @wake to check this')).toEqual(['reef', 'wake']); expect(routeMessage('find sources for this')).toEqual(['reef']); });
  it('enforces lifecycle transitions', () => { expect(nextRunStatus('queued', 'start')).toBe('working'); expect(nextRunStatus('working', 'handoff')).toBe('handing_off'); expect(nextRunStatus('handing_off', 'complete')).toBe('completed'); expect(nextRunStatus('working', 'fail')).toBe('failed'); });
});

describe('orchestration', () => {
  it('passes every completed structured result to final synthesis and persists blockers', async () => {
    const resultCalls: Array<{agent: string; context: string}> = [];
    const response = await orchestrate({conversation: newConversation(), prompt: 'research', agents: ['reef', 'wake'], provider: {complete: async ({agent, context}) => { resultCalls.push({agent, context}); return result(agent, context); }}});
    expect(resultCalls[2].agent).toBe('breakwater'); expect(resultCalls[2].context).toContain('reef'); expect(resultCalls[2].context).toContain('wake');
    expect(response.conversation.messages[0].blockers).toEqual(['blocker']); expect(response.conversation.runs[0].blockers).toEqual(['blocker']); expect(response.conversation.handoffs[0].transition).toBe('handoff');
    expect(response.conversation.events.map(event => event.type)).toEqual(['working', 'handoff', 'completed', 'working', 'handoff', 'completed', 'working', 'completed']);
    expect(response.conversation.events[1]).toMatchObject({runId: response.conversation.runs[0].id, runStatus: 'handing_off', from: 'breakwater', to: 'reef'});
    expect(response.conversation.events[4]).toMatchObject({runId: response.conversation.runs[1].id, runStatus: 'handing_off', from: 'reef', to: 'wake'});
  });
  it('pauses on approval with a typed approval event', async () => {
    const response = await orchestrate({conversation: newConversation(), prompt: 'publish this', agents: ['tide'], provider: {...provider, complete: async () => ({...result('tide', ''), requiresApproval: true})}});
    expect(response.paused).toBe(true); expect(response.conversation.approvals[0].runId).toBe(response.conversation.runs[0].id); expect(response.conversation.runs[0].status).toBe('waiting_for_approval'); expect(response.conversation.events.at(-1)?.approvalRequired).toBe(true);
  });
  it('pauses final synthesis behind a persisted approval boundary', async () => {
    const response = await orchestrate({conversation: newConversation(), prompt: 'synthesize this', agents: ['tide'], provider: {complete: async ({agent}) => ({...result(agent, ''), requiresApproval: agent === 'breakwater'})}});
    const approval = response.conversation.approvals[0]; const synthesisRun = response.conversation.runs.find(run => run.agent === 'breakwater');
    expect(response.paused).toBe(true); expect(approval).toMatchObject({runId: synthesisRun?.id, status: 'pending'}); expect(synthesisRun?.status).toBe('waiting_for_approval');
    expect(response.conversation.events.at(-1)).toMatchObject({type: 'waiting_for_approval', runId: synthesisRun?.id, runStatus: 'waiting_for_approval', approvalRequired: true});
    const approved = resolveApproval(response.conversation, approval.id, 'approve');
    expect(approved.approvals[0].status).toBe('approved'); expect(approved.runs.find(run => run.id === synthesisRun?.id)?.status).toBe('completed'); expect(approved.events.at(-1)).toMatchObject({type: 'approved', runId: synthesisRun?.id, runStatus: 'completed'});
    const denied = resolveApproval(response.conversation, approval.id, 'deny');
    expect(denied.approvals[0].status).toBe('denied'); expect(denied.runs.find(run => run.id === synthesisRun?.id)?.status).toBe('cancelled'); expect(denied.events.at(-1)).toMatchObject({type: 'denied', runId: synthesisRun?.id, runStatus: 'cancelled'});
  });

  it('marks synthesis provider failure as a terminal failed run with retry metadata', async () => {
    const response = await orchestrate({conversation: newConversation(), prompt: 'synthesize failure', agents: ['tide'], provider: {complete: async ({agent, context}) => { if (agent === 'breakwater') throw new Error('synthesis offline'); return result(agent, context); }}});
    const synthesisRun = response.conversation.runs.find(run => run.agent === 'breakwater');
    expect(synthesisRun).toMatchObject({status: 'failed', error: 'synthesis offline'}); expect(synthesisRun?.finishedAt).toBeTypeOf('number');
    expect(response.conversation.events.at(-1)).toMatchObject({type: 'failed', runId: synthesisRun?.id, runStatus: 'failed', error: 'synthesis offline', nextAction: 'Retry the final synthesis'});
  });
  it('marks synthesis cancellation during execution as a terminal cancelled run', async () => {
    const controller = new AbortController();
    const response = await orchestrate({conversation: newConversation(), prompt: 'cancel synthesis', agents: ['tide'], provider: {complete: async ({agent, context}) => { if (agent === 'breakwater') { controller.abort(); return result(agent, context); } return result(agent, context); }}, signal: controller.signal});
    const synthesisRun = response.conversation.runs.find(run => run.agent === 'breakwater');
    expect(synthesisRun).toMatchObject({status: 'cancelled', error: 'Run cancelled'}); expect(synthesisRun?.finishedAt).toBeTypeOf('number');
    expect(response.conversation.events.at(-1)).toMatchObject({type: 'cancelled', runId: synthesisRun?.id, runStatus: 'cancelled', nextAction: 'Retry the run when ready'});
  });
  it('records failure after partial success', async () => {
    const response = await orchestrate({conversation: newConversation(), prompt: 'partial', agents: ['reef', 'wake'], provider: {complete: async ({agent, context}) => { if (agent === 'wake') throw new Error('offline'); return result(agent, context); }}});
    expect(response.conversation.runs[0].status).toBe('completed'); expect(response.conversation.runs[1].status).toBe('failed'); expect(response.conversation.events.at(-1)?.type).toBe('failed');
  });
  it('cancels before and during a provider call without leaving an active run', async () => {
    const before = new AbortController(); before.abort(); const first = await orchestrate({conversation: newConversation(), prompt: 'cancel', agents: ['reef'], provider, signal: before.signal}); expect(first.conversation.runs[0].status).toBe('cancelled');
    const during = new AbortController(); const second = await orchestrate({conversation: newConversation(), prompt: 'cancel', agents: ['reef'], provider: {complete: async () => { during.abort(); return result('reef', ''); }}, signal: during.signal}); expect(second.conversation.runs[0].status).toBe('cancelled');
  });
});

describe('approval boundary', () => {
  it('is idempotent and does not mutate decided actions', () => { const p = {id: '1', runId: 'r', action: 'Publish draft', payload: '{}', status: 'pending' as const, createdAt: 0}; expect(approvalTransition(p, 'approve').status).toBe('approved'); expect(approvalTransition({...p, status: 'denied'}, 'approve').status).toBe('denied'); });
  it('closes approved and denied workflows with a final manager message', () => {
    const conversation = newConversation(); const base = {...conversation, runs: [{id: 'run-1', agent: 'tide' as const, status: 'waiting_for_approval' as const, task: 'publish', createdAt: 0}], approvals: [{id: 'approval-1', runId: 'run-1', action: 'Publish', payload: '{}', status: 'pending' as const, createdAt: 0}]};
    const approved = resolveApproval(base, 'approval-1', 'approve'); expect(approved.approvals[0].status).toBe('approved'); expect(approved.runs[0].status).toBe('completed'); expect(approved.messages.at(-1)?.agent).toBe('breakwater'); expect(resolveApproval(approved, 'approval-1', 'deny')).toBe(approved);
    const denied = resolveApproval(base, 'approval-1', 'deny'); expect(denied.runs[0].status).toBe('cancelled'); expect(denied.messages.at(-1)?.blockers).toEqual(['Manager approval was denied.']);
  });
});

describe('conversation storage shape', () => { it('starts with independent conversation collections', () => { const state = initialState(); const second = newConversation('Second task'); expect(state.conversations).toHaveLength(1); expect(second.id).not.toBe(state.activeConversationId); expect(second.messages).toEqual([]); }); it('round trips persisted structured records', () => { localStorage.clear(); const conversation = newConversation('Persisted'); conversation.messages.push({id: 'message-1', role: 'assistant', agent: 'reef', content: 'done', createdAt: 1, blockers: ['blocked']}); conversation.runs.push({id: 'run-1', agent: 'reef', status: 'completed', task: 'task', createdAt: 1, blockers: ['blocked']}); const state = {activeConversationId: conversation.id, conversations: [conversation]}; saveState(state); expect(loadState()).toEqual(state); }); });
