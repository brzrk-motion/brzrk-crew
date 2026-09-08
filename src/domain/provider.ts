import {AgentId, agentById} from './crew';
export interface ProviderRequest {prompt:string; agent:AgentId; context:string;}
export interface ProviderResult {result:string; evidence:string[]; uncertainties:string[]; proposedNextAction:string; requiresApproval?:boolean;}
export interface ChatProvider {complete(request:ProviderRequest):Promise<ProviderResult>}
/** Deterministic local boundary. Replace this implementation with xAI Responses streaming later. */
export const mockProvider:ChatProvider={async complete({prompt,agent}){const name=agentById(agent).name; const clean=prompt.replace(/@\w+/g,'').trim(); const approval=/publish|send|delete|spend|production/i.test(clean); return {result:`${name} reviewed “${clean}”. The local mock completed this pass with a bounded, inspectable recommendation.`,evidence:['Mock run · deterministic local provider','No external tools or network calls'],uncertainties:['A real provider would need project-specific context.'],proposedNextAction:approval?'Request approval before taking the consequential step.':'Break the recommendation into the next verifiable local step.',requiresApproval:approval};}};
