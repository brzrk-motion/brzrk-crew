import {AgentId, Approval, approvalTransition, RunStatus} from './crew';

export interface Message {
  id: string; role: 'user' | 'assistant' | 'system'; agent?: AgentId; content: string; createdAt: number;
  evidence?: string[]; uncertainties?: string[]; blockers?: string[]; proposedNextAction?: string;
}
export interface Run {
  id: string; agent: AgentId; status: RunStatus; task: string; createdAt: number; finishedAt?: number;
  error?: string; output?: string; evidence?: string[]; uncertainties?: string[]; blockers?: string[];
}
export interface Handoff {
  id: string; runId?: string; from: AgentId; to: AgentId; transition: 'handoff'; context: string; createdAt: number;
}
export type WorkflowEventType = 'assigned' | 'working' | 'handoff' | 'waiting_for_approval' | 'approved' | 'denied' | 'completed' | 'failed' | 'cancelled';
export interface EventPayload {
  owner?: AgentId; objective?: string; evidence?: string[]; nextAction?: string; approvalRequired?: boolean;
}
export interface Event extends EventPayload { id: string; type: WorkflowEventType; text: string; createdAt: number; }
export interface Conversation { id: string; title: string; messages: Message[]; runs: Run[]; events: Event[]; handoffs: Handoff[]; approvals: Approval[]; createdAt: number; updatedAt: number; }
export interface WorkspaceState { activeConversationId: string; conversations: Conversation[]; }

const key = 'brzrk-crew-state';
export const newConversation = (title = 'Untitled workspace'): Conversation => {
  const time = Date.now();
  return {id: crypto.randomUUID(), title, messages: [], runs: [], events: [], handoffs: [], approvals: [], createdAt: time, updatedAt: time};
};
export const initialState = (): WorkspaceState => { const conversation = newConversation(); return {activeConversationId: conversation.id, conversations: [conversation]}; };
export function loadState(): WorkspaceState { try { const raw = localStorage.getItem(key); if (!raw) return initialState(); const parsed = JSON.parse(raw) as WorkspaceState; return parsed.conversations?.length ? parsed : initialState(); } catch { return initialState(); } }
export function saveState(state: WorkspaceState) { localStorage.setItem(key, JSON.stringify(state)); }
export function updateConversation(state: WorkspaceState, id: string, update: (conversation: Conversation) => Conversation): WorkspaceState { return {...state, conversations: state.conversations.map(c => c.id === id ? update({...c, updatedAt: Date.now()}) : c)}; }

export function resolveApproval(conversation: Conversation, approvalId: string, decision: 'approve' | 'deny'): Conversation {
  const approval = conversation.approvals.find(item => item.id === approvalId);
  if (!approval || approval.status !== 'pending') return conversation;
  const next = approvalTransition(approval, decision);
  const run = conversation.runs.find(item => item.id === approval.runId);
  if (!run) return {...conversation, approvals: conversation.approvals.map(item => item.id === approvalId ? next : item)};
  const finalMessage: Message = {
    id: crypto.randomUUID(), role: 'assistant', agent: 'breakwater', createdAt: Date.now(),
    content: decision === 'approve'
      ? `Approval recorded. No external action was performed; the manager considers “${approval.action}” approved for a future side-effectful adapter.`
      : `Approval denied. The manager stopped this workflow before “${approval.action}”; no external action was performed.`,
    evidence: ['Local approval decision recorded'], uncertainties: [], blockers: decision === 'deny' ? ['Manager approval was denied.'] : [],
    proposedNextAction: decision === 'approve' ? 'Implement a side-effectful adapter only after explicit product review.' : 'Revise the proposal and request approval again if needed.',
  };
  return {
    ...conversation,
    approvals: conversation.approvals.map(item => item.id === approvalId ? next : item),
    runs: conversation.runs.map(item => item.id === run.id ? {...item, status: decision === 'approve' ? 'completed' : 'cancelled', finishedAt: Date.now()} : item),
    messages: [...conversation.messages, finalMessage],
    events: [...conversation.events, {id: crypto.randomUUID(), type: decision === 'approve' ? 'approved' : 'denied', text: decision === 'approve' ? 'Manager recorded approval and closed the local workflow.' : 'Manager recorded denial and closed the local workflow.', createdAt: Date.now(), owner: 'breakwater', objective: run.task, evidence: finalMessage.evidence, nextAction: finalMessage.proposedNextAction, approvalRequired: false}],
  };
}
