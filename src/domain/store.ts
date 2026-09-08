import {AgentId,Approval,RunStatus} from './crew';
export interface Message{id:string; role:'user'|'assistant'|'system'; agent?:AgentId; content:string; createdAt:number;}
export interface Run{id:string; agent:AgentId; status:RunStatus; task:string; createdAt:number;}
export interface Handoff{id:string; from:AgentId; to:AgentId; context:string; createdAt:number;}
export interface Event{id:string; type:string; text:string; createdAt:number;}
export interface WorkspaceState {conversationId:string; messages:Message[]; runs:Run[]; events:Event[]; handoffs:Handoff[]; approvals:Approval[];}
const key='brzrk-crew-state';
export const initialState=():WorkspaceState=>({conversationId:crypto.randomUUID(),messages:[],runs:[],events:[],handoffs:[],approvals:[]});
export function loadState():WorkspaceState {try{const raw=localStorage.getItem(key); return raw?JSON.parse(raw):initialState();}catch{return initialState();}}
export function saveState(state:WorkspaceState){localStorage.setItem(key,JSON.stringify(state));}
